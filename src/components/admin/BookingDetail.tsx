import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'
import type { Booking, BookingStatus } from '@shared/types'
import { api } from '@/lib/api'
import { cn, dateTime, inr, shortDate } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'
import { PaymentPill, StatusPill } from './Shared'

const ACTIONS: Record<BookingStatus, { status: BookingStatus; label: string; tone: 'primary' | 'outline' | 'danger' }[]> = {
  awaiting_payment: [{ status: 'cancelled', label: 'Release hold', tone: 'danger' }],
  pending_verification: [{ status: 'cancelled', label: 'Cancel booking', tone: 'danger' }],
  confirmed: [
    { status: 'packed', label: 'Mark as packed', tone: 'outline' },
    { status: 'ready_for_pickup', label: 'Ready for pickup', tone: 'primary' },
    { status: 'collected', label: 'Mark collected', tone: 'outline' },
    { status: 'cancelled', label: 'Cancel booking', tone: 'danger' },
  ],
  packed: [
    { status: 'ready_for_pickup', label: 'Ready for pickup', tone: 'primary' },
    { status: 'collected', label: 'Mark collected', tone: 'outline' },
    { status: 'cancelled', label: 'Cancel booking', tone: 'danger' },
  ],
  ready_for_pickup: [
    { status: 'collected', label: 'Mark collected', tone: 'primary' },
    { status: 'cancelled', label: 'Cancel booking', tone: 'danger' },
  ],
  collected: [],
  rejected: [],
  cancelled: [],
  expired: [],
}

const TIMELINE: BookingStatus[] = ['pending_verification', 'confirmed', 'packed', 'ready_for_pickup', 'collected']
const TIMELINE_LABELS: Record<string, string> = {
  pending_verification: 'Submitted',
  confirmed: 'Verified',
  packed: 'Packed',
  ready_for_pickup: 'Ready',
  collected: 'Collected',
}

export function BookingDetail({
  booking,
  open,
  onClose,
  onUpdated,
}: {
  booking: Booking | null
  open: boolean
  onClose: () => void
  onUpdated: (booking: Booking) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    setError(null)
    setConfirmCancel(false)
    setCopied(false)
    setRejecting(false)
    setReason('')
  }, [booking?.id, open])

  if (!booking) return null

  const payment = booking.payments[0]
  const needsVerification = booking.booking_status === 'pending_verification'

  const update = async (status: BookingStatus) => {
    setBusy(status)
    setError(null)
    try {
      const { booking: updated } = await api.admin.updateBooking(booking.id, status)
      setConfirmCancel(false)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this booking.')
    } finally {
      setBusy(null)
    }
  }

  const verify = async () => {
    setBusy('verify')
    setError(null)
    try {
      const { booking: updated } = await api.admin.verifyPayment(booking.id)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify this payment.')
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    if (reason.trim().length < 3) {
      setError('Give a short rejection reason so the customer knows what happened.')
      return
    }
    setBusy('reject')
    setError(null)
    try {
      const { booking: updated } = await api.admin.rejectPayment(booking.id, reason.trim())
      setRejecting(false)
      setReason('')
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this payment.')
    } finally {
      setBusy(null)
    }
  }

  const actions = ACTIONS[booking.booking_status]
  const overdue =
    booking.pickup_expires_at &&
    Date.parse(booking.pickup_expires_at) < Date.now() &&
    !['collected', 'cancelled', 'expired', 'rejected'].includes(booking.booking_status)
  const timelineIndex = TIMELINE.indexOf(booking.booking_status)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.booking_reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="booking-detail-title"
      panelClassName="w-[calc(100vw-1.25rem)] max-w-3xl max-h-[93vh] overflow-y-auto rounded-[1.75rem] bg-warmwhite"
    >
      <div className="max-h-[93vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-cocoa/10 bg-warmwhite/95 px-5 py-4 backdrop-blur sm:px-7">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-deep">Booking details</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="booking-detail-title" className="font-mono text-lg font-bold tracking-wider text-cocoa">
                  {booking.booking_reference}
                </h2>
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-full border border-cocoa/12 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-cocoa/50 hover:border-cocoa/30 hover:text-cocoa"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusPill status={booking.booking_status} />
                <PaymentPill status={booking.payment_status} />
              </div>
            </div>
            <button onClick={onClose} aria-label="Close booking" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cocoa/10 text-cocoa/50 hover:bg-cocoa/5 hover:text-cocoa">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          {needsVerification && (
            <div className="rounded-2xl border border-amber/50 bg-amber/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck size={17} className="mt-0.5 shrink-0 text-amber-deep" />
                <div>
                  <p className="text-sm font-semibold text-cocoa">Payment awaiting your verification</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-cocoa/65">
                    The customer says they paid. Check the UTR against the shop’s UPI account, then verify or reject.
                    Nothing is marked paid until you do.
                  </p>
                </div>
              </div>
            </div>
          )}

          {booking.booking_status === 'rejected' && (
            <div className="flex items-start gap-3 rounded-2xl border border-cherry/25 bg-[#FDF1EC] p-3.5">
              <ShieldX size={16} className="mt-0.5 shrink-0 text-cherry" />
              <p className="text-[11px] leading-relaxed text-cocoa/70">
                <strong className="font-bold text-cocoa">Payment rejected.</strong>{' '}
                {booking.rejection_reason || 'No reason was recorded.'} The held stock has been returned to the shop.
              </p>
            </div>
          )}

          {overdue && (
            <div className="flex items-start gap-3 rounded-2xl border border-cherry/25 bg-[#FDF1EC] p-3.5">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-cherry" />
              <p className="text-[11px] leading-relaxed text-cocoa/70">
                <strong className="font-bold text-cocoa">Pickup window has passed.</strong> This reservation was held
                until {shortDate(booking.pickup_expires_at)}. Call the customer before releasing the stock.
              </p>
            </div>
          )}

          {TIMELINE.includes(booking.booking_status) && (
            <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
              <div className="flex items-center justify-between">
                {TIMELINE.map((stage, index) => (
                  <div key={stage} className="flex flex-1 flex-col items-center text-center">
                    <div className="flex w-full items-center">
                      <span
                        className={cn(
                          'mx-auto grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[9px] font-bold',
                          index <= timelineIndex
                            ? 'border-cocoa bg-cocoa text-warmwhite'
                            : 'border-cocoa/20 bg-warmwhite text-cocoa/35',
                        )}
                      >
                        {index <= timelineIndex ? <Check size={10} /> : index + 1}
                      </span>
                    </div>
                    <p className={cn('mt-1.5 text-[9px] font-bold uppercase tracking-[0.08em]', index <= timelineIndex ? 'text-cocoa' : 'text-cocoa/35')}>
                      {TIMELINE_LABELS[stage]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">Customer</p>
              <p className="mt-1.5 font-display text-xl leading-tight text-cocoa">{booking.customer_name}</p>
              <a href={`tel:${booking.customer_phone.replace(/\s/g, '')}`} className="mt-1 flex items-center gap-1.5 text-xs text-cocoa/60 hover:text-cocoa">
                <Phone size={11} /> {booking.customer_phone}
              </a>
              {booking.customer_email && (
                <a href={`mailto:${booking.customer_email}`} className="mt-0.5 flex items-center gap-1.5 text-xs text-cocoa/60 hover:text-cocoa">
                  <Mail size={11} /> {booking.customer_email}
                </a>
              )}
            </div>
            <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">Pickup</p>
              <p className="mt-1.5 text-[12px] font-semibold text-cocoa">
                {booking.payment_status === 'verified' ? `Advance verified ${shortDate(booking.paid_at)}` : 'Awaiting verification'}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-cocoa/50">
                <CalendarClock size={11} /> Hold until {shortDate(booking.pickup_expires_at || booking.hold_expires_at)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-cocoa/50">
                <MapPin size={11} /> In-store collection only
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cocoa/10">
            <div className="border-b border-cocoa/10 bg-cream/40 px-4 py-2.5">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/45">Gifts reserved</p>
            </div>
            <ul className="divide-y divide-cocoa/8 bg-[#FFFDF8]">
              {booking.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cream text-cocoa/45">
                    <Package size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-cocoa">{item.product_name_snapshot}</p>
                    <p className="text-[10px] text-cocoa/40">
                      {inr(item.unit_price)} × {item.quantity}
                    </p>
                  </div>
                  <span className="text-[12px] font-bold text-cocoa">{inr(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-cocoa/10 bg-[#FFFDF8] px-4 py-3 text-[12px]">
              <div className="flex justify-between text-cocoa/55">
                <dt>Total</dt>
                <dd className="font-semibold text-cocoa">{inr(booking.total_amount)}</dd>
              </div>
              <div className="flex justify-between text-cocoa/55">
                <dt>{booking.payment_status === 'verified' ? 'Advance verified' : 'Advance submitted'}</dt>
                <dd className="font-semibold text-cocoa">{inr(booking.advance_amount)}</dd>
              </div>
              <div className="flex justify-between rounded-lg bg-amber/10 px-2 py-1.5 text-cocoa">
                <dt className="font-semibold">Remaining at pickup</dt>
                <dd className="font-bold">{inr(booking.remaining_amount)}</dd>
              </div>
            </dl>
          </div>

          {/* Payment proof */}
          <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">UPI payment</p>
              <PaymentPill status={booking.payment_status} />
            </div>

            <dl className="mt-2.5 grid gap-2 text-[11px] sm:grid-cols-2">
              <div>
                <dt className="text-[9px] uppercase tracking-[0.1em] text-cocoa/35">UTR / transaction ID</dt>
                <dd className="mt-0.5 break-all font-mono text-cocoa/80">{payment?.upi_transaction_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-[0.1em] text-cocoa/35">Submitted</dt>
                <dd className="mt-0.5 text-cocoa/70">{dateTime(payment?.created_at)}</dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-[0.1em] text-cocoa/35">Verified</dt>
                <dd className="mt-0.5 text-cocoa/70">
                  {payment?.verified_at ? `${dateTime(payment.verified_at)} · ${payment.verified_by ?? 'admin'}` : 'Not verified'}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-[0.1em] text-cocoa/35">Paid at</dt>
                <dd className="mt-0.5 text-cocoa/70">{dateTime(booking.paid_at)}</dd>
              </div>
            </dl>

            {payment?.rejection_reason && (
              <p className="mt-3 rounded-lg border border-cherry/20 bg-[#FDF1EC] px-2.5 py-2 text-[11px] text-cocoa/70">
                <strong className="font-semibold text-cocoa">Rejection reason:</strong> {payment.rejection_reason}
              </p>
            )}

            {payment?.has_screenshot ? (
              <div className="mt-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-cocoa/35">Payment screenshot (private)</p>
                <a
                  href={`/api/admin/bookings/${booking.id}/payment-proof`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 block w-fit overflow-hidden rounded-xl border border-cocoa/10 bg-cream"
                >
                  <img
                    src={`/api/admin/bookings/${booking.id}/payment-proof`}
                    alt="Payment screenshot submitted by the customer"
                    className="max-h-64 w-auto max-w-full object-contain"
                  />
                </a>
                <p className="mt-1 text-[10px] text-cocoa/40">Only signed-in admins can load this image.</p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-cream/60 px-2.5 py-2 text-[10px] text-cocoa/45">
                No screenshot was attached. Verify the UTR in your UPI app before confirming.
              </p>
            )}

            {needsVerification && (
              <div className="mt-4 border-t border-cocoa/10 pt-3">
                {!rejecting ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={verify} disabled={busy !== null} className="btn btn-primary !py-2.5 !text-[10px]">
                      {busy === 'verify' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      {busy === 'verify' ? 'Verifying…' : 'Verify payment'}
                    </button>
                    <button
                      onClick={() => {
                        setRejecting(true)
                        setError(null)
                      }}
                      className="btn !border !border-cherry/30 !bg-transparent !py-2.5 !text-[10px] !text-cherry hover:!bg-cherry/10"
                    >
                      <ShieldX size={12} /> Reject payment
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-cherry/25 bg-[#FDF1EC] p-3">
                    <label className="field-label" htmlFor="rejection-reason">
                      Rejection reason
                    </label>
                    <textarea
                      id="rejection-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      maxLength={300}
                      placeholder="e.g. No payment received against this UTR — please check and resubmit."
                      className="field mt-1 resize-none !bg-warmwhite"
                    />
                    <p className="mt-1 text-[10px] text-cocoa/45">
                      The customer sees this reason when they look up their booking.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={reject} disabled={busy !== null} className="btn !bg-cherry !py-2 !text-[10px] !text-warmwhite">
                        {busy === 'reject' ? <Loader2 size={12} className="animate-spin" /> : <ShieldX size={12} />}
                        Confirm rejection
                      </button>
                      <button onClick={() => setRejecting(false)} className="btn btn-outline !py-2 !text-[10px]">
                        Keep pending
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-cocoa/40">
                  Verifying confirms the booking and keeps the stock reserved. Rejecting releases the stock immediately.
                </p>
              </div>
            )}

            {booking.payment_status === 'pending_verification' && booking.hold_expires_at && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-amber-deep">
                <CalendarClock size={11} /> Stock is held until {dateTime(booking.hold_expires_at)} while this payment waits.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-cocoa/40">
            <p>Created {dateTime(booking.created_at)}</p>
            <p className="text-right">Updated {dateTime(booking.updated_at)}</p>
          </div>

          {error && (
            <p className="rounded-xl border border-cherry/25 bg-[#FDF1EC] px-3 py-2.5 text-xs font-semibold text-cherry">
              {error}
            </p>
          )}

          {confirmCancel && (
            <div className="rounded-2xl border border-cherry/30 bg-[#FDF1EC] p-4">
              <p className="text-sm font-semibold text-cocoa">Cancel this reservation?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-cocoa/60">
                Reserved stock will be returned to the shop. If an advance was verified, handle any refund separately
                according to the booking policy.
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setConfirmCancel(false)} className="btn btn-outline !py-2 !text-[10px]">
                  Keep booking
                </button>
                <button
                  onClick={() => update('cancelled')}
                  disabled={busy !== null}
                  className="btn !bg-cherry !py-2 !text-[10px] !text-warmwhite"
                >
                  {busy === 'cancelled' ? <Loader2 size={12} className="animate-spin" /> : 'Confirm cancellation'}
                </button>
              </div>
            </div>
          )}

          {actions.length > 0 && (
            <div className="border-t border-cocoa/10 pt-4">
              <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">Update reservation</p>
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => {
                  const disabled =
                    busy !== null ||
                    (action.status === 'collected' && booking.payment_status !== 'verified')
                  return (
                    <button
                      key={action.status}
                      onClick={() => {
                        if (action.status === 'cancelled') {
                          setConfirmCancel(true)
                          return
                        }
                        void update(action.status)
                      }}
                      disabled={disabled}
                      title={
                        action.status === 'collected' && booking.payment_status !== 'verified'
                          ? 'Verify the advance before marking this collected'
                          : undefined
                      }
                      className={cn(
                        'btn !py-2.5 !text-[10px]',
                        action.tone === 'primary'
                          ? 'btn-primary'
                          : action.tone === 'danger'
                            ? '!border !border-cherry/30 !bg-transparent !text-cherry hover:!bg-cherry/10'
                            : 'btn-outline',
                      )}
                    >
                      {busy === action.status ? <Loader2 size={12} className="animate-spin" /> : action.label}
                    </button>
                  )
                })}
              </div>
              {['collected', 'cancelled', 'expired', 'rejected'].includes(booking.booking_status) && (
                <p className="mt-2 text-[10px] text-cocoa/40">This booking is closed. No further changes are possible.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
