import crypto from 'node:crypto'
import type { Express, NextFunction, Request, Response } from 'express'
import express from 'express'
import multer from 'multer'
import {
  ADVANCE_RATE,
  LOW_STOCK_THRESHOLD,
  PICKUP_HOLD_DAYS,
  STORAGE_MODE,
  STORE,
  VERIFICATION_HOLD_MINUTES,
} from './config'
import {
  HttpError,
  checkLoginThrottle,
  clearAdminCookie,
  clearLoginAttempts,
  createSessionToken,
  isAdmin,
  recordFailedLogin,
  requireAdmin,
  setAdminCookie,
  verifyAccessCode,
} from './auth'
import {
  checkDatabase,
  createBooking,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  expireStaleHolds,
  getBookingById,
  getBookingByReference,
  getPaymentSettingsRecord,
  getProduct,
  getPublicPaymentSettings,
  getStats,
  listBookings,
  listCategories,
  listProducts,
  lowStockProducts,
  paymentProofTarget,
  paymentQrTarget,
  publicBooking,
  quoteItems,
  rejectBookingPayment,
  removePaymentQr,
  resolvePaymentProof,
  savePaymentProof,
  savePaymentSettings,
  setBookingStatus,
  updateProduct,
  uploadPaymentQr,
  uploadProductImage,
  verifyBookingPayment,
} from './db'
import { hub } from './events'
import type { BookingStatus, PublicConfig } from '../shared/types'

const ADMIN_STATUS_ACTIONS: BookingStatus[] = ['packed', 'ready_for_pickup', 'collected', 'cancelled']

function digits(value: string) {
  return value.replace(/\D/g, '')
}

function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin
  if (!origin) {
    // Non-browser clients (curl, server-side) have no Origin header.
    next()
    return
  }
  try {
    const host = new URL(origin).host
    if (host !== req.headers.host) {
      res.status(403).json({ error: 'Requests must come from the CHICORA site.' })
      return
    }
  } catch {
    res.status(403).json({ error: 'Invalid origin.' })
    return
  }
  next()
}

/**
 * Trust the bytes, not the multipart MIME header. Only PNG/JPEG/WebP are
 * accepted, so an uploaded "image" cannot become an HTML/SVG script.
 */
function detectImage(buffer: Buffer): { ext: 'png' | 'jpg' | 'webp'; mime: string } | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

function extensionForMime(mime: string) {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'jpg'
  }
}

const productUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files can be uploaded.'))
      return
    }
    cb(null, true)
  },
})

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

// Payment screenshots are uploaded before the booking exists. Limit how often
// an anonymous client can do that.
const proofUploads = new Map<string, number[]>()
function allowProofUpload(ip: string) {
  const now = Date.now()
  const recent = (proofUploads.get(ip) || []).filter((at) => now - at < 10 * 60_000)
  if (recent.length >= 8) return false
  recent.push(now)
  proofUploads.set(ip, recent)
  return true
}

const publicConfig: PublicConfig = {
  store: STORE,
  policy: {
    advanceRate: ADVANCE_RATE,
    verificationHoldMinutes: VERIFICATION_HOLD_MINUTES,
    pickupHoldDays: PICKUP_HOLD_DAYS,
  },
}

export function registerRoutes(app: Express) {
  app.use(express.json({ limit: '1.5mb' }))

  // ------------------------------------------------------------------ public
  let healthCache: { at: number; database: Awaited<ReturnType<typeof checkDatabase>> } | null = null
  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!healthCache || Date.now() - healthCache.at > 10_000) {
      healthCache = { at: Date.now(), database: await checkDatabase() }
    }
    const database = healthCache.database
    res.status(database.ok ? 200 : 503).json({
      ok: database.ok,
      mode: 'upi',
      storage: STORAGE_MODE,
      database: { mode: database.mode, detail: database.detail },
      time: new Date().toISOString(),
    })
  })

  app.get('/api/config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json(publicConfig)
  })

  app.get('/api/payment-settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ settings: await getPublicPaymentSettings() })
  })

  // Served by this server in both modes: local disk, or a redirect to the
  // public Supabase Storage object. The checkout only ever sees this URL.
  app.get('/api/payment/qr', async (_req, res) => {
    const target = await paymentQrTarget()
    if (!target) throw new HttpError(404, 'The shop has not uploaded a UPI QR code yet.')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (target.kind === 'url') {
      res.redirect(302, target.url)
      return
    }
    res.sendFile(target.path)
  })

  app.get('/api/categories', async (_req, res) => {
    res.json({ categories: await listCategories() })
  })

  app.get('/api/products', async (req, res) => {
    const q = req.query
    const products = await listProducts({
      q: typeof q.q === 'string' ? q.q : undefined,
      category: typeof q.category === 'string' ? q.category : undefined,
      minPrice: q.minPrice !== undefined ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice !== undefined ? Number(q.maxPrice) : undefined,
      inStock: q.inStock === '1' || q.inStock === 'true',
      featured: q.featured === '1' || q.featured === 'true',
      newArrival: q.new === '1' || q.new === 'true',
      sort: typeof q.sort === 'string' ? (q.sort as never) : undefined,
      limit: q.limit !== undefined ? Number(q.limit) : undefined,
    })
    res.json({ products })
  })

  app.get('/api/products/:id', async (req, res) => {
    const product = await getProduct(req.params.id)
    if (!product) throw new HttpError(404, 'That gift is not available.')
    res.json({ product })
  })

  app.post('/api/quote', sameOrigin, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (items.length === 0) throw new HttpError(400, 'Choose at least one gift.')
    const quote = await quoteItems(
      items.map((item: { productId: string; quantity: number }) => ({
        productId: String(item.productId || ''),
        quantity: Number(item.quantity) || 1,
      })),
    )
    res.json({ quote })
  })

  app.post('/api/booking-proof', sameOrigin, imageUpload.single('screenshot'), async (req, res) => {
    const ip = req.ip || 'unknown'
    if (!allowProofUpload(ip)) throw new HttpError(429, 'Too many screenshot uploads. Please try again later.')
    const file = req.file
    if (!file) throw new HttpError(400, 'Choose a payment screenshot to upload.')
    const detected = detectImage(file.buffer)
    if (!detected) throw new HttpError(400, 'Payment screenshots must be a PNG, JPEG or WebP image.')

    const token = crypto.randomBytes(16).toString('hex')
    await savePaymentProof(token, file.buffer, detected.ext)
    res.status(201).json({ token })
  })

  app.post('/api/bookings', sameOrigin, async (req, res) => {
    const body = req.body || {}
    const proofToken = body.proofToken ? String(body.proofToken) : null
    let proofFile: string | null = null
    if (proofToken) {
      if (!/^[a-f0-9]{32}$/.test(proofToken)) {
        throw new HttpError(400, 'That payment screenshot could not be attached. Please upload it again.')
      }
      proofFile = await resolvePaymentProof(proofToken)
      if (!proofFile) {
        throw new HttpError(400, 'Your payment screenshot has expired. Please upload it again.')
      }
    }

    // Prices, stock and the 10% advance are computed from the database here.
    const { booking, quote } = await createBooking({
      customerName: String(body.customerName || ''),
      customerPhone: String(body.customerPhone || ''),
      customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
      items: Array.isArray(body.items)
        ? body.items.map((item: { productId: string; quantity: number }) => ({
            productId: String(item.productId || ''),
            quantity: Number(item.quantity) || 0,
          }))
        : [],
      upiTransactionId: String(body.upiTransactionId || ''),
      proofToken,
      proofFile,
    })

    res.status(201).json({
      booking: publicBooking(booking),
      quote,
      payment: {
        mode: 'upi',
        amount: booking.advance_amount,
        currency: 'INR',
        status: 'pending_verification',
      },
    })
  })

  app.get('/api/bookings/:reference', async (req, res) => {
    const phone = typeof req.query.phone === 'string' ? digits(req.query.phone) : ''
    if (phone.length < 7) throw new HttpError(400, 'Enter the phone number used for this reservation.')
    const booking = await getBookingByReference(req.params.reference)
    if (!booking || digits(booking.customer_phone) !== phone) {
      throw new HttpError(404, 'We could not find a reservation with those details.')
    }
    res.json({ booking: publicBooking(booking) })
  })

  // ------------------------------------------------------------------- admin
  app.post('/api/admin/login', sameOrigin, (req, res) => {
    const ip = req.ip || 'unknown'
    if (!checkLoginThrottle(ip)) {
      throw new HttpError(429, 'Too many attempts. Try again in ten minutes.')
    }
    if (!verifyAccessCode(req.body?.code)) {
      recordFailedLogin(ip)
      throw new HttpError(401, 'That access code is not right.')
    }
    clearLoginAttempts(ip)
    setAdminCookie(res, createSessionToken())
    res.json({ authenticated: true })
  })

  app.post('/api/admin/logout', (req, res) => {
    clearAdminCookie(res)
    res.json({ authenticated: false })
  })

  app.get('/api/admin/session', (req, res) => {
    res.json({ authenticated: isAdmin(req) })
  })

  app.use('/api/admin', requireAdmin)

  app.get('/api/admin/stats', async (_req, res) => {
    const [stats, lowStock] = await Promise.all([getStats(), lowStockProducts()])
    res.json({ stats, lowStock, lowStockThreshold: LOW_STOCK_THRESHOLD })
  })

  app.get('/api/admin/products', async (_req, res) => {
    res.json({ products: await listProducts({ includeUnpublished: true }) })
  })

  app.post('/api/admin/products', sameOrigin, async (req, res) => {
    const product = await createProduct(req.body || {})
    res.status(201).json({ product })
  })

  app.patch('/api/admin/products/:id', sameOrigin, async (req, res) => {
    const product = await updateProduct(req.params.id, req.body || {})
    res.json({ product })
  })

  app.delete('/api/admin/products/:id', sameOrigin, async (req, res) => {
    await deleteProduct(req.params.id)
    res.json({ ok: true })
  })

  app.get('/api/admin/categories', async (_req, res) => {
    res.json({ categories: await listCategories() })
  })

  app.post('/api/admin/categories', sameOrigin, async (req, res) => {
    const category = await createCategory(req.body?.name)
    res.status(201).json({ category })
  })

  app.delete('/api/admin/categories/:id', sameOrigin, async (req, res) => {
    await deleteCategory(req.params.id)
    res.json({ ok: true })
  })

  // --- payment settings -----------------------------------------------------
  app.get('/api/admin/payment-settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ settings: await getPublicPaymentSettings() })
  })

  app.put('/api/admin/payment-settings', sameOrigin, async (req, res) => {
    await savePaymentSettings({
      upiId: req.body?.upiId,
      displayName: req.body?.displayName,
    })
    res.json({ settings: await getPublicPaymentSettings() })
  })

  app.post('/api/admin/payment-settings/qr', sameOrigin, imageUpload.single('qr'), async (req, res) => {
    const file = req.file
    if (!file) throw new HttpError(400, 'Choose a UPI QR code image to upload.')
    const detected = detectImage(file.buffer)
    if (!detected) throw new HttpError(400, 'The QR code must be a PNG, JPEG or WebP image.')

    await uploadPaymentQr(file.buffer, detected.ext)
    res.status(201).json({ settings: await getPublicPaymentSettings() })
  })

  app.delete('/api/admin/payment-settings/qr', sameOrigin, async (_req, res) => {
    await removePaymentQr()
    res.json({ settings: await getPublicPaymentSettings() })
  })

  // --- bookings -------------------------------------------------------------
  app.get('/api/admin/bookings', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    res.json({ bookings: await listBookings({ status, q }) })
  })

  app.patch('/api/admin/bookings/:id', sameOrigin, async (req, res) => {
    const status = String(req.body?.status || '') as BookingStatus
    if (!ADMIN_STATUS_ACTIONS.includes(status)) throw new HttpError(400, 'Unknown booking status.')
    const booking = await setBookingStatus(req.params.id, status)
    res.json({ booking })
  })

  app.post('/api/admin/bookings/:id/verify-payment', sameOrigin, async (req, res) => {
    const result = await verifyBookingPayment(req.params.id)
    res.json({ booking: result.booking, alreadyVerified: result.alreadyVerified })
  })

  app.post('/api/admin/bookings/:id/reject-payment', sameOrigin, async (req, res) => {
    const booking = await rejectBookingPayment(req.params.id, req.body?.reason)
    res.json({ booking })
  })

  app.get('/api/admin/bookings/:id/payment-proof', async (req, res) => {
    const booking = await getBookingById(req.params.id)
    if (!booking) throw new HttpError(404, 'Booking not found.')
    const payment = booking.payments[0]
    if (!payment?.screenshot_file) throw new HttpError(404, 'No screenshot was submitted for this booking.')
    const target = await paymentProofTarget(payment.screenshot_file)
    if (!target) throw new HttpError(404, 'The screenshot file is missing.')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', 'inline')
    if (target.kind === 'url') {
      // Short-lived signed URL from the private bucket, never a public link.
      res.redirect(302, target.url)
      return
    }
    res.sendFile(target.path)
  })

  app.post('/api/admin/upload', sameOrigin, productUpload.array('images', 6), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) || []
    if (files.length === 0) throw new HttpError(400, 'Choose at least one image.')
    const urls: string[] = []
    for (const file of files) {
      urls.push(await uploadProductImage(file.buffer, extensionForMime(file.mimetype)))
    }
    res.status(201).json({ urls })
  })

  app.get('/api/admin/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 4000\n\n')
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    hub.add(res)
    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25_000)
    req.on('close', () => {
      clearInterval(heartbeat)
      res.end()
    })
  })

  app.get('/api/admin/export/bookings.csv', async (_req, res) => {
    const bookings = await listBookings()
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      [
        'Booking ID',
        'Customer',
        'Phone',
        'Email',
        'Items',
        'Total',
        'Advance',
        'Remaining',
        'Payment',
        'UTR',
        'Screenshot',
        'Booking status',
        'Rejection reason',
        'Created',
        'Pickup by',
      ].map(esc),
      ...bookings.map((b) =>
        [
          b.booking_reference,
          b.customer_name,
          b.customer_phone,
          b.customer_email || '',
          b.items.map((i) => `${i.product_name_snapshot} x${i.quantity}`).join(' | '),
          b.total_amount,
          b.advance_amount,
          b.remaining_amount,
          b.payment_status,
          b.payments[0]?.upi_transaction_id || '',
          b.payments[0]?.screenshot_file ? 'submitted' : 'none',
          b.booking_status,
          b.rejection_reason || '',
          b.created_at,
          b.pickup_expires_at || '',
        ].map(esc),
      ),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="chicora-bookings.csv"')
    res.send(rows.map((row) => row.join(',')).join('\n'))
  })

  // -------------------------------------------------------------- error fallback
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` })
  })

  // Cleanup of abandoned verification holds.
  setInterval(() => {
    expireStaleHolds().catch((error) => console.error('[chicora] expiry sweep failed', error))
  }, 60_000).unref()
}
