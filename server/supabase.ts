import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  SUPABASE_BUCKETS,
  SUPABASE_ENABLED,
  SUPABASE_SECRET_KEY,
  SUPABASE_URL,
} from './config'
import { HttpError } from './auth'

/**
 * Server-only Supabase client.
 *
 * It is created with the project secret key, which bypasses row level security.
 * Everything that reaches the browser goes through the Express API, where the
 * admin session is checked first — this client is never imported by the Vite
 * bundle and the key is never serialised into a response.
 */
let client: SupabaseClient | null = null

export function isSupabaseEnabled() {
  return SUPABASE_ENABLED
}

export function supabase(): SupabaseClient {
  if (!SUPABASE_ENABLED) {
    throw new HttpError(503, 'The shop database is not configured on this server.')
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-application-name': 'chicora-server' } },
    })
  }
  return client
}

interface PostgrestErrorLike {
  message?: string
  code?: string
  details?: string
  hint?: string
}

const MESSAGE_MAP: { match: RegExp; status: number; message: string }[] = [
  {
    match: /DUPLICATE_UTR/,
    status: 409,
    message: 'That UPI transaction ID has already been submitted for another booking.',
  },
  {
    match: /INVALID_UTR/,
    status: 400,
    message: 'Enter the UPI transaction ID / UTR from your payment app — 8 to 40 letters and numbers.',
  },
  { match: /PRODUCT_UNAVAILABLE/, status: 404, message: 'One of those gifts is no longer available.' },
  { match: /BOOKING_NOT_FOUND/, status: 404, message: 'Booking not found.' },
  {
    match: /NOT_AWAITING_VERIFICATION/,
    status: 409,
    message: 'This payment is not awaiting verification.',
  },
  {
    match: /PAYMENT_ALREADY_VERIFIED/,
    status: 409,
    message: 'A verified payment cannot be rejected. Cancel the booking instead.',
  },
  {
    match: /PAYMENT_NOT_VERIFIED/,
    status: 409,
    message: 'The advance must be verified before this booking can be collected.',
  },
  { match: /INVALID_TRANSITION/, status: 409, message: 'That booking cannot move to this status.' },
  { match: /INVALID_ADMIN_STATUS/, status: 400, message: 'Unknown booking status.' },
  { match: /REASON_REQUIRED/, status: 400, message: 'Give a rejection reason between 3 and 300 characters.' },
  { match: /EMPTY_RESERVATION/, status: 400, message: 'Your reservation is empty.' },
  { match: /INVALID_QUANTITY/, status: 400, message: 'Quantities must be whole numbers between 1 and 10.' },
  {
    match: /TOO_MANY_PRODUCTS/,
    status: 400,
    message: 'That is a lot of gifts — please book at most 10 different products.',
  },
  { match: /INVALID_NAME/, status: 400, message: 'Please enter your full name.' },
  { match: /INVALID_PHONE/, status: 400, message: 'Please enter a valid phone number.' },
]

function looksUnreachable(message: string) {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|socket hang up|timeout/i.test(message)
}

/** Translate a PostgREST/Postgres error into an HttpError with a safe message. */
export function mapDbError(error: PostgrestErrorLike | null | undefined): never {
  if (!error) {
    throw new HttpError(500, 'Something went wrong on our side. Please try again.')
  }

  const message = String(error.message || '')
  const code = String(error.code || '')

  for (const entry of MESSAGE_MAP) {
    if (entry.match.test(message)) throw new HttpError(entry.status, entry.message)
  }

  const stock = message.match(/INSUFFICIENT_STOCK:(.*)$/)
  if (stock) {
    const name = stock[1]?.trim()
    throw new HttpError(409, name ? `There are not enough “${name}” left in the shop.` : 'Not enough stock left.')
  }

  if (code === '23505') {
    if (/utr|upi_transaction/i.test(message) || /utr/i.test(error.details || '')) {
      throw new HttpError(409, 'That UPI transaction ID has already been submitted for another booking.')
    }
    throw new HttpError(409, 'That record already exists.')
  }
  if (code === '23503') throw new HttpError(400, 'That item is still linked to something else.')
  if (code === '23514') throw new HttpError(400, 'Some of those values are not allowed.')
  if (code === '22P02') throw new HttpError(400, 'That identifier is not valid.')
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') {
    throw new HttpError(
      503,
      'The shop database is missing its tables. Run supabase/schema.sql in the Supabase SQL editor.',
    )
  }
  if (code === '42501') throw new HttpError(503, 'The shop database rejected this request (permission denied).')
  if (looksUnreachable(message)) {
    throw new HttpError(503, 'The shop database is unreachable right now. Please try again in a moment.')
  }

  console.error('[chicora] Supabase error:', { code, message, details: error.details, hint: error.hint })
  throw new HttpError(500, 'Something went wrong on our side. Please try again.')
}

export function mapStorageError(error: { message?: string } | null | undefined): never {
  const message = String(error?.message || '')
  if (looksUnreachable(message)) {
    throw new HttpError(503, 'Supabase Storage is unreachable right now. Please try again in a moment.')
  }
  if (/bucket/i.test(message) && /not found/i.test(message)) {
    throw new HttpError(
      503,
      'A Supabase Storage bucket is missing. Run supabase/schema.sql to create payment-qr, payment-proofs and product-images.',
    )
  }
  console.error('[chicora] Supabase storage error:', message)
  throw new HttpError(502, 'That file could not be stored right now. Please try again.')
}

export interface SupabaseHealth {
  ok: boolean
  mode: 'supabase'
  detail: string
  missingTables: string[]
  missingBuckets: string[]
}

const REQUIRED_TABLES = ['categories', 'products', 'payment_settings', 'bookings', 'booking_items', 'payments']

/**
 * Real connection check: reads one row from every table and lists the Storage
 * buckets. Never throws — the health endpoint and boot sequence report the result.
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealth> {
  if (!SUPABASE_ENABLED) {
    return {
      ok: false,
      mode: 'supabase',
      detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY are not both set.',
      missingTables: [],
      missingBuckets: [],
    }
  }

  const missingTables: string[] = []
  let detail = ''
  let reachable = true

  try {
    const db = supabase()
    for (const table of REQUIRED_TABLES) {
      // A real GET, not a HEAD: PostgREST answers HEAD with 204 even when the
      // relation does not exist, which would hide a missing schema.
      const { error } = await db.from(table).select('id').limit(1)
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') missingTables.push(table)
        else {
          reachable = false
          detail = error.message
        }
      }
    }
  } catch (error) {
    reachable = false
    detail = error instanceof Error ? error.message : 'The Supabase client could not be created.'
  }

  const missingBuckets: string[] = []
  if (reachable) {
    try {
      const { data, error } = await supabase().storage.listBuckets()
      if (error) {
        reachable = false
        detail = error.message
      } else {
        const names = new Set((data || []).map((bucket) => bucket.name))
        for (const bucket of Object.values(SUPABASE_BUCKETS)) {
          if (!names.has(bucket)) missingBuckets.push(bucket)
        }
      }
    } catch (error) {
      reachable = false
      detail = error instanceof Error ? error.message : 'Supabase Storage could not be reached.'
    }
  }

  const ok = reachable && missingTables.length === 0 && missingBuckets.length === 0
  if (!detail) {
    if (missingTables.length) detail = `Missing tables: ${missingTables.join(', ')}. Run supabase/schema.sql.`
    else if (missingBuckets.length) detail = `Missing Storage buckets: ${missingBuckets.join(', ')}. Run supabase/schema.sql.`
    else detail = `Connected to ${new URL(SUPABASE_URL).host} · ${REQUIRED_TABLES.length} tables · ${Object.keys(SUPABASE_BUCKETS).length} buckets`
  }

  return { ok, mode: 'supabase', detail, missingTables, missingBuckets }
}
