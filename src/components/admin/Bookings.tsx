import { useMemo, useState } from 'react'
import { ArrowRight, BellRing, Download, RefreshCw, Search } from 'lucide-react'
import type { Booking, BookingStatus } from '@shared/types'
import { bookingStatusLabels, cn, dateTime, inr } from '@/lib/format'
import { EmptyState, PaymentPill, StatusPill } from './Shared'

const FILTERS: { value: 'all' | BookingStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_verification', label: 'Pending verification' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'ready_for_pickup', label: 'Ready' },
  { value: 'collected', label: 'Collected' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function Bookings({
  bookings,
  onOpen,
  onReload,
}: {
  bookings: Booking[]
  onOpen: (booking: Booking) => void
  onReload: (silent?: boolean) => Promise<void>
}) {
  const [status, setStatus] = useState<'all' | BookingStatus>('all')
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const booking of bookings) {
      map.set(booking.booking_status, (map.get(booking.booking_status) ?? 0) + 1)
    }
    return map
  }, [bookings])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return bookings.filter((booking) => {
      if (status !== 'all' && booking.booking_status !== status) return false
      if (!term) return true
      return (
        booking.booking_reference.toLowerCase().includes(term) ||
        booking.customer_name.toLowerCase().includes(term) ||
        booking.customer_phone.includes(term) ||
        booking.items.some((item) => item.product_name_snapshot.toLowerCase().includes(term))
      )
    })
  }, [bookings, status, query])

  const refresh = async () => {
    setRefreshing(true)
    await onReload(true)
    setRefreshing(false)
  }

  const pending = bookings.filter((b) => b.booking_status === 'pending_verification').length

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-deep">Behind the counter</p>
          <h2 className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-cocoa">
            {bookings.length} reservations
          </h2>
          <p className="mt-1 text-xs text-cocoa/45">
            {pending > 0 ? `${pending} payment${pending === 1 ? '' : 's'} waiting to be verified.` : 'No payments waiting for verification.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={refresh} className="btn btn-outline !py-2.5 !text-[10px]">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <a href="/api/admin/export/bookings.csv" className="btn btn-outline !py-2.5 !text-[10px]">
            <Download size={12} /> Export CSV
          </a>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <BellRing size={15} className="mt-0.5 shrink-0 text-amber-deep" />
          <p className="text-xs leading-relaxed text-cocoa/65">
            <strong className="font-semibold text-cocoa">Live notifications are on.</strong> A submitted UPI payment
            appears here and as a toast the moment it is created. Nothing is marked paid until you verify the UTR —
            unverified holds release stock automatically when they expire.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map((filter) => {
            const count = filter.value === 'all' ? bookings.length : counts.get(filter.value) ?? 0
            return (
              <button
                key={filter.value}
                onClick={() => setStatus(filter.value)}
                className={cn('chip shrink-0 !text-[11px]', status === filter.value && 'chip-active')}
              >
                {filter.label}
                <span className={cn('text-[9px]', status === filter.value ? 'text-warmwhite/50' : 'text-cocoa/35')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex w-full max-w-xs items-center gap-2 rounded-full border border-cocoa/12 bg-[#FFFDF8] px-3 py-2">
          <Search size={14} className="shrink-0 text-cocoa/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Reference, name, phone…"
            aria-label="Search bookings"
            className="w-full bg-transparent text-xs text-cocoa outline-none placeholder:text-cocoa/35"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No bookings in this pile."
          description={
            bookings.length === 0
              ? 'When a customer reserves a gift, it will appear here automatically with its payment status.'
              : 'Try another status or clear the search.'
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-cocoa/10 bg-[#FFFDF8] md:block">
            <div className="overflow-x-auto">
              <table className="table-base min-w-[900px]">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Customer</th>
                    <th>Gift</th>
                    <th>Money</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => (
                    <tr key={booking.id} className="cursor-pointer" onClick={() => onOpen(booking)}>
                      <td>
                        <p className="font-mono text-[11px] font-bold tracking-wider text-cocoa">
                          {booking.booking_reference}
                        </p>
                        <p className="mt-0.5 text-[10px] text-cocoa/40">{dateTime(booking.created_at)}</p>
                      </td>
                      <td>
                        <p className="text-[12px] font-semibold text-cocoa">{booking.customer_name}</p>
                        <p className="text-[10px] text-cocoa/45">{booking.customer_phone}</p>
                      </td>
                      <td>
                        <p className="max-w-[190px] truncate text-[12px] text-cocoa/70">
                          {booking.items.map((item) => `${item.product_name_snapshot} ×${item.quantity}`).join(', ')}
                        </p>
                        <p className="text-[10px] text-cocoa/40">
                          {booking.items.reduce((sum, item) => sum + item.quantity, 0)} item
                          {booking.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td>
                        <p className="text-[12px] font-semibold text-cocoa">{inr(booking.total_amount)}</p>
                        <p className="text-[10px] text-cocoa/45">
                          {inr(booking.advance_amount)} advance · {inr(booking.remaining_amount)} due
                        </p>
                      </td>
                      <td>
                        <PaymentPill status={booking.payment_status} />
                        <p className="mt-1 font-mono text-[9px] text-cocoa/40">
                          {booking.payments[0]?.upi_transaction_id ? `UTR ${booking.payments[0].upi_transaction_id}` : 'No UTR'}
                        </p>
                      </td>
                      <td>
                        <StatusPill status={booking.booking_status} />
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-cocoa/10 text-cocoa/45">
                            <ArrowRight size={13} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((booking) => (
              <button
                key={booking.id}
                onClick={() => onOpen(booking)}
                className="w-full rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] font-bold tracking-wider text-cocoa/50">
                      {booking.booking_reference}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-cocoa">{booking.customer_name}</p>
                    <p className="text-[11px] text-cocoa/45">{booking.customer_phone}</p>
                  </div>
                  <span className="text-sm font-bold text-cocoa">{inr(booking.total_amount)}</span>
                </div>
                <p className="mt-2 text-[11px] text-cocoa/55">
                  {booking.items.map((item) => `${item.product_name_snapshot} ×${item.quantity}`).join(', ')}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill status={booking.booking_status} />
                  <PaymentPill status={booking.payment_status} />
                  <span className="ml-auto text-[10px] text-cocoa/35">{bookingStatusLabels[booking.booking_status]}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
