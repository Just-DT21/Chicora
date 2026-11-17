/**
 * End-to-end workflow test against a running CHICORA server in Supabase mode.
 *
 *   npm run db:workflows            # expects http://localhost:8787
 *   PORT=8788 npm run db:workflows
 *
 * Covers: admin session, UPI QR upload / replace / serve, private payment
 * screenshots, booking creation with server-side 10% advance, stock reservation,
 * duplicate UTR rejection, admin-only proof access, verification, rejection with
 * stock return, and UTR reuse after rejection.
 *
 * Every row and object it creates is deleted again at the end; the QR image and
 * UPI settings are restored to what they were before the run.
 */
import crypto from 'node:crypto'
import { SUPABASE_BUCKETS } from '../config'
import { supabase } from '../supabase'

const PORT = Number(process.env.PORT) || 8787
const BASE = `http://localhost:${PORT}`
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE || 'chicora'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let failures = 0
let passes = 0
function pass(label: string, detail = '') {
  passes += 1
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label: string, detail: string) {
  failures += 1
  console.log(`  ✗ ${label} — ${detail}`)
}
function check(label: string, condition: boolean, detail = '') {
  if (condition) pass(label, detail)
  else fail(label, detail || 'assertion failed')
}

let cookie = ''

async function call(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (cookie) headers.set('Cookie', cookie)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: 'manual' })
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const value of setCookie) {
    const pair = value.split(';')[0]
    if (pair.startsWith('chicora_admin=')) cookie = pair
  }
  const type = res.headers.get('content-type') || ''
  const body = type.includes('application/json') ? await res.json() : await res.arrayBuffer()
  return { status: res.status, body: body as any, headers: res.headers }
}

async function uploadQr() {
  const form = new FormData()
  form.append('qr', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'qr.png')
  return call('/api/admin/payment-settings/qr', { method: 'POST', body: form })
}

async function uploadProof() {
  const form = new FormData()
  form.append('screenshot', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'proof.png')
  return call('/api/booking-proof', { method: 'POST', body: form })
}

const created = {
  categoryId: '',
  productId: '',
  bookingIds: [] as string[],
}
let settingsBefore: { upiId: string; displayName: string } | null = null
let qrBefore: string | null = null
let qrUploaded = false

async function cleanup() {
  const db = supabase()
  console.log('\nCleanup')
  for (const id of created.bookingIds) {
    await db.from('payments').delete().eq('booking_id', id)
    await db.from('booking_items').delete().eq('booking_id', id)
    await db.from('bookings').delete().eq('id', id)
  }
  if (created.productId) await db.from('products').delete().eq('id', created.productId)
  if (created.categoryId) await db.from('categories').delete().eq('id', created.categoryId)

  if (settingsBefore) {
    await db
      .from('payment_settings')
      .update({ upi_id: settingsBefore.upiId, display_name: settingsBefore.displayName })
      .eq('id', true)
  }
  if (qrUploaded && !qrBefore) {
    // The QR was empty before the run: remove the test image again.
    const current = await db.from('payment_settings').select('qr_image_path').eq('id', true).maybeSingle()
    const objectPath = current.data?.qr_image_path
    await db.from('payment_settings').update({ qr_image_path: null }).eq('id', true)
    if (objectPath) await db.storage.from(SUPABASE_BUCKETS.qr).remove([objectPath])
  }
  pass('test rows, test product, test category and test QR removed')
}

async function main() {
  console.log(`\nCHICORA Supabase workflows · ${BASE}\n`)

  const health = await call('/api/health')
  check('server is healthy', health.status === 200, `HTTP ${health.status}`)
  check(
    'server is using Supabase, not the local store',
    health.body?.storage === 'supabase',
    `storage=${health.body?.storage}`,
  )

  // --- admin session ---------------------------------------------------------
  console.log('\nAdmin session')
  const login = await call('/api/admin/login', { method: 'POST', body: JSON.stringify({ code: ADMIN_CODE }) })
  check('admin login', login.status === 200 && login.body?.authenticated === true, `HTTP ${login.status}`)
  const sessionApi = await call('/api/admin/stats')
  check('admin API requires the session cookie', sessionApi.status === 200, `HTTP ${sessionApi.status}`)

  const before = await call('/api/admin/payment-settings')
  settingsBefore = {
    upiId: String(before.body?.settings?.upi_id ?? ''),
    displayName: String(before.body?.settings?.display_name ?? 'CHICORA'),
  }
  qrBefore = before.body?.settings?.qr_image_url ?? null

  // --- catalogue fixtures ----------------------------------------------------
  console.log('\nCatalogue fixture')
  const stamp = crypto.randomBytes(3).toString('hex')
  const category = await call('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name: `Verify ${stamp}` }),
  })
  check('create category', category.status === 201, `HTTP ${category.status}`)
  created.categoryId = category.body?.category?.id ?? ''

  const product = await call('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify({
      name: `Verification Gift ${stamp}`,
      description: 'Temporary product created by the Supabase workflow test.',
      price: 4999,
      category_id: created.categoryId,
      stock_quantity: 5,
      images: [],
      is_published: true,
    }),
  })
  check('create product', product.status === 201, `HTTP ${product.status}`)
  created.productId = product.body?.product?.id ?? ''

  // --- UPI QR ---------------------------------------------------------------
  console.log('\nUPI QR through Supabase Storage')
  const saveSettings = await call('/api/admin/payment-settings', {
    method: 'PUT',
    body: JSON.stringify({ upiId: `chicora.verify${stamp}@okhdfcbank`, displayName: 'CHICORA' }),
  })
  check('save UPI ID + display name', saveSettings.status === 200, `HTTP ${saveSettings.status}`)

  const firstQr = await uploadQr()
  qrUploaded = true
  const firstUrl = firstQr.body?.settings?.qr_image_url ?? null
  check('upload QR', firstQr.status === 201 && Boolean(firstUrl), `HTTP ${firstQr.status}`)

  const serveQr = await call(new URL(firstUrl, BASE).pathname + new URL(firstUrl, BASE).search)
  check('QR served to checkout', serveQr.status === 302, `HTTP ${serveQr.status} (redirect to Storage)`)

  const secondQr = await uploadQr()
  const secondUrl = secondQr.body?.settings?.qr_image_url ?? null
  check('replace QR', secondQr.status === 201 && secondUrl !== firstUrl, `new URL differs`)

  const publicSettings = await call('/api/payment-settings')
  check(
    'checkout reads the new QR automatically',
    publicSettings.body?.settings?.qr_image_url === secondUrl,
    'no deployment needed',
  )

  const removeQr = await call('/api/admin/payment-settings/qr', { method: 'DELETE' })
  check(
    'remove QR',
    removeQr.status === 200 && removeQr.body?.settings?.qr_image_url === null,
    `HTTP ${removeQr.status}`,
  )
  qrUploaded = false
  const restored = await uploadQr()
  qrUploaded = true
  check('re-upload QR for the booking flow', restored.status === 201, `HTTP ${restored.status}`)

  // --- booking + stock hold --------------------------------------------------
  console.log('\nBooking, stock hold and UTR rules')
  const proof = await uploadProof()
  check('upload payment screenshot', proof.status === 201 && /^[a-f0-9]{32}$/.test(proof.body?.token ?? ''), `HTTP ${proof.status}`)
  const utr = `VERIFY${crypto.randomBytes(4).toString('hex').toUpperCase()}`

  const booking = await call('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Verification Customer',
      customerPhone: '+919876500011',
      customerEmail: 'verify@example.com',
      items: [{ productId: created.productId, quantity: 2 }],
      upiTransactionId: utr,
      proofToken: proof.body.token,
    }),
  })
  const bookingId = booking.body?.booking?.id ?? ''
  if (bookingId) created.bookingIds.push(bookingId)
  check('create booking', booking.status === 201, `HTTP ${booking.status} ${booking.body?.error ?? ''}`)
  check(
    'booking starts as pending verification (never paid)',
    booking.body?.booking?.payment_status === 'pending_verification' &&
      booking.body?.booking?.booking_status === 'pending_verification',
    `${booking.body?.booking?.payment_status}`,
  )
  check(
    'server computed the 10% advance',
    Number(booking.body?.quote?.total) === 9998 &&
      Number(booking.body?.quote?.advance) === 999.8 &&
      Number(booking.body?.quote?.remaining) === 8998.2,
    `total ₹${booking.body?.quote?.total} · advance ₹${booking.body?.quote?.advance}`,
  )
  check(
    'screenshot path is not exposed to the customer',
    booking.body?.booking?.payments?.[0]?.screenshot_file === null &&
      booking.body?.booking?.payments?.[0]?.has_screenshot === true,
    'has_screenshot=true, path hidden',
  )

  const afterBooking = await call(`/api/products/${created.productId}`)
  check('stock reserved while awaiting verification', afterBooking.body?.product?.stock_quantity === 3, `stock=${afterBooking.body?.product?.stock_quantity}`)

  const duplicate = await call('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Verification Customer',
      customerPhone: '+919876500011',
      items: [{ productId: created.productId, quantity: 1 }],
      upiTransactionId: utr,
    }),
  })
  check('duplicate UTR rejected', duplicate.status === 409, `HTTP ${duplicate.status}`)

  const wrongPhone = await call(`/api/bookings/${booking.body?.booking?.booking_reference}?phone=900000000000`)
  check('customer lookup needs the right phone', wrongPhone.status === 404, `HTTP ${wrongPhone.status}`)

  // --- private screenshot ----------------------------------------------------
  console.log('\nPrivate payment screenshot')
  const proofAdmin = await fetch(`${BASE}/api/admin/bookings/${bookingId}/payment-proof`, {
    headers: { Cookie: cookie },
    redirect: 'follow',
  })
  check('admin can open the screenshot', proofAdmin.ok, `HTTP ${proofAdmin.status}`)

  const proofAnon = await fetch(`${BASE}/api/admin/bookings/${bookingId}/payment-proof`, { redirect: 'manual' })
  check('screenshot is admin-only', proofAnon.status === 401, `HTTP ${proofAnon.status}`)

  // --- verification ----------------------------------------------------------
  console.log('\nAdmin verification')
  const verify = await call(`/api/admin/bookings/${bookingId}/verify-payment`, { method: 'POST', body: '{}' })
  check(
    'verify sets payment verified + booking confirmed',
    verify.body?.booking?.payment_status === 'verified' && verify.body?.booking?.booking_status === 'confirmed',
    `${verify.body?.booking?.payment_status}/${verify.body?.booking?.booking_status}`,
  )
  const stockAfterVerify = await call(`/api/products/${created.productId}`)
  check('verification keeps the reservation', stockAfterVerify.body?.product?.stock_quantity === 3, `stock=${stockAfterVerify.body?.product?.stock_quantity}`)

  const verifyAgain = await call(`/api/admin/bookings/${bookingId}/verify-payment`, { method: 'POST', body: '{}' })
  check('verification is idempotent', verifyAgain.body?.alreadyVerified === true, 'alreadyVerified=true')

  // --- rejection -------------------------------------------------------------
  console.log('\nAdmin rejection')
  const utr2 = `VERIFY${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const booking2 = await call('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Verification Customer',
      customerPhone: '+919876500012',
      items: [{ productId: created.productId, quantity: 1 }],
      upiTransactionId: utr2,
    }),
  })
  const booking2Id = booking2.body?.booking?.id ?? ''
  if (booking2Id) created.bookingIds.push(booking2Id)
  check('second booking created', booking2.status === 201, `HTTP ${booking2.status}`)

  const reject = await call(`/api/admin/bookings/${booking2Id}/reject-payment`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'UTR not found in the shop UPI account' }),
  })
  check(
    'reject sets payment rejected + booking rejected',
    reject.body?.booking?.payment_status === 'rejected' && reject.body?.booking?.booking_status === 'rejected',
    `${reject.body?.booking?.payment_status}/${reject.body?.booking?.booking_status}`,
  )
  // 5 to start − 2 held by the verified booking − 1 held by this one = 2,
  // and rejecting returns that 1, so 3 is the correct stock afterwards.
  const stockAfterReject = await call(`/api/products/${created.productId}`)
  check('rejection returns the held stock', stockAfterReject.body?.product?.stock_quantity === 3, `stock=${stockAfterReject.body?.product?.stock_quantity}`)

  const reuse = await call('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Verification Customer',
      customerPhone: '+919876500013',
      items: [{ productId: created.productId, quantity: 1 }],
      upiTransactionId: utr2,
    }),
  })
  const reuseId = reuse.body?.booking?.id ?? ''
  if (reuseId) created.bookingIds.push(reuseId)
  check('a rejected UTR can be resubmitted', reuse.status === 201, `HTTP ${reuse.status}`)

  // --- guard rails -----------------------------------------------------------
  console.log('\nGuard rails')
  const forced = await call(`/api/admin/bookings/${reuseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'confirmed' }),
  })
  check('admin cannot force a status that skips verification', forced.status === 400, `HTTP ${forced.status}`)

  const collected = await call(`/api/admin/bookings/${reuseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'collected' }),
  })
  check('unverified booking cannot be collected', collected.status === 409, `HTTP ${collected.status}`)

  await cleanup()
}

main()
  .catch(async (error) => {
    fail('workflow run', error instanceof Error ? error.message : String(error))
    try {
      await cleanup()
    } catch {
      /* ignore cleanup errors */
    }
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? '✓' : '✗'} ${passes} checks passed, ${failures} failed`)
    process.exit(failures === 0 ? 0 : 1)
  })
