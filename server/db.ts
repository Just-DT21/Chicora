import { STORAGE_MODE } from './config'

/**
 * The one place the rest of the server talks to the data store.
 *
 * - `STORAGE_MODE=supabase` (SUPABASE_URL + SUPABASE_SECRET_KEY set) uses
 *   PostgreSQL and Storage through `db-supabase.ts`.
 * - Otherwise the zero-config local store (`db-local.ts`, data/store.json) is
 *   used, so development keeps working with no credentials at all.
 *
 * Both modules expose the same functions, so routes, checkout and the admin
 * dashboard are identical either way.
 */
const store = (STORAGE_MODE === 'supabase'
  ? await import('./db-supabase')
  : await import('./db-local')) as typeof import('./db-local')

export const storeMode = STORAGE_MODE

// catalogue
export const listCategories = store.listCategories
export const createCategory = store.createCategory
export const deleteCategory = store.deleteCategory
export const listProducts = store.listProducts
export const getProduct = store.getProduct
export const createProduct = store.createProduct
export const updateProduct = store.updateProduct
export const deleteProduct = store.deleteProduct

// bookings
export const quoteItems = store.quoteItems
export const createBooking = store.createBooking
export const getBookingByReference = store.getBookingByReference
export const getBookingById = store.getBookingById
export const listBookings = store.listBookings
export const getBookingPayments = store.getBookingPayments
export const setBookingStatus = store.setBookingStatus
export const expireStaleHolds = store.expireStaleHolds

// UPI payment settings + admin verification
export const getPaymentSettingsRecord = store.getPaymentSettingsRecord
export const getPublicPaymentSettings = store.getPublicPaymentSettings
export const savePaymentSettings = store.savePaymentSettings
export const verifyBookingPayment = store.verifyBookingPayment
export const rejectBookingPayment = store.rejectBookingPayment

// binary assets (QR code, payment proofs, product images)
export const uploadPaymentQr = store.uploadPaymentQr
export const removePaymentQr = store.removePaymentQr
export const paymentQrTarget = store.paymentQrTarget
export const savePaymentProof = store.savePaymentProof
export const resolvePaymentProof = store.resolvePaymentProof
export const paymentProofTarget = store.paymentProofTarget
export const uploadProductImage = store.uploadProductImage

// reporting + health
export const getStats = store.getStats
export const lowStockProducts = store.lowStockProducts
export const checkDatabase = store.checkDatabase

// pure helpers, identical for every backend
export { computeQuote, effectivePrice, publicBooking } from './db-local'
export type { BinaryTarget, PaymentSettingsRecord, ProductInput, ProductQuery, StoreHealth } from './db-local'
