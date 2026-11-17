import type { BookingStatus, PaymentStatus } from '@shared/types'

export function inr(value: number, opts: { paise?: boolean } = {}) {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: opts.paise ? 2 : 0,
    minimumFractionDigits: 0,
  })
  return formatter.format(Number.isFinite(value) ? value : 0)
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const bookingStatusLabels: Record<BookingStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  pending_verification: 'Pending verification',
  confirmed: 'Confirmed',
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const bookingStatusTone: Record<BookingStatus, string> = {
  awaiting_payment: 'bg-amber-100 text-amber-deep border-amber/40',
  pending_verification: 'bg-[#FFF0D6] text-[#8A5A12] border-[#E9C98E]',
  confirmed: 'bg-[#EAF0E2] text-[#53663F] border-[#BCC9A8]',
  packed: 'bg-[#F3E9FF] text-[#6B4C8A] border-[#D4C0EA]',
  ready_for_pickup: 'bg-[#DFF1EF] text-[#2F6B63] border-[#A9D3CD]',
  collected: 'bg-[#EDE7E1] text-[#5A4636] border-[#D2C2B2]',
  rejected: 'bg-[#FBE4DF] text-[#9C3C2C] border-[#EFB6A9]',
  cancelled: 'bg-[#FBE4DF] text-[#9C3C2C] border-[#EFB6A9]',
  expired: 'bg-[#F1ECE7] text-[#8A7563] border-[#D9CABB]',
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  pending_verification: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export const paymentStatusTone: Record<PaymentStatus, string> = {
  awaiting_payment: 'bg-amber-100 text-amber-deep border-amber/40',
  pending_verification: 'bg-[#FFF0D6] text-[#8A5A12] border-[#E9C98E]',
  verified: 'bg-[#EAF0E2] text-[#53663F] border-[#BCC9A8]',
  rejected: 'bg-[#FBE4DF] text-[#9C3C2C] border-[#EFB6A9]',
  cancelled: 'bg-[#F1ECE7] text-[#8A7563] border-[#D9CABB]',
}

export function stockLabel(stock: number) {
  if (stock <= 0) return 'Sold out'
  if (stock <= 3) return `Only ${stock} left`
  return 'Available'
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
