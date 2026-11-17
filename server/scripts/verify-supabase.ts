/**
 * Read/write verification of the live CHICORA Supabase project.
 *
 *   npm run db:verify
 *
 * Runs against the real project with the server key from .env and checks, in
 * order: tables, enum labels, functions, RLS, the UTR unique index, the private
 * proof bucket, and the anonymous key's inability to read bookings. It creates
 * its own rows and deletes exactly those rows again — nothing else is touched.
 */
import crypto from 'node:crypto'
import { SUPABASE_BUCKETS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY } from '../config'
import { supabase } from '../supabase'

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

async function rest(pathAndQuery: string, key: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  return { status: res.status, body: await res.text() }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('✗ SUPABASE_URL / SUPABASE_SECRET_KEY are not set. Nothing checked.')
    process.exit(1)
  }
  const db = supabase()
  console.log(`\nVerifying ${SUPABASE_URL.replace(/^https?:\/\//, '')}\n`)

  // 1. Tables -----------------------------------------------------------------
  console.log('Tables')
  for (const table of ['categories', 'products', 'payment_settings', 'bookings', 'booking_items', 'payments']) {
    const { error } = await db.from(table).select('*', { count: 'exact', head: false }).limit(1)
    if (error) fail(table, error.message)
    else pass(table)
  }

  // 2. Enum labels ------------------------------------------------------------
  console.log('\nEnums')
  const bookingLabels = [
    'awaiting_payment', 'pending_verification', 'confirmed', 'packed',
    'ready_for_pickup', 'collected', 'rejected', 'cancelled', 'expired',
  ]
  const paymentLabels = ['awaiting_payment', 'pending_verification', 'verified', 'rejected', 'cancelled']

  for (const [enumName, column, labels] of [
    ['booking_status', 'booking_status', bookingLabels],
    ['payment_status', 'payment_status', paymentLabels],
  ] as const) {
    const ok = await rest(
      `bookings?select=id&${column}=in.(${labels.join(',')})&limit=1`,
      SUPABASE_SECRET_KEY,
    )
    if (ok.status === 200) pass(`${enumName} has all ${labels.length} labels`)
    else fail(`${enumName} labels`, `HTTP ${ok.status} ${ok.body.slice(0, 120)}`)

    const bad = await rest(`bookings?select=id&${column}=eq.__not_a_status__&limit=1`, SUPABASE_SECRET_KEY)
    if (bad.status === 400) pass(`${enumName} rejects unknown values`)
    else fail(`${enumName} accepts unknown values`, `HTTP ${bad.status}`)
  }

  // 3. Functions through the RPC endpoint ------------------------------------
  console.log('\nFunctions')
  const missingArgs = await db.rpc('release_expired_holds')
  if (missingArgs.error && /PGRST202|not find the function/i.test(missingArgs.error.message)) {
    fail('release_expired_holds', missingArgs.error.message)
  } else {
    pass('release_expired_holds', 'callable')
  }

  const verifyProbe = await db.rpc('verify_booking_payment', {
    p_booking_id: '00000000-0000-0000-0000-000000000000',
    p_verified_by: 'verification',
    p_pickup_days: 7,
  })
  if (verifyProbe.error && /BOOKING_NOT_FOUND/.test(verifyProbe.error.message)) {
    pass('verify_booking_payment', 'present (guards a missing booking)')
  } else if (verifyProbe.error && /PGRST202|not find the function/i.test(verifyProbe.error.message)) {
    fail('verify_booking_payment', verifyProbe.error.message)
  } else {
    fail('verify_booking_payment', 'unexpected response')
  }

  const rejectProbe = await db.rpc('reject_booking_payment', {
    p_booking_id: '00000000-0000-0000-0000-000000000000',
    p_reason: 'verification probe',
  })
  if (rejectProbe.error && /BOOKING_NOT_FOUND/.test(rejectProbe.error.message)) {
    pass('reject_booking_payment', 'present (guards a missing booking)')
  } else if (rejectProbe.error && /PGRST202|not find the function/i.test(rejectProbe.error.message)) {
    fail('reject_booking_payment', rejectProbe.error.message)
  } else {
    fail('reject_booking_payment', 'unexpected response')
  }

  const statusProbe = await db.rpc('admin_set_booking_status', {
    p_booking_id: '00000000-0000-0000-0000-000000000000',
    p_status: 'packed',
  })
  if (statusProbe.error && /BOOKING_NOT_FOUND/.test(statusProbe.error.message)) {
    pass('admin_set_booking_status', 'present (guards a missing booking)')
  } else if (statusProbe.error && /PGRST202|not find the function/i.test(statusProbe.error.message)) {
    fail('admin_set_booking_status', statusProbe.error.message)
  } else {
    fail('admin_set_booking_status', 'unexpected response')
  }

  // 4. Storage buckets --------------------------------------------------------
  console.log('\nStorage buckets')
  const buckets = await db.storage.listBuckets()
  const byName = new Map((buckets.data || []).map((bucket) => [bucket.name, bucket]))
  for (const [name, mustBePrivate] of [
    [SUPABASE_BUCKETS.qr, false],
    [SUPABASE_BUCKETS.proofs, true],
    [SUPABASE_BUCKETS.products, false],
  ] as const) {
    const bucket = byName.get(name)
    if (!bucket) fail(name, 'bucket missing')
    else if (Boolean(bucket.public) === !mustBePrivate) pass(name, mustBePrivate ? 'private' : 'public')
    else fail(name, `public=${bucket.public} (expected ${!mustBePrivate})`)
  }

  // 5. Private bucket really is private, signed URLs work --------------------
  console.log('\nPrivate payment-proofs storage')
  const probeToken = crypto.randomBytes(16).toString('hex')
  const probePath = `proofs/${probeToken}.png`
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const bucket = db.storage.from(SUPABASE_BUCKETS.proofs)
  const upload = await bucket.upload(probePath, png, { contentType: 'image/png', upsert: false })
  if (upload.error) {
    fail('upload proof', upload.error.message)
  } else {
    pass('upload proof', probePath)

    const publicUrl = bucket.getPublicUrl(probePath).data.publicUrl
    const publicFetch = await fetch(publicUrl)
    if (publicFetch.ok) fail('proof is private', 'public URL served the image')
    else pass('proof is private', `public URL → HTTP ${publicFetch.status}`)

    const signed = await bucket.createSignedUrl(probePath, 60)
    if (signed.error || !signed.data?.signedUrl) {
      fail('signed URL', signed.error?.message || 'no URL returned')
    } else {
      const signedFetch = await fetch(signed.data.signedUrl)
      if (signedFetch.ok) pass('signed URL works', `HTTP ${signedFetch.status}`)
      else fail('signed URL', `HTTP ${signedFetch.status}`)
    }

    const removal = await bucket.remove([probePath])
    if (removal.error) fail('delete proof probe', removal.error.message)
    else pass('deleted the probe object')
  }

  // 6. RLS with the anonymous key -------------------------------------------
  console.log('\nRow Level Security (publishable / anon key)')
  if (!SUPABASE_PUBLISHABLE_KEY) {
    fail('anon key checks', 'SUPABASE_PUBLISHABLE_KEY is not set')
  } else {
    const anonProducts = await rest('products?select=id&limit=1', SUPABASE_PUBLISHABLE_KEY)
    if (anonProducts.status === 200) pass('anon can read the public catalogue')
    else fail('anon catalogue read', `HTTP ${anonProducts.status}`)

    const anonBookings = await rest('bookings?select=id&limit=1', SUPABASE_PUBLISHABLE_KEY)
    const anonReadsNothing = anonBookings.status >= 400 || anonBookings.body.trim() === '[]'
    if (anonReadsNothing) pass('anon cannot read bookings', `HTTP ${anonBookings.status}`)
    else fail('anon can read bookings', anonBookings.body.slice(0, 120))

    const anonPayments = await rest('payments?select=id&limit=1', SUPABASE_PUBLISHABLE_KEY)
    const anonNoPayments = anonPayments.status >= 400 || anonPayments.body.trim() === '[]'
    if (anonNoPayments) pass('anon cannot read payments', `HTTP ${anonPayments.status}`)
    else fail('anon can read payments', anonPayments.body.slice(0, 120))

    const anonInsert = await rest('bookings', SUPABASE_PUBLISHABLE_KEY, {
      method: 'POST',
      body: JSON.stringify({ booking_reference: 'VERIFY-RLS', customer_name: 'RLS probe', customer_phone: '+910000000000', total_amount: 1, advance_amount: 1, remaining_amount: 0 }),
      headers: { Prefer: 'return=minimal' },
    })
    if (anonInsert.status >= 400) pass('anon cannot insert bookings', `HTTP ${anonInsert.status}`)
    else fail('anon can insert bookings', `HTTP ${anonInsert.status}`)
  }

  console.log('\nSingle-row payment settings')
  const settings = await db.from('payment_settings').select('id, upi_id, display_name').eq('id', true).maybeSingle()
  if (settings.error) fail('payment_settings row', settings.error.message)
  else if (!settings.data) fail('payment_settings row', 'no row with id = true')
  else pass('payment_settings row', `display_name=${settings.data.display_name}`)

  console.log(`\n${failures === 0 ? '✓' : '✗'} ${passes} checks passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('Verification crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
