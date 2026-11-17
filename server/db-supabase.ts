import crypto from 'node:crypto'
import {
  ADVANCE_RATE,
  LOW_STOCK_THRESHOLD,
  PICKUP_HOLD_DAYS,
  SUPABASE_BUCKETS,
  VERIFICATION_HOLD_MINUTES,
  money,
} from './config'
import { HttpError } from './auth'
import { notifyBooking } from './events'
import { checkSupabaseConnection, mapDbError, mapStorageError, supabase } from './supabase'
import {
  applyBookingQuery,
  applyProductQuery,
  cleanCustomer,
  cleanRejectionReason,
  cleanUtr,
  computeQuote,
  TRANSITIONS,
  UPI_PATTERN,
  slugify,
  validateProductInput,
} from './db-local'
import type {
  AdminStats,
  Booking,
  BookingItem,
  BookingQuote,
  BookingStatus,
  Category,
  CreateBookingInput,
  Payment,
  PaymentSettingsPublic,
  Product,
} from '../shared/types'
import type { PaymentSettingsRecord, ProductInput, ProductQuery, StoreHealth } from './db-local'

/**
 * Supabase/PostgreSQL implementation of the CHICORA store.
 *
 * It exposes exactly the same functions as `db-local.ts`, so routes and the
 * checkout flow are identical whichever backend is configured. All money,
 * stock and payment-state decisions happen in Postgres (`reserve_booking`,
 * `verify_booking_payment`, `reject_booking_payment`,
 * `admin_set_booking_status`), never in the browser.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRODUCT_SELECT = '*, category:categories(name, slug)'
const BOOKING_SELECT = '*, items:booking_items(*), payments(*)'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

function db() {
  return supabase()
}

function isUuid(value: string) {
  return UUID_RE.test(value)
}

function normaliseExtension(ext: string) {
  const clean = ext.toLowerCase().replace(/^\\./, '')
  if (clean === 'jpeg') return 'jpg'
  return MIME_BY_EXT[clean] ? clean : 'jpg'
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// --- mappers ----------------------------------------------------------------
type Row = Record<string, any>

function toProduct(row: Row): Product {
  const category = row.category as { name?: string; slug?: string } | null | undefined
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    price: num(row.price),
    discounted_price: row.discounted_price === null || row.discounted_price === undefined ? null : num(row.discounted_price),
    category_id: String(row.category_id ?? ''),
    stock_quantity: num(row.stock_quantity),
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    is_featured: Boolean(row.is_featured),
    is_new_arrival: Boolean(row.is_new_arrival),
    is_published: Boolean(row.is_published),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
    category_name: category?.name,
    category_slug: category?.slug,
  }
}

function toItem(row: Row): BookingItem {
  return {
    id: String(row.id),
    booking_id: String(row.booking_id),
    product_id: row.product_id ? String(row.product_id) : '',
    product_name_snapshot: String(row.product_name_snapshot ?? ''),
    unit_price: num(row.unit_price),
    quantity: num(row.quantity),
    subtotal: num(row.subtotal),
  }
}

function toPayment(row: Row): Payment {
  return {
    id: String(row.id),
    booking_id: String(row.booking_id),
    amount: num(row.amount),
    payment_status: row.payment_status,
    upi_transaction_id: row.upi_transaction_id ?? null,
    screenshot_file: row.screenshot_path ?? null,
    has_screenshot: Boolean(row.screenshot_path),
    verified_at: row.verified_at ?? null,
    verified_by: row.verified_by ?? null,
    rejection_reason: row.rejection_reason ?? null,
    created_at: String(row.created_at ?? ''),
  }
}

function toBooking(row: Row): Booking {
  const items = Array.isArray(row.items) ? (row.items as Row[]) : []
  const payments = Array.isArray(row.payments) ? (row.payments as Row[]) : []
  return {
    id: String(row.id),
    booking_reference: String(row.booking_reference ?? ''),
    customer_name: String(row.customer_name ?? ''),
    customer_phone: String(row.customer_phone ?? ''),
    customer_email: row.customer_email ?? null,
    total_amount: num(row.total_amount),
    advance_amount: num(row.advance_amount),
    remaining_amount: num(row.remaining_amount),
    payment_status: row.payment_status,
    booking_status: row.booking_status,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
    pickup_date: row.pickup_date ?? null,
    pickup_expires_at: row.pickup_expires_at ?? null,
    hold_expires_at: row.hold_expires_at ?? null,
    paid_at: row.paid_at ?? null,
    rejection_reason: row.rejection_reason ?? null,
    items: items.map(toItem).sort((a, b) => a.product_name_snapshot.localeCompare(b.product_name_snapshot)),
    payments: payments
      .map(toPayment)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  }
}

function toSettings(row: Row): PaymentSettingsRecord {
  const updatedAt = String(row.updated_at ?? new Date().toISOString())
  return {
    upi_id: String(row.upi_id ?? ''),
    display_name: String(row.display_name || 'CHICORA'),
    qr_image_file: (row.qr_image_path as string | null) ?? null,
    qr_image_version: Date.parse(updatedAt) || 0,
    updated_at: updatedAt,
  }
}

// --- reads ------------------------------------------------------------------
async function fetchBookingBy(column: 'id' | 'booking_reference', value: string): Promise<Booking | null> {
  const { data, error } = await db().from('bookings').select(BOOKING_SELECT).eq(column, value).maybeSingle()
  if (error) mapDbError(error)
  return data ? toBooking(data) : null
}

async function findBooking(idOrReference: string): Promise<Booking | null> {
  if (isUuid(idOrReference)) return fetchBookingBy('id', idOrReference)
  return fetchBookingBy('booking_reference', idOrReference)
}

// --- categories -------------------------------------------------------------
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await db().from('categories').select('*').order('name', { ascending: true })
  if (error) mapDbError(error)
  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    created_at: String(row.created_at),
  }))
}

export async function createCategory(name: unknown): Promise<Category> {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
    throw new HttpError(400, 'Category name must be between 2 and 60 characters.')
  }
  const trimmed = name.trim()
  const slug = slugify(trimmed)
  if (!slug) throw new HttpError(400, 'That category name needs at least one letter or number.')

  const { data: existing, error: existingError } = await db()
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existingError) mapDbError(existingError)
  if (existing) throw new HttpError(409, 'A category with that name already exists.')

  const { data, error } = await db()
    .from('categories')
    .insert({ name: trimmed, slug })
    .select('*')
    .single()
  if (error) mapDbError(error)
  return {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    created_at: String(data.created_at),
  }
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isUuid(id)) throw new HttpError(404, 'Category not found.')
  const { count, error: countError } = await db()
    .from('products')
    .select('id', { head: true, count: 'exact' })
    .eq('category_id', id)
  if (countError) mapDbError(countError)
  if ((count ?? 0) > 0) throw new HttpError(409, 'This category still has products. Move or delete them first.')

  const { data, error } = await db().from('categories').delete().eq('id', id).select('id')
  if (error) mapDbError(error)
  if (!data || data.length === 0) throw new HttpError(404, 'Category not found.')
}

// --- products ---------------------------------------------------------------
export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  const { data, error } = await db().from('products').select(PRODUCT_SELECT)
  if (error) mapDbError(error)
  return applyProductQuery((data || []).map(toProduct), query)
}

export async function getProduct(id: string, includeUnpublished = false): Promise<Product | null> {
  if (!isUuid(id)) return null
  const { data, error } = await db().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle()
  if (error) mapDbError(error)
  if (!data) return null
  const product = toProduct(data)
  if (!product.is_published && !includeUnpublished) return null
  return product
}

async function assertCategory(categoryId: string) {
  if (!isUuid(categoryId)) throw new HttpError(400, 'Choose a category.')
  const { data, error } = await db().from('categories').select('id').eq('id', categoryId).maybeSingle()
  if (error) mapDbError(error)
  if (!data) throw new HttpError(400, 'Unknown category.')
}

export async function createProduct(input: Partial<ProductInput>): Promise<Product> {
  const clean = validateProductInput(input)
  await assertCategory(clean.category_id)
  const images = clean.images.length ? clean.images : ['/products/gift-box.svg']
  const { data, error } = await db()
    .from('products')
    .insert({
      name: clean.name,
      description: clean.description,
      price: clean.price,
      discounted_price: clean.discounted_price,
      category_id: clean.category_id,
      stock_quantity: clean.stock_quantity,
      images,
      is_featured: clean.is_featured,
      is_new_arrival: clean.is_new_arrival,
      is_published: clean.is_published,
    })
    .select('id')
    .single()
  if (error) mapDbError(error)
  const product = await getProduct(String(data.id), true)
  if (!product) throw new HttpError(500, 'The gift was saved but could not be read back.')
  return product
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  if (!isUuid(id)) throw new HttpError(404, 'Product not found.')
  const existing = await getProduct(id, true)
  if (!existing) throw new HttpError(404, 'Product not found.')
  const clean = validateProductInput(input, existing)
  await assertCategory(clean.category_id)
  const images = clean.images.length ? clean.images : existing.images
  const { error } = await db()
    .from('products')
    .update({
      name: clean.name,
      description: clean.description,
      price: clean.price,
      discounted_price: clean.discounted_price,
      category_id: clean.category_id,
      stock_quantity: clean.stock_quantity,
      images: images.length ? images : ['/products/gift-box.svg'],
      is_featured: clean.is_featured,
      is_new_arrival: clean.is_new_arrival,
      is_published: clean.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) mapDbError(error)
  const updated = await getProduct(id, true)
  if (!updated) throw new HttpError(404, 'Product not found.')
  return updated
}

export async function deleteProduct(id: string): Promise<void> {
  if (!isUuid(id)) throw new HttpError(404, 'Product not found.')
  const { data, error } = await db().from('products').delete().eq('id', id).select('id')
  if (error) mapDbError(error)
  if (!data || data.length === 0) throw new HttpError(404, 'Product not found.')
}

// --- quotes and bookings ----------------------------------------------------
export async function quoteItems(items: { productId: string; quantity: number }[]): Promise<BookingQuote> {
  const ids = Array.from(new Set((items || []).map((item) => String(item.productId || '')).filter(isUuid)))
  if (ids.length === 0) throw new HttpError(404, 'One of those products no longer exists.')
  const { data, error } = await db().from('products').select(PRODUCT_SELECT).in('id', ids)
  if (error) mapDbError(error)
  const byId = new Map((data || []).map((row) => [String(row.id), toProduct(row)]))
  const lines = (items || []).map((item) => {
    const product = byId.get(String(item.productId || ''))
    if (!product) throw new HttpError(404, 'One of those products no longer exists.')
    return { product, quantity: Number(item.quantity) || 1 }
  })
  return computeQuote(lines)
}

export async function createBooking(
  input: CreateBookingInput & { proofFile?: string | null },
): Promise<{ booking: Booking; quote: BookingQuote }> {
  const customer = cleanCustomer(input)
  const upiTransactionId = cleanUtr(input.upiTransactionId)
  const proofFile = input.proofFile ?? null
  const rawItems = Array.isArray(input.items) ? input.items : []
  if (rawItems.length === 0) throw new HttpError(400, 'Your reservation is empty.')
  if (rawItems.length > 10) {
    throw new HttpError(400, 'That is a lot of gifts — please book at most 10 different products.')
  }

  const wanted = new Map<string, number>()
  for (const item of rawItems) {
    const id = String(item?.productId || '')
    const qty = Number(item?.quantity)
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 10) {
      throw new HttpError(400, 'Quantities must be whole numbers between 1 and 10.')
    }
    if (!isUuid(id)) throw new HttpError(404, 'One of those gifts is no longer available.')
    wanted.set(id, (wanted.get(id) || 0) + qty)
  }

  // Postgres re-reads prices, checks stock under row locks, rejects duplicate
  // UTRs and records the payment as pending_verification. Totals are never
  // accepted from the browser.
  const { data, error } = await db().rpc('reserve_booking', {
    p_customer_name: customer.name,
    p_customer_phone: customer.phone,
    p_customer_email: customer.email,
    p_items: Array.from(wanted, ([productId, quantity]) => ({ productId, quantity })),
    p_advance_rate: ADVANCE_RATE,
    p_upi_transaction: upiTransactionId,
    p_screenshot_path: proofFile,
    p_hold_minutes: Math.max(5, Math.round(VERIFICATION_HOLD_MINUTES)),
  })
  if (error) mapDbError(error)

  const bookingId = data?.booking?.id ? String(data.booking.id) : ''
  const booking = bookingId ? await fetchBookingBy('id', bookingId) : null
  if (!booking) throw new HttpError(500, 'The reservation was saved but could not be read back.')

  const quote: BookingQuote = {
    lines: booking.items.map((item) => ({
      productId: item.product_id,
      name: item.product_name_snapshot,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    total: num(data?.total, booking.total_amount),
    advance: num(data?.advance, booking.advance_amount),
    remaining: num(data?.remaining, booking.remaining_amount),
  }

  notifyBooking('booking:created', booking)
  return { booking, quote }
}

export async function getBookingByReference(ref: string): Promise<Booking | null> {
  if (!ref) return null
  return fetchBookingBy('booking_reference', ref)
}

export async function listBookings(filter?: { status?: string; q?: string }): Promise<Booking[]> {
  const { data, error } = await db()
    .from('bookings')
    .select(BOOKING_SELECT)
    .order('created_at', { ascending: false })
  if (error) mapDbError(error)
  return applyBookingQuery((data || []).map(toBooking), filter)
}

export async function getBookingById(id: string): Promise<Booking | null> {
  if (!id) return null
  return findBooking(id)
}

export async function getBookingPayments(bookingId: string): Promise<Payment[]> {
  if (!isUuid(bookingId)) return []
  const { data, error } = await db()
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
  if (error) mapDbError(error)
  return (data || []).map(toPayment)
}

// --- UPI payment settings ---------------------------------------------------
const DEFAULT_SETTINGS = {
  upi_id: '',
  display_name: 'CHICORA',
  qr_image_path: null as string | null,
}

async function ensureSettingsRow(): Promise<PaymentSettingsRecord> {
  const { data, error } = await db().from('payment_settings').select('*').eq('id', true).maybeSingle()
  if (error) mapDbError(error)
  if (data) return toSettings(data)

  const { data: created, error: insertError } = await db()
    .from('payment_settings')
    .insert({ id: true, ...DEFAULT_SETTINGS })
    .select('*')
    .single()
  if (insertError) mapDbError(insertError)
  return toSettings(created)
}

export async function getPaymentSettingsRecord(): Promise<PaymentSettingsRecord> {
  return ensureSettingsRow()
}

export async function getPublicPaymentSettings(): Promise<PaymentSettingsPublic> {
  const settings = await ensureSettingsRow()
  return {
    upi_id: settings.upi_id,
    display_name: settings.display_name,
    // Served by this server: it redirects to the public Storage object, so the
    // checkout never needs the bucket path or a signed URL of its own.
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
  await ensureSettingsRow()
  const { error } = await db()
    .from('payment_settings')
    .update({ upi_id: upiId, display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) mapDbError(error)
  return ensureSettingsRow()
}

// --- Storage-backed assets --------------------------------------------------
export async function uploadPaymentQr(buffer: Buffer, ext: string): Promise<PaymentSettingsRecord> {
  const current = await ensureSettingsRow()
  const extension = normaliseExtension(ext)
  const objectPath = `qr/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`
  const bucket = db().storage.from(SUPABASE_BUCKETS.qr)

  const { error: uploadError } = await bucket.upload(objectPath, buffer, {
    contentType: MIME_BY_EXT[extension],
    cacheControl: '60',
    upsert: true,
  })
  if (uploadError) mapStorageError(uploadError)

  const { error } = await db()
    .from('payment_settings')
    .update({ qr_image_path: objectPath, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) {
    await bucket.remove([objectPath])
    mapDbError(error)
  }

  if (current.qr_image_file && current.qr_image_file !== objectPath) {
    await bucket.remove([current.qr_image_file])
  }
  return ensureSettingsRow()
}

export async function removePaymentQr(): Promise<PaymentSettingsRecord> {
  const current = await ensureSettingsRow()
  const { error } = await db()
    .from('payment_settings')
    .update({ qr_image_path: null, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) mapDbError(error)
  if (current.qr_image_file) {
    await db().storage.from(SUPABASE_BUCKETS.qr).remove([current.qr_image_file])
  }
  return ensureSettingsRow()
}

export async function paymentQrTarget() {
  const settings = await ensureSettingsRow()
  if (!settings.qr_image_file) return null
  const { data } = db().storage.from(SUPABASE_BUCKETS.qr).getPublicUrl(settings.qr_image_file)
  return { kind: 'url' as const, url: `${data.publicUrl}?v=${settings.qr_image_version}` }
}

/** Private bucket. The object path is never exposed to customers. */
export async function savePaymentProof(token: string, buffer: Buffer, ext: string): Promise<string> {
  const extension = normaliseExtension(ext)
  const objectPath = `proofs/${token}.${extension}`
  const { error } = await db().storage.from(SUPABASE_BUCKETS.proofs).upload(objectPath, buffer, {
    contentType: MIME_BY_EXT[extension],
    cacheControl: '0',
    upsert: false,
  })
  if (error) mapStorageError(error)
  return objectPath
}

export async function resolvePaymentProof(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const bucket = db().storage.from(SUPABASE_BUCKETS.proofs)
  for (const ext of ['png', 'jpg', 'webp']) {
    const name = `${token}.${ext}`
    const { data, error } = await bucket.list('proofs', { search: name, limit: 20 })
    if (error) mapStorageError(error)
    if ((data || []).some((object) => object.name === name)) return `proofs/${name}`
  }
  return null
}

/** Short-lived signed URL for the authenticated admin proof route. */
export async function paymentProofTarget(file: string | null) {
  if (!file) return null
  const { data, error } = await db()
    .storage.from(SUPABASE_BUCKETS.proofs)
    .createSignedUrl(file, 120)
  if (error) mapStorageError(error)
  if (!data?.signedUrl) return null
  return { kind: 'url' as const, url: data.signedUrl }
}

export async function uploadProductImage(buffer: Buffer, ext: string): Promise<string> {
  const extension = normaliseExtension(ext)
  const objectPath = `catalog/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`
  const bucket = db().storage.from(SUPABASE_BUCKETS.products)
  const { error } = await bucket.upload(objectPath, buffer, {
    contentType: MIME_BY_EXT[extension],
    cacheControl: '31536000',
    upsert: true,
  })
  if (error) mapStorageError(error)
  return bucket.getPublicUrl(objectPath).data.publicUrl
}

// --- admin payment decisions ------------------------------------------------
/** Only an admin (through an authenticated route) can reach this. */
export async function verifyBookingPayment(
  id: string,
): Promise<{ booking: Booking; alreadyVerified: boolean }> {
  const booking = await findBooking(id)
  if (!booking) throw new HttpError(404, 'Booking not found.')

  const { data, error } = await db().rpc('verify_booking_payment', {
    p_booking_id: booking.id,
    p_verified_by: 'admin',
    p_pickup_days: Math.max(1, Math.round(PICKUP_HOLD_DAYS)),
  })
  if (error) mapDbError(error)

  const updated = await fetchBookingBy('id', booking.id)
  if (!updated) throw new HttpError(404, 'Booking not found.')
  if (!data?.already_verified) notifyBooking('booking:updated', updated)
  return { booking: updated, alreadyVerified: Boolean(data?.already_verified) }
}

export async function rejectBookingPayment(id: string, reason: unknown): Promise<Booking> {
  const cleanReason = cleanRejectionReason(reason)
  const booking = await findBooking(id)
  if (!booking) throw new HttpError(404, 'Booking not found.')

  const { error } = await db().rpc('reject_booking_payment', {
    p_booking_id: booking.id,
    p_reason: cleanReason,
  })
  if (error) mapDbError(error)

  const updated = await fetchBookingBy('id', booking.id)
  if (!updated) throw new HttpError(404, 'Booking not found.')
  notifyBooking('booking:updated', updated)
  return updated
}

export async function setBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  if (!Object.keys(TRANSITIONS).includes(status)) throw new HttpError(400, 'Unknown booking status.')
  if (status === 'pending_verification') {
    throw new HttpError(400, 'Payments are submitted by the customer, not set by the shop.')
  }
  const booking = await findBooking(id)
  if (!booking) throw new HttpError(404, 'Booking not found.')
  if (booking.booking_status === status) return booking
  if (!TRANSITIONS[booking.booking_status].includes(status)) {
    throw new HttpError(
      409,
      `A ${booking.booking_status.replace(/_/g, ' ')} booking cannot become ${status.replace(/_/g, ' ')}.`,
    )
  }

  const { error } = await db().rpc('admin_set_booking_status', {
    p_booking_id: booking.id,
    p_status: status,
  })
  if (error) mapDbError(error)

  const updated = await fetchBookingBy('id', booking.id)
  if (!updated) throw new HttpError(404, 'Booking not found.')
  notifyBooking('booking:updated', updated)
  return updated
}

export async function expireStaleHolds(): Promise<number> {
  const { data, error } = await db().rpc('release_expired_holds')
  if (error) mapDbError(error)
  return Number(data) || 0
}

// --- reporting --------------------------------------------------------------
export async function getStats(): Promise<AdminStats> {
  const [productsResult, bookingsResult, paymentsResult] = await Promise.all([
    db().from('products').select('id, is_published, stock_quantity'),
    db().from('bookings').select('id, booking_status, remaining_amount'),
    db().from('payments').select('amount, payment_status'),
  ])
  if (productsResult.error) mapDbError(productsResult.error)
  if (bookingsResult.error) mapDbError(bookingsResult.error)
  if (paymentsResult.error) mapDbError(paymentsResult.error)

  const products = (productsResult.data || []) as Row[]
  const bookings = (bookingsResult.data || []) as Row[]
  const payments = (paymentsResult.data || []) as Row[]
  const published = products.filter((product) => product.is_published)

  const advanceVerified = payments
    .filter((payment) => payment.payment_status === 'verified')
    .reduce((sum, payment) => sum + num(payment.amount), 0)
  const advancePendingVerification = payments
    .filter((payment) => payment.payment_status === 'pending_verification')
    .reduce((sum, payment) => sum + num(payment.amount), 0)
  const revenueAtPickup = bookings
    .filter((booking) => ['confirmed', 'packed', 'ready_for_pickup', 'collected'].includes(booking.booking_status))
    .reduce((sum, booking) => sum + num(booking.remaining_amount), 0)

  return {
    totalProducts: products.length,
    availableProducts: published.filter((product) => num(product.stock_quantity) > 0).length,
    lowStockProducts: published.filter(
      (product) => num(product.stock_quantity) > 0 && num(product.stock_quantity) <= LOW_STOCK_THRESHOLD,
    ).length,
    outOfStockProducts: published.filter((product) => num(product.stock_quantity) === 0).length,
    totalBookings: bookings.length,
    awaitingPaymentBookings: bookings.filter((booking) => booking.booking_status === 'awaiting_payment').length,
    pendingVerificationBookings: bookings.filter((booking) => booking.booking_status === 'pending_verification')
      .length,
    confirmedBookings: bookings.filter((booking) =>
      ['confirmed', 'packed', 'ready_for_pickup'].includes(booking.booking_status),
    ).length,
    collectedBookings: bookings.filter((booking) => booking.booking_status === 'collected').length,
    rejectedBookings: bookings.filter((booking) => booking.booking_status === 'rejected').length,
    advanceVerified: money(advanceVerified),
    advancePendingVerification: money(advancePendingVerification),
    revenueAtPickup: money(revenueAtPickup),
  }
}

export async function lowStockProducts(): Promise<Product[]> {
  const products = await listProducts({ includeUnpublished: true })
  return products.filter((product) => product.stock_quantity <= LOW_STOCK_THRESHOLD)
}

// --- health -----------------------------------------------------------------
export async function checkDatabase(): Promise<StoreHealth> {
  const health = await checkSupabaseConnection()
  return { ok: health.ok, mode: 'supabase', detail: health.detail }
}
