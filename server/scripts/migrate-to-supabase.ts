/**
 * One-time (and safely repeatable) copy of the local CHICORA data store into
 * Supabase: categories, products, bookings, booking items, payments, the
 * published UPI QR code and every private payment screenshot.
 *
 *   npm run db:migrate
 *
 * Nothing is deleted locally, no payment status is changed, and existing rows
 * in Supabase are left alone (matched by id / booking reference / object path).
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { PAYMENT_PROOF_DIR, PAYMENT_QR_DIR, SUPABASE_BUCKETS } from '../config'
import { getLocalSnapshot } from '../db-local'
import { supabase } from '../supabase'
import type { Payment } from '../../shared/types'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

function mimeFor(file: string) {
  const ext = file.split('.').pop()?.toLowerCase() || ''
  return MIME[ext] || 'application/octet-stream'
}

async function main() {
  const db = supabase()
  const snapshot = await getLocalSnapshot()
  const problems: string[] = []

  console.log('Source: data/store.json')
  console.log(
    `  ${snapshot.categories.length} categories · ${snapshot.products.length} products · ` +
      `${snapshot.bookings.length} bookings · ${snapshot.payments.length} payments`,
  )

  // ---------------------------------------------------------------- categories
  const { data: existingCategories, error: categoryReadError } = await db.from('categories').select('id, slug')
  if (categoryReadError) throw new Error(`Could not read categories: ${categoryReadError.message}`)

  const categoryIdBySlug = new Map((existingCategories || []).map((row) => [row.slug as string, row.id as string]))
  const categoryIdMap = new Map<string, string>()

  for (const category of snapshot.categories) {
    const existingId = categoryIdBySlug.get(category.slug)
    if (existingId) {
      categoryIdMap.set(category.id, existingId)
      continue
    }
    const { error } = await db
      .from('categories')
      .insert({ id: category.id, name: category.name, slug: category.slug, created_at: category.created_at })
    if (error) {
      problems.push(`category ${category.name}: ${error.message}`)
      continue
    }
    categoryIdMap.set(category.id, category.id)
  }
  console.log(`✓ categories: ${categoryIdMap.size}/${snapshot.categories.length}`)

  // ------------------------------------------------------------------ products
  const productIdMap = new Map<string, string>()
  let productsWritten = 0
  for (const product of snapshot.products) {
    const categoryId = categoryIdMap.get(product.category_id)
    if (!categoryId) {
      problems.push(`product ${product.name}: category ${product.category_id} was not migrated`)
      continue
    }
    const { error } = await db.from('products').upsert(
      {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        discounted_price: product.discounted_price,
        category_id: categoryId,
        stock_quantity: product.stock_quantity,
        images: product.images,
        is_featured: product.is_featured,
        is_new_arrival: product.is_new_arrival,
        is_published: product.is_published,
        created_at: product.created_at,
        updated_at: product.updated_at,
      },
      { onConflict: 'id' },
    )
    if (error) {
      problems.push(`product ${product.name}: ${error.message}`)
      continue
    }
    productIdMap.set(product.id, product.id)
    productsWritten += 1
  }
  console.log(`✓ products: ${productsWritten}/${snapshot.products.length}`)

  // ------------------------------------------------------------------ bookings
  const { data: existingBookings, error: bookingReadError } = await db
    .from('bookings')
    .select('id, booking_reference')
  if (bookingReadError) throw new Error(`Could not read bookings: ${bookingReadError.message}`)

  const bookingsByReference = new Map(
    (existingBookings || []).map((row) => [row.booking_reference as string, row.id as string]),
  )

  let bookingsWritten = 0
  let bookingsSkipped = 0
  let paymentsWritten = 0

  for (const booking of snapshot.bookings) {
    if (bookingsByReference.has(booking.booking_reference)) {
      bookingsSkipped += 1
      continue
    }

    const { error } = await db.from('bookings').insert({
      id: booking.id,
      booking_reference: booking.booking_reference,
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone,
      customer_email: booking.customer_email,
      total_amount: booking.total_amount,
      advance_amount: booking.advance_amount,
      remaining_amount: booking.remaining_amount,
      payment_status: booking.payment_status,
      booking_status: booking.booking_status,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      pickup_date: booking.pickup_date,
      pickup_expires_at: booking.pickup_expires_at,
      hold_expires_at: booking.hold_expires_at,
      paid_at: booking.paid_at,
      rejection_reason: booking.rejection_reason,
    })
    if (error) {
      problems.push(`booking ${booking.booking_reference}: ${error.message}`)
      continue
    }

    const items = booking.items.map((item) => ({
      id: item.id,
      booking_id: booking.id,
      product_id: productIdMap.get(item.product_id) ?? null,
      product_name_snapshot: item.product_name_snapshot,
      unit_price: item.unit_price,
      quantity: Math.min(10, Math.max(1, item.quantity)),
      subtotal: item.subtotal,
    }))
    if (items.length) {
      const { error: itemsError } = await db.from('booking_items').insert(items)
      if (itemsError) problems.push(`items for ${booking.booking_reference}: ${itemsError.message}`)
    }

    const bookingPayments = snapshot.payments.filter((payment) => payment.booking_id === booking.id)
    for (const payment of bookingPayments) {
      const { error: paymentError } = await db.from('payments').insert({
        id: payment.id,
        booking_id: booking.id,
        amount: payment.amount,
        payment_status: payment.payment_status,
        upi_transaction_id: payment.upi_transaction_id,
        screenshot_path: payment.screenshot_file,
        verified_at: payment.verified_at,
        verified_by: payment.verified_by,
        rejection_reason: payment.rejection_reason,
        created_at: payment.created_at,
      })
      if (paymentError) {
        problems.push(`payment for ${booking.booking_reference}: ${paymentError.message}`)
        continue
      }
      paymentsWritten += 1
    }

    bookingsWritten += 1
  }
  console.log(`✓ bookings: ${bookingsWritten} copied, ${bookingsSkipped} already present`)
  console.log(`✓ payments: ${paymentsWritten} copied`)

  // -------------------------------------------------------------- UPI QR code
  const qrFile = snapshot.payment_settings.qr_image_file
  if (qrFile) {
    const localPath = path.join(PAYMENT_QR_DIR, qrFile)
    if (existsSync(localPath)) {
      const buffer = await fs.readFile(localPath)
      const objectPath = `qr/${qrFile}`
      const { error } = await db.storage
        .from(SUPABASE_BUCKETS.qr)
        .upload(objectPath, buffer, { contentType: mimeFor(qrFile), upsert: true, cacheControl: '60' })
      if (error) problems.push(`QR code: ${error.message}`)
      else {
        const { error: settingsError } = await db
          .from('payment_settings')
          .update({ qr_image_path: objectPath, updated_at: new Date().toISOString() })
          .eq('id', true)
        if (settingsError) problems.push(`QR settings: ${settingsError.message}`)
        else console.log('✓ UPI QR code uploaded to the payment-qr bucket')
      }
    } else {
      console.log('· no local QR image file found — upload one in Admin → Payment settings')
    }
  }

  // ---------------------------------------------------------- payment proofs
  let proofsUploaded = 0
  const proofPayments: Payment[] = snapshot.payments.filter((payment) => Boolean(payment.screenshot_file))
  for (const payment of proofPayments) {
    const file = payment.screenshot_file as string
    const localPath = path.join(PAYMENT_PROOF_DIR, path.basename(file))
    if (!existsSync(localPath)) {
      problems.push(`proof ${file}: file is missing on disk`)
      continue
    }
    const buffer = await fs.readFile(localPath)
    const objectPath = `proofs/${path.basename(file)}`
    const { error } = await db.storage
      .from(SUPABASE_BUCKETS.proofs)
      .upload(objectPath, buffer, { contentType: mimeFor(file), upsert: true, cacheControl: '0' })
    if (error) {
      problems.push(`proof ${file}: ${error.message}`)
      continue
    }
    const { error: updateError } = await db
      .from('payments')
      .update({ screenshot_path: objectPath })
      .eq('id', payment.id)
    if (updateError) {
      problems.push(`proof ${file} link: ${updateError.message}`)
      continue
    }
    proofsUploaded += 1
  }
  console.log(`✓ payment screenshots: ${proofsUploaded}/${proofPayments.length} uploaded (private bucket)`)

  if (problems.length) {
    console.error('\nFinished with problems:')
    for (const problem of problems) console.error('  ✗', problem)
    process.exitCode = 1
    return
  }
  console.log('\nMigration complete. Nothing was deleted locally and no payment status was changed.')
}

main().catch((error) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
