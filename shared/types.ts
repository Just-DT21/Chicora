/* Shared domain types used by both the server and the React client. */

/**
 * Payment states are deliberately separate from booking states:
 * a submitted screenshot/UTR is never the same as a verified payment.
 */
export type PaymentStatus =
  | 'awaiting_payment'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'cancelled'

export type BookingStatus =
  | 'awaiting_payment'
  | 'pending_verification'
  | 'confirmed'
  | 'packed'
  | 'ready_for_pickup'
  | 'collected'
  | 'rejected'
  | 'cancelled'
  | 'expired'

export interface Category {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  discounted_price: number | null
  category_id: string
  stock_quantity: number
  images: string[]
  is_featured: boolean
  is_new_arrival: boolean
  is_published: boolean
  created_at: string
  updated_at: string
  category_name?: string
  category_slug?: string
}

export interface BookingItem {
  id: string
  booking_id: string
  product_id: string
  product_name_snapshot: string
  unit_price: number
  quantity: number
  subtotal: number
}

export interface Payment {
  id: string
  booking_id: string
  amount: number
  payment_status: PaymentStatus
  /** UTR / UPI transaction reference supplied by the customer. */
  upi_transaction_id: string | null
  /** Private storage filename. Never sent to public clients. */
  screenshot_file: string | null
  /** True when an admin-only proof image can be fetched for this payment. */
  has_screenshot?: boolean
  verified_at: string | null
  verified_by: string | null
  rejection_reason: string | null
  created_at: string
}

export interface Booking {
  id: string
  booking_reference: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  total_amount: number
  advance_amount: number
  remaining_amount: number
  payment_status: PaymentStatus
  booking_status: BookingStatus
  created_at: string
  updated_at: string
  pickup_date: string | null
  pickup_expires_at: string | null
  hold_expires_at: string | null
  paid_at: string | null
  rejection_reason: string | null
  items: BookingItem[]
  payments: Payment[]
}

export interface StoreDetails {
  name: string
  phone: string
  email: string
  address: string
  hours: string
  instagram: string
}

export interface PolicyDetails {
  advanceRate: number
  /** Minutes an unverified UPI submission holds stock before it is released. */
  verificationHoldMinutes: number
  pickupHoldDays: number
}

export interface PublicConfig {
  store: StoreDetails
  policy: PolicyDetails
}

export interface PaymentSettingsPublic {
  upi_id: string
  display_name: string
  qr_image_url: string | null
  updated_at: string
}

export interface BookingQuoteLine {
  productId: string
  name: string
  unitPrice: number
  quantity: number
  subtotal: number
}

export interface BookingQuote {
  lines: BookingQuoteLine[]
  total: number
  advance: number
  remaining: number
}

export interface CreateBookingInput {
  customerName: string
  customerPhone: string
  customerEmail?: string
  items: { productId: string; quantity: number }[]
  upiTransactionId: string
  proofToken?: string | null
}

export interface CreateBookingResult {
  booking: Booking
  quote: BookingQuote
  payment: {
    mode: 'upi'
    amount: number
    currency: 'INR'
    status: PaymentStatus
  }
}

export interface AdminStats {
  totalProducts: number
  availableProducts: number
  lowStockProducts: number
  outOfStockProducts: number
  totalBookings: number
  awaitingPaymentBookings: number
  pendingVerificationBookings: number
  confirmedBookings: number
  collectedBookings: number
  rejectedBookings: number
  advanceVerified: number
  advancePendingVerification: number
  revenueAtPickup: number
}

export interface AdminSession {
  authenticated: boolean
}
