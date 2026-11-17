import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const here = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(here, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const PAYMENT_QR_DIR = path.join(DATA_DIR, 'payment-qr')
export const PAYMENT_PROOF_DIR = path.join(DATA_DIR, 'payment-proofs')
export const DB_FILE = path.join(DATA_DIR, 'store.json')
export const DIST_DIR = path.join(ROOT, 'dist')
export const IS_PROD = process.env.NODE_ENV === 'production'
export const PORT = Number(process.env.PORT) || 8787

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
fs.mkdirSync(PAYMENT_QR_DIR, { recursive: true })
fs.mkdirSync(PAYMENT_PROOF_DIR, { recursive: true })

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const ADVANCE_RATE = Math.min(0.9, num(process.env.ADVANCE_RATE, 0.1))

export const VERIFICATION_HOLD_MINUTES = num(process.env.VERIFICATION_HOLD_MINUTES, 60)
export const PICKUP_HOLD_DAYS = num(process.env.PICKUP_HOLD_DAYS, 7)
export const LOW_STOCK_THRESHOLD = num(process.env.LOW_STOCK_THRESHOLD, 3)

export const STORE = {
  name: 'CHICORA',
  phone: process.env.STORE_PHONE || '+91 98765 43210',
  email: process.env.STORE_EMAIL || 'hello@chicora.in',
  address: process.env.STORE_ADDRESS || '14, Palm Court Lane, Indiranagar, Bengaluru 560038',
  hours: process.env.STORE_HOURS || 'Mon–Sat, 11:00–20:00 · Sun, 12:00–18:00',
  instagram: process.env.STORE_INSTAGRAM || 'https://instagram.com/chicora',
}

const SECRET_FILE = path.join(DATA_DIR, '.secret')

function loadSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET
  }
  if (fs.existsSync(SECRET_FILE)) {
    const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim()
    if (saved.length >= 16) return saved
  }
  const generated = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 })
  return generated
}

export const SESSION_SECRET = loadSecret()

if (IS_PROD && !process.env.SESSION_SECRET) {
  console.warn(
    '[chicora] SESSION_SECRET is not set — admin sessions will be invalidated on every restart. ' +
      'Set it in the hosting environment before going live.',
  )
}

export const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || 'chicora'

if (IS_PROD && ADMIN_ACCESS_CODE === 'chicora') {
  console.warn('[chicora] ADMIN_ACCESS_CODE is still the prototype value "chicora". Change it before launch.')
}

// --- Supabase ---------------------------------------------------------------
// Server-only credentials. The secret key bypasses RLS, so it must never be
// bundled into client code, logged, or exposed through an API response.
export const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
export const SUPABASE_SECRET_KEY = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim()
export const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim()

export const SUPABASE_BUCKETS = {
  qr: 'payment-qr',
  proofs: 'payment-proofs',
  products: 'product-images',
} as const

if (SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {
  throw new Error(
    '[chicora] SUPABASE_SECRET_KEY is set to a publishable key. Use the project secret key ' +
      '(sb_secret_…), which must stay on the server only.',
  )
}

/** True only when both the project URL and a server secret key are present. */
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)

export const STORAGE_MODE: 'local' | 'supabase' = SUPABASE_ENABLED ? 'supabase' : 'local'

if (SUPABASE_URL && !SUPABASE_SECRET_KEY) {
  console.warn(
    '[chicora] SUPABASE_URL is set without SUPABASE_SECRET_KEY — staying on the local data store.',
  )
}

export const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
