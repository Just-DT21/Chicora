import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  ADVANCE_RATE,
  DB_FILE,
  LOW_STOCK_THRESHOLD,
  PAYMENT_PROOF_DIR,
  PAYMENT_QR_DIR,
  PICKUP_HOLD_DAYS,
  UPLOAD_DIR,
  VERIFICATION_HOLD_MINUTES,
  money,
} from './config'
import { SEED_CATEGORIES, seedProducts } from './seed'
import { HttpError } from './auth'
import { notifyBooking } from './events'
import type {
  AdminStats,
  Booking,
  BookingItem,
  BookingQuote,
  BookingQuoteLine,
  BookingStatus,
  Category,
  CreateBookingInput,
  Payment,
  PaymentSettingsPublic,
  PaymentStatus,
  Product,
} from '../shared/types'

export interface PaymentSettingsRecord {
  upi_id: string
  display_name: string
  qr_image_file: string | null
  qr_image_version: number
  updated_at: string
}

interface DB {
  categories: Category[]
  products: Product[]
  bookings: Booking[]
  payments: Payment[]
  payment_settings: PaymentSettingsRecord
  seeded_at: string
}

type ProductRow = Omit<Product, 'category_name' | 'category_slug'>

let db: DB | null = null
let mutationChain: Promise<unknown> = Promise.resolve()
let writeChain: Promise<unknown> = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

function defaultPaymentSettings(): PaymentSettingsRecord {
  return {
    upi_id: '',
    display_name: 'CHICORA',
    qr_image_file: null,
    qr_image_version: 0,
    updated_at: nowIso(),
  }
}

function seedDb(): DB {
  const seededAt = nowIso()
  const categories: Category[] = SEED_CATEGORIES.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    created_at: seededAt,
  }))
  const products: Product[] = seedProducts(categories).map((p, i) => ({
    ...p,
    id: crypto.randomUUID(),
    updated_at: p.created_at,
    images: p.images,
    // stable-ish ordering for the "newest" sort
    created_at: new Date(Date.parse(p.created_at) + i * 1000).toISOString(),
  }))
  return {
    categories,
    products,
    bookings: [],
    payments: [],
    payment_settings: defaultPaymentSettings(),
    seeded_at: seededAt,
  }
}

function migrateLegacyPayments(database: DB) {
  for (const booking of database.bookings) {
    const bookingStatus = booking.booking_status as string
    const paymentStatus = booking.payment_status as string
    if (bookingStatus === 'pending_payment') booking.booking_status = 'awaiting_payment'
    if (paymentStatus === 'pending') booking.payment_status = 'awaiting_payment'
    else if (paymentStatus === 'paid' || paymentStatus === 'test_mode') booking.payment_status = 'verified'
    else if (paymentStatus === 'failed') booking.payment_status = 'rejected'
    booking.rejection_reason ??= null
    booking.payments ??= []
  }
  for (const payment of database.payments) {
    const legacy = payment as Payment & { gateway_payment_id?: string | null; payment_method?: string | null }
    const paymentStatus = payment.payment_status as string
    if (paymentStatus === 'pending') payment.payment_status = 'awaiting_payment'
    else if (paymentStatus === 'paid' || paymentStatus === 'test_mode') payment.payment_status = 'verified'
    else if (paymentStatus === 'failed') payment.payment_status = 'rejected'
    payment.upi_transaction_id ??= legacy.gateway_payment_id ?? null
    payment.screenshot_file ??= null
    payment.verified_at ??= payment.payment_status === 'verified' ? payment.created_at : null
    payment.verified_by ??= payment.payment_status === 'verified' ? 'legacy import' : null
    payment.rejection_reason ??= null
  }
}

async function load(): Promise<DB> {
  if (db) return db
  try {
    if (!existsSync(DB_FILE)) {
      db = seedDb()
      await persist()
      return db
    }
    const raw = await fs.readFile(DB_FILE, 'utf8')
    const parsed = JSON.parse(raw) as DB
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.categories)) {
      throw new Error('store.json is missing required collections')
    }
    parsed.bookings ??= []
    parsed.payments ??= []
    parsed.payment_settings ??= defaultPaymentSettings()
    migrateLegacyPayments(parsed)
    db = parsed
    return db
  } catch (error) {
    console.error('[chicora] Could not load the data store:', error)
    throw error
  }
}

async function persist() {
  if (!db) return
  const snapshot = JSON.stringify(db, null, 2)
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      const tmp = `${DB_FILE}.${process.pid}.tmp`
      await fs.writeFile(tmp, snapshot, 'utf8')
      await fs.rename(tmp, DB_FILE)
    })
  await writeChain
}

/** Serialises every mutation so stock checks cannot race inside the process. */
async function mutate<T>(fn: (database: DB) => T | Promise<T>): Promise<T> {
  const run = mutationChain.then(async () => {
    const database = await load()
    const result = await fn(database)
    await persist()
    return result
  })
  mutationChain = run.catch(() => undefined)
  return run
}

function decorate(dbx: DB, product: ProductRow | Product): Product {
  const category = dbx.categories.find((c) => c.id === product.category_id)
  return { ...product, category_name: category?.name, category_slug: category?.slug }
}

export function effectivePrice(product: Pick<Product, 'price' | 'discounted_price'>) {
  return money(product.discounted_price && product.discounted_price > 0 ? product.discounted_price : product.price)
}

// --- categories -------------------------------------------------------------
export async function listCategories(): Promise<Category[]> {
  const database = await load()
  return [...database.categories].sort((a, b) => a.name.localeCompare(b.name))
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function createCategory(name: unknown): Promise<Category> {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
    throw new HttpError(400, 'Category name must be between 2 and 60 characters.')
  }
  return mutate((database) => {
    const slug = slugify(name)
    if (!slug) throw new HttpError(400, 'That category name needs at least one letter or number.')
    if (database.categories.some((c) => c.slug === slug)) {
      throw new HttpError(409, 'A category with that name already exists.')
    }
    const category: Category = { id: crypto.randomUUID(), name: name.trim(), slug, created_at: nowIso() }
    database.categories.push(category)
    return category
  })
}

export async function deleteCategory(id: string): Promise<void> {
  await mutate((database) => {
    const used = database.products.some((p) => p.category_id === id)
    if (used) throw new HttpError(409, 'This category still has products. Move or delete them first.')
    const before = database.categories.length
    database.categories = database.categories.filter((c) => c.id !== id)
    if (database.categories.length === before) throw new HttpError(404, 'Category not found.')
  })
}

// --- products ---------------------------------------------------------------
export interface ProductQuery {
  q?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  featured?: boolean
  newArrival?: boolean
  sort?: 'featured' | 'newest' | 'price_asc' | 'price_desc'
  includeUnpublished?: boolean
  limit?: number
}

/**
 * Pure query engine shared with the Supabase store so filtering and sorting
 * behave identically whichever database is configured.
 */
export function applyProductQuery(all: Product[], query: ProductQuery = {}): Product[] {
  let rows = all
  if (!query.includeUnpublished) rows = rows.filter((p) => p.is_published)

  const q = (query.q || '').trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q),
    )
  }
  if (query.category && query.category !== 'all') {
    rows = rows.filter((p) => p.category_slug === query.category || p.category_id === query.category)
  }
  if (typeof query.minPrice === 'number' && Number.isFinite(query.minPrice)) {
    rows = rows.filter((p) => effectivePrice(p) >= query.minPrice!)
  }
  if (typeof query.maxPrice === 'number' && Number.isFinite(query.maxPrice)) {
    rows = rows.filter((p) => effectivePrice(p) <= query.maxPrice!)
  }
  if (query.inStock) rows = rows.filter((p) => p.stock_quantity > 0)
  if (query.featured) rows = rows.filter((p) => p.is_featured)
  if (query.newArrival) rows = rows.filter((p) => p.is_new_arrival)

  const sort = query.sort || 'featured'
  rows.sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return effectivePrice(a) - effectivePrice(b)
      case 'price_desc':
        return effectivePrice(b) - effectivePrice(a)
      case 'newest':
        return Date.parse(b.created_at) - Date.parse(a.created_at)
      default: {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
        if (a.stock_quantity === 0 !== (b.stock_quantity === 0)) return a.stock_quantity === 0 ? 1 : -1
        return Date.parse(b.created_at) - Date.parse(a.created_at)
      }
    }
  })

  if (query.limit && query.limit > 0) rows = rows.slice(0, query.limit)
  return rows
}

export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  const database = await load()
  return applyProductQuery(
    database.products.map((p) => decorate(database, p)),
    query,
  )
}

export async function getProduct(id: string, includeUnpublished = false): Promise<Product | null> {
  const database = await load()
  const row = database.products.find((p) => p.id === id || p.id === id.toLowerCase())
  if (!row) return null
  if (!row.is_published && !includeUnpublished) return null
  return decorate(database, row)
}

export interface ProductInput {
  name: string
  description: string
  price: number
  discounted_price?: number | null
  category_id: string
  stock_quantity: number
  images: string[]
  is_featured?: boolean
  is_new_arrival?: boolean
  is_published?: boolean
}

function validateImages(images: unknown): string[] {
  if (!Array.isArray(images)) throw new HttpError(400, 'Images must be a list.')
  const out: string[] = []
  for (const raw of images) {
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    if (!/^(https?:\/\/|\/|data:image\/(png|jpe?g|webp|gif|svg\+xml);)/.test(value)) {
      throw new HttpError(400, 'Image links must be http(s) URLs, uploaded files, or data images.')
    }
    if (value.length > 500_000) throw new HttpError(400, 'That image is too large.')
    out.push(value)
    if (out.length >= 8) break
  }
  return out
}

export function validateProductInput(input: Partial<ProductInput>, existing?: ProductRow): Required<ProductInput> {
  const name = (input.name ?? existing?.name ?? '').toString().trim()
  if (name.length < 2 || name.length > 140) throw new HttpError(400, 'Product name must be 2–140 characters.')
  const description = (input.description ?? existing?.description ?? '').toString().trim()
  if (description.length < 10) throw new HttpError(400, 'Description should be at least 10 characters.')

  const price = Number(input.price ?? existing?.price)
  if (!Number.isFinite(price) || price <= 0 || price > 5_000_000) {
    throw new HttpError(400, 'Price must be a positive amount.')
  }
  let discounted: number | null = null
  const rawDiscounted = input.discounted_price !== undefined ? input.discounted_price : existing?.discounted_price
  if (rawDiscounted !== null && rawDiscounted !== undefined) {
    const d = Number(rawDiscounted)
    if (!Number.isFinite(d) || d < 0) throw new HttpError(400, 'Sale price must be zero or more.')
    if (d >= price) throw new HttpError(400, 'Sale price must be lower than the original price.')
    discounted = money(d)
  }

  const stock = Number(input.stock_quantity ?? existing?.stock_quantity)
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
    throw new HttpError(400, 'Stock must be a whole number of zero or more.')
  }
  const categoryId = (input.category_id ?? existing?.category_id ?? '').toString()
  if (!categoryId) throw new HttpError(400, 'Choose a category.')

  return {
    name,
    description,
    price: money(price),
    discounted_price: discounted,
    category_id: categoryId,
    stock_quantity: stock,
    images: validateImages(input.images ?? existing?.images ?? []),
    is_featured: Boolean(input.is_featured ?? existing?.is_featured),
    is_new_arrival: Boolean(input.is_new_arrival ?? existing?.is_new_arrival),
    is_published: input.is_published !== undefined ? Boolean(input.is_published) : existing?.is_published ?? true,
  }
}

export async function createProduct(input: Partial<ProductInput>): Promise<Product> {
  const clean = validateProductInput(input)
  return mutate((database) => {
    if (!database.categories.some((c) => c.id === clean.category_id)) throw new HttpError(400, 'Unknown category.')
    const stamp = nowIso()
    const product: ProductRow = { ...clean, id: crypto.randomUUID(), created_at: stamp, updated_at: stamp }
    if (product.images.length === 0) product.images = ['/products/gift-box.svg']
    database.products.unshift(product)
    return decorate(database, product)
  })
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return mutate((database) => {
    const index = database.products.findIndex((p) => p.id === id)
    if (index === -1) throw new HttpError(404, 'Product not found.')
    const existing = database.products[index]
    const clean = validateProductInput(input, existing)
    if (!database.categories.some((c) => c.id === clean.category_id)) throw new HttpError(400, 'Unknown category.')
    const updated: ProductRow = { ...existing, ...clean, updated_at: nowIso() }
    if (updated.images.length === 0) updated.images = existing.images.length ? existing.images : ['/products/gift-box.svg']
    database.products[index] = updated
    return decorate(database, updated)
  })
}

export async function deleteProduct(id: string): Promise<void> {
  await mutate((database) => {
    const before = database.products.length
    database.products = database.products.filter((p) => p.id !== id)
    if (database.products.length === before) throw new HttpError(404, 'Product not found.')
  })
}

// --- bookings ---------------------------------------------------------------
function withRelations(database: DB, booking: Booking): Booking {
  return {
    ...booking,
    items: database.bookings.find((b) => b.id === booking.id)?.items ?? booking.items ?? [],
    payments: database.payments
      .filter((p) => p.booking_id === booking.id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  }
}

function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let tail = ''
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `CHC-${Date.now().toString(36).toUpperCase().slice(-5)}${tail}`
}

export function computeQuote(lines: { product: Product; quantity: number }[]): BookingQuote {
  const quoteLines: BookingQuoteLine[] = lines.map(({ product, quantity }) => {
    const unitPrice = effectivePrice(product)
    return {
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity,
      subtotal: money(unitPrice * quantity),
    }
  })
  const total = money(quoteLines.reduce((sum, line) => sum + line.subtotal, 0))
  const advance = money(total * ADVANCE_RATE)
  return { lines: quoteLines, total, advance, remaining: money(total - advance) }
}

export async function quoteItems(items: { productId: string; quantity: number }[]): Promise<BookingQuote> {
  const database = await load()
  const lines = (items || []).map((item) => {
    const product = database.products.find((p) => p.id === item.productId)
    if (!product) throw new HttpError(404, 'One of those products no longer exists.')
    return { product: decorate(database, product), quantity: item.quantity }
  })
  return computeQuote(lines)
}

export function cleanCustomer(input: CreateBookingInput) {
  const name = String(input.customerName || '').trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 90) throw new HttpError(400, 'Please enter your full name.')
  const phoneRaw = String(input.customerPhone || '').trim()
  const digits = phoneRaw.replace(/[^\d]/g, '')
  if (digits.length < 7 || digits.length > 15 || !/^[\d+\s()-]+$/.test(phoneRaw)) {
    throw new HttpError(400, 'Please enter a valid phone number.')
  }
  const email = String(input.customerEmail || '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.')
  return { name, phone: phoneRaw, email: email || null }
}

export function cleanUtr(raw: unknown) {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!/^[A-Z0-9]{8,40}$/.test(value)) {
    throw new HttpError(
      400,
      'Enter the UPI transaction ID / UTR from your payment app — 8 to 40 letters and numbers.',
    )
  }
  return value
}

export async function createBooking(
  input: CreateBookingInput & { proofFile?: string | null },
): Promise<{ booking: Booking; quote: BookingQuote }> {
  const customer = cleanCustomer(input)
  const upiTransactionId = cleanUtr(input.upiTransactionId)
  const proofFile = input.proofFile ?? null
  const rawItems = Array.isArray(input.items) ? input.items : []
  if (rawItems.length === 0) throw new HttpError(400, 'Your reservation is empty.')
  if (rawItems.length > 10) throw new HttpError(400, 'That is a lot of gifts — please book at most 10 different products.')

  const wanted = new Map<string, number>()
  for (const item of rawItems) {
    const id = String(item?.productId || '')
    const qty = Number(item?.quantity)
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 10) {
      throw new HttpError(400, 'Quantities must be whole numbers between 1 and 10.')
    }
    wanted.set(id, (wanted.get(id) || 0) + qty)
  }

  return mutate((database) => {
    const duplicate = database.payments.find(
      (p) =>
        p.upi_transaction_id &&
        p.upi_transaction_id.toUpperCase() === upiTransactionId &&
        p.payment_status !== 'rejected' &&
        p.payment_status !== 'cancelled',
    )
    if (duplicate) {
      throw new HttpError(409, 'That UPI transaction ID has already been submitted for another booking.')
    }

    const resolved: { product: ProductRow; quantity: number }[] = []
    for (const [productId, quantity] of wanted) {
      const product = database.products.find((p) => p.id === productId)
      if (!product || !product.is_published) throw new HttpError(404, 'One of those gifts is no longer available.')
      if (product.stock_quantity < quantity) {
        throw new HttpError(409, `Only ${product.stock_quantity} of “${product.name}” left in the shop.`)
      }
      resolved.push({ product, quantity })
    }

    // Reserve stock now so two customers can never book the last box.
    for (const { product, quantity } of resolved) product.stock_quantity -= quantity

    const quote = computeQuote(
      resolved.map(({ product, quantity }) => ({ product: decorate(database, product), quantity })),
    )
    const stamp = new Date()
    const hold = new Date(stamp.getTime() + VERIFICATION_HOLD_MINUTES * 60_000)
    const booking: Booking = {
      id: crypto.randomUUID(),
      booking_reference: reference(),
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_email: customer.email,
      total_amount: quote.total,
      advance_amount: quote.advance,
      remaining_amount: quote.remaining,
      payment_status: 'pending_verification',
      booking_status: 'pending_verification',
      created_at: stamp.toISOString(),
      updated_at: stamp.toISOString(),
      pickup_date: null,
      pickup_expires_at: null,
      hold_expires_at: hold.toISOString(),
      paid_at: null,
      rejection_reason: null,
      items: quote.lines.map((line): BookingItem => ({
        id: crypto.randomUUID(),
        booking_id: '',
        product_id: line.productId,
        product_name_snapshot: line.name,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        subtotal: line.subtotal,
      })),
      payments: [],
    }
    for (const item of booking.items) item.booking_id = booking.id

    const payment: Payment = {
      id: crypto.randomUUID(),
      booking_id: booking.id,
      amount: quote.advance,
      payment_status: 'pending_verification',
      upi_transaction_id: upiTransactionId,
      screenshot_file: proofFile,
      verified_at: null,
      verified_by: null,
      rejection_reason: null,
      created_at: stamp.toISOString(),
    }

    database.bookings.unshift(booking)
    database.payments.unshift(payment)
    booking.payments = [payment]
    notifyBooking('booking:created', booking)
    return { booking: withRelations(database, booking), quote }
  })
}

export async function getBookingByReference(ref: string): Promise<Booking | null> {
  const database = await load()
  const booking = database.bookings.find((b) => b.booking_reference === ref)
  return booking ? withRelations(database, booking) : null
}

/** Pure booking filter shared with the Supabase store. */
export function applyBookingQuery(rows: Booking[], filter?: { status?: string; q?: string }): Booking[] {
  if (filter?.status && filter.status !== 'all') rows = rows.filter((b) => b.booking_status === filter.status)
  const q = (filter?.q || '').trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (b) =>
        b.booking_reference.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        b.items.some((i) => i.product_name_snapshot.toLowerCase().includes(q)),
    )
  }
  return rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function listBookings(filter?: { status?: string; q?: string }): Promise<Booking[]> {
  const database = await load()
  return applyBookingQuery(
    database.bookings.map((b) => withRelations(database, b)),
    filter,
  )
}

// --- UPI payment settings ---------------------------------------------------
export const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/

export function cleanRejectionReason(reason: unknown): string {
  const clean = String(reason ?? '').trim().replace(/\s+/g, ' ')
  if (clean.length < 3 || clean.length > 300) {
    throw new HttpError(400, 'Give a rejection reason between 3 and 300 characters.')
  }
  return clean
}

export async function getPaymentSettingsRecord(): Promise<PaymentSettingsRecord> {
  const database = await load()
  return { ...database.payment_settings }
}

export async function getPublicPaymentSettings(): Promise<PaymentSettingsPublic> {
  const settings = await getPaymentSettingsRecord()
  return {
    upi_id: settings.upi_id,
    display_name: settings.display_name,
    qr_image_url: settings.qr_image_file ? `/api/payment/qr?v=${settings.qr_image_version}` : null,
    updated_at: settings.updated_at,
  }
}

export async function savePaymentSettings(input: {
  upiId: unknown
  displayName: unknown
}): Promise<PaymentSettingsRecord> {
  const upiId = String(input.upiId ?? '').trim()
  const displayName = String(input.displayName ?? '').trim().replace(/\s+/g, ' ')
  if (upiId && !UPI_PATTERN.test(upiId)) {
    throw new HttpError(400, 'Enter a valid UPI ID, for example chicora@okhdfcbank.')
  }
  if (displayName.length < 2 || displayName.length > 60) {
    throw new HttpError(400, 'Payment display name must be between 2 and 60 characters.')
  }
  return mutate((database) => {
    database.payment_settings.upi_id = upiId
    database.payment_settings.display_name = displayName
    database.payment_settings.updated_at = nowIso()
    return { ...database.payment_settings }
  })
}

export async function setPaymentQr(file: string | null): Promise<PaymentSettingsRecord> {
  return mutate((database) => {
    database.payment_settings.qr_image_file = file
    database.payment_settings.qr_image_version = Date.now()
    database.payment_settings.updated_at = nowIso()
    return { ...database.payment_settings }
  })
}

/** Strip storage filenames from anything a customer can read. */
export function publicBooking(booking: Booking): Booking {
  return {
    ...booking,
    payments: booking.payments.map((payment) => ({
      ...payment,
      screenshot_file: null,
      has_screenshot: Boolean(payment.screenshot_file),
    })),
  }
}

function findBooking(database: DB, id: string) {
  return database.bookings.find((b) => b.id === id || b.booking_reference === id)
}

function paymentFor(database: DB, bookingId: string): Payment | undefined {
  return database.payments.find((p) => p.booking_id === bookingId)
}

/** Admin-only: the customer's submitted UPI payment is genuinely verified. */
export async function verifyBookingPayment(id: string): Promise<{ booking: Booking; alreadyVerified: boolean }> {
  return mutate((database) => {
    const booking = findBooking(database, id)
    if (!booking) throw new HttpError(404, 'Booking not found.')
    if (booking.payment_status === 'verified') {
      return { booking: withRelations(database, booking), alreadyVerified: true }
    }
    if (booking.payment_status !== 'pending_verification' || booking.booking_status !== 'pending_verification') {
      throw new HttpError(409, 'This payment is not awaiting verification.')
    }
    const payment = paymentFor(database, booking.id)
    if (!payment || payment.payment_status !== 'pending_verification') {
      throw new HttpError(409, 'There is no pending payment to verify.')
    }

    const stamp = new Date()
    payment.payment_status = 'verified'
    payment.verified_at = stamp.toISOString()
    payment.verified_by = 'admin'

    booking.payment_status = 'verified'
    booking.booking_status = 'confirmed'
    booking.paid_at = stamp.toISOString()
    booking.updated_at = stamp.toISOString()
    booking.hold_expires_at = null
    booking.pickup_date = stamp.toISOString()
    booking.pickup_expires_at = new Date(stamp.getTime() + PICKUP_HOLD_DAYS * 86_400_000).toISOString()
    booking.rejection_reason = null

    notifyBooking('booking:updated', withRelations(database, booking))
    return { booking: withRelations(database, booking), alreadyVerified: false }
  })
}

/** Admin-only: reject the submitted proof, release the hold and record why. */
export async function rejectBookingPayment(id: string, reason: unknown): Promise<Booking> {
  const cleanReason = cleanRejectionReason(reason)
  return mutate((database) => {
    const booking = findBooking(database, id)
    if (!booking) throw new HttpError(404, 'Booking not found.')
    if (booking.payment_status === 'verified') {
      throw new HttpError(409, 'A verified payment cannot be rejected. Cancel the booking instead.')
    }
    if (booking.payment_status !== 'pending_verification') {
      throw new HttpError(409, 'This payment is not awaiting verification.')
    }
    for (const item of booking.items) {
      const product = database.products.find((p) => p.id === item.product_id)
      if (product) product.stock_quantity += item.quantity
    }
    const stamp = new Date()
    const payment = paymentFor(database, booking.id)
    if (payment) {
      payment.payment_status = 'rejected'
      payment.rejection_reason = cleanReason
      payment.verified_at = null
      payment.verified_by = null
    }
    booking.payment_status = 'rejected'
    booking.booking_status = 'rejected'
    booking.rejection_reason = cleanReason
    booking.hold_expires_at = null
    booking.updated_at = stamp.toISOString()
    notifyBooking('booking:updated', withRelations(database, booking))
    return withRelations(database, booking)
  })
}

export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  awaiting_payment: ['pending_verification', 'cancelled', 'expired'],
  pending_verification: ['cancelled', 'expired'],
  confirmed: ['packed', 'ready_for_pickup', 'collected', 'cancelled'],
  packed: ['ready_for_pickup', 'collected', 'cancelled'],
  ready_for_pickup: ['collected', 'cancelled'],
  collected: [],
  rejected: [],
  cancelled: [],
  expired: [],
}

export async function setBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  if (!Object.keys(TRANSITIONS).includes(status)) throw new HttpError(400, 'Unknown booking status.')
  if (status === 'pending_verification') {
    throw new HttpError(400, 'Payments are submitted by the customer, not set by the shop.')
  }
  return mutate((database) => {
    const booking = findBooking(database, id)
    if (!booking) throw new HttpError(404, 'Booking not found.')
    if (booking.booking_status === status) return withRelations(database, booking)
    if (!TRANSITIONS[booking.booking_status].includes(status)) {
      throw new HttpError(409, `A ${booking.booking_status.replace(/_/g, ' ')} booking cannot become ${status.replace(/_/g, ' ')}.`)
    }
    const releasingStock = status === 'cancelled' || status === 'expired'
    if (releasingStock) {
      for (const item of booking.items) {
        const product = database.products.find((p) => p.id === item.product_id)
        if (product) product.stock_quantity += item.quantity
      }
      const payment = paymentFor(database, booking.id)
      if (payment && payment.payment_status !== 'verified') {
        payment.payment_status = 'cancelled'
      }
      booking.hold_expires_at = null
    }
    if (status === 'collected') {
      if (booking.payment_status !== 'verified') {
        throw new HttpError(409, 'The advance must be verified before this booking can be collected.')
      }
    }
    booking.booking_status = status
    booking.updated_at = nowIso()
    notifyBooking('booking:updated', withRelations(database, booking))
    return withRelations(database, booking)
  })
}

export async function expireStaleHolds(): Promise<number> {
  const database = await load()
  const holding = database.bookings.some(
    (b) => b.booking_status === 'pending_verification' || b.booking_status === 'awaiting_payment',
  )
  if (!holding) return 0
  let count = 0
  await mutate((database2) => {
    const now = Date.now()
    for (const booking of database2.bookings) {
      if (booking.booking_status !== 'pending_verification' && booking.booking_status !== 'awaiting_payment') continue
      if (!booking.hold_expires_at || Date.parse(booking.hold_expires_at) > now) continue
      for (const item of booking.items) {
        const product = database2.products.find((p) => p.id === item.product_id)
        if (product) product.stock_quantity += item.quantity
      }
      const payment = paymentFor(database2, booking.id)
      if (payment && payment.payment_status !== 'verified') payment.payment_status = 'cancelled'
      booking.booking_status = 'expired'
      booking.hold_expires_at = null
      booking.updated_at = new Date(now).toISOString()
      count += 1
      notifyBooking('booking:updated', withRelations(database2, booking))
    }
  })
  return count
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const database = await load()
  const booking = findBooking(database, id)
  return booking ? withRelations(database, booking) : null
}

export async function getStats(): Promise<AdminStats> {
  const database = await load()
  const published = database.products.filter((p) => p.is_published)
  const advanceVerified = database.payments
    .filter((p) => p.payment_status === 'verified')
    .reduce((sum, p) => sum + p.amount, 0)
  const advancePendingVerification = database.payments
    .filter((p) => p.payment_status === 'pending_verification')
    .reduce((sum, p) => sum + p.amount, 0)
  const revenueAtPickup = database.bookings
    .filter((b) => ['confirmed', 'packed', 'ready_for_pickup', 'collected'].includes(b.booking_status))
    .reduce((sum, b) => sum + b.remaining_amount, 0)
  return {
    totalProducts: database.products.length,
    availableProducts: published.filter((p) => p.stock_quantity > 0).length,
    lowStockProducts: published.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= LOW_STOCK_THRESHOLD).length,
    outOfStockProducts: published.filter((p) => p.stock_quantity === 0).length,
    totalBookings: database.bookings.length,
    awaitingPaymentBookings: database.bookings.filter((b) => b.booking_status === 'awaiting_payment').length,
    pendingVerificationBookings: database.bookings.filter((b) => b.booking_status === 'pending_verification').length,
    confirmedBookings: database.bookings.filter((b) =>
      ['confirmed', 'packed', 'ready_for_pickup'].includes(b.booking_status),
    ).length,
    collectedBookings: database.bookings.filter((b) => b.booking_status === 'collected').length,
    rejectedBookings: database.bookings.filter((b) => b.booking_status === 'rejected').length,
    advanceVerified: money(advanceVerified),
    advancePendingVerification: money(advancePendingVerification),
    revenueAtPickup: money(revenueAtPickup),
  }
}

export async function getBookingPayments(bookingId: string): Promise<Payment[]> {
  const database = await load()
  return database.payments.filter((p) => p.booking_id === bookingId)
}

export async function lowStockProducts(): Promise<Product[]> {
  const products = await listProducts({ includeUnpublished: true })
  return products.filter((p) => p.stock_quantity <= LOW_STOCK_THRESHOLD)
}

// --- binary assets (local disk) ----------------------------------------------
// The Supabase store implements the same functions against Storage buckets, so
// routes never need to know which backend is active.

export type BinaryTarget =
  | { kind: 'file'; path: string }
  | { kind: 'url'; url: string }

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])

function safeExtension(ext: string): string {
  const normalised = ext.toLowerCase().replace(/^\./, '')
  if (normalised === 'jpeg') return 'jpg'
  return IMAGE_EXTENSIONS.has(normalised) ? normalised : 'jpg'
}

export async function uploadPaymentQr(buffer: Buffer, ext: string): Promise<PaymentSettingsRecord> {
  const settings = await getPaymentSettingsRecord()
  const filename = `upi-qr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${safeExtension(ext)}`
  await fs.writeFile(path.join(PAYMENT_QR_DIR, filename), buffer)
  const record = await setPaymentQr(filename)
  if (settings.qr_image_file && settings.qr_image_file !== filename) {
    await fs.unlink(path.join(PAYMENT_QR_DIR, settings.qr_image_file)).catch(() => undefined)
  }
  return record
}

export async function removePaymentQr(): Promise<PaymentSettingsRecord> {
  const settings = await getPaymentSettingsRecord()
  const record = await setPaymentQr(null)
  if (settings.qr_image_file) {
    await fs.unlink(path.join(PAYMENT_QR_DIR, settings.qr_image_file)).catch(() => undefined)
  }
  return record
}

export async function paymentQrTarget(): Promise<BinaryTarget | null> {
  const settings = await getPaymentSettingsRecord()
  if (!settings.qr_image_file) return null
  const filePath = path.join(PAYMENT_QR_DIR, settings.qr_image_file)
  if (!existsSync(filePath)) return null
  return { kind: 'file', path: filePath }
}

export async function savePaymentProof(token: string, buffer: Buffer, ext: string): Promise<string> {
  const filename = `${token}.${safeExtension(ext)}`
  await fs.writeFile(path.join(PAYMENT_PROOF_DIR, filename), buffer)
  return filename
}

export async function resolvePaymentProof(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  for (const ext of ['png', 'jpg', 'webp']) {
    const name = `${token}.${ext}`
    if (existsSync(path.join(PAYMENT_PROOF_DIR, name))) return name
  }
  return null
}

export async function paymentProofTarget(file: string | null): Promise<BinaryTarget | null> {
  if (!file) return null
  const filePath = path.join(PAYMENT_PROOF_DIR, path.basename(file))
  if (!existsSync(filePath)) return null
  return { kind: 'file', path: filePath }
}

export async function uploadProductImage(buffer: Buffer, ext: string): Promise<string> {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${safeExtension(ext)}`
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer)
  return `/uploads/${name}`
}

export interface StoreHealth {
  ok: boolean
  mode: 'local' | 'supabase'
  detail: string
}

export async function checkDatabase(): Promise<StoreHealth> {
  try {
    const database = await load()
    return {
      ok: true,
      mode: 'local',
      detail: `${database.products.length} products · ${database.bookings.length} bookings · data/store.json`,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'local',
      detail: error instanceof Error ? error.message : 'The local data store could not be read.',
    }
  }
}

/** Read-only snapshot used by the one-time Supabase migration script. */
export async function getLocalSnapshot(): Promise<DB> {
  return load()
}
