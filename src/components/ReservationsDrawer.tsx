import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Loader2, ShoppingBag, Trash2 } from 'lucide-react'
import type { Booking } from '@shared/types'
import { api } from '@/lib/api'
import { bookingStatusLabels, bookingStatusTone, cn, dateTime, inr } from '@/lib/format'
import { loadReservations, removeReservation, type SavedReservation } from '@/lib/reservations'
import { useStore } from '@/context/StoreContext'
import { Modal } from './ui/Modal'

interface Row {
  saved: SavedReservation
  booking: Booking | null
  error: boolean
}

export function ReservationsDrawer() {
  const { bagOpen, setBagOpen, config } = useStore()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bagOpen) return
    const saved = loadReservations()
    setRows(saved.map((entry) => ({ saved: entry, booking: null, error: false })))
    if (saved.length === 0) return
    let cancelled = false
    setLoading(true)
    Promise.all(
      saved.map(async (entry) => {
        try {
          const { booking } = await api.lookupBooking(entry.reference, entry.phone)
          return { saved: entry, booking, error: false } satisfies Row
        } catch {
          return { saved: entry, booking: null, error: true } satisfies Row
        }
      }),
    )
      .then((next) => {
        if (!cancelled) setRows(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bagOpen])

  return (
    <Modal open={bagOpen} onClose={() => setBagOpen(false)} align="right" hideClose panelClassName="h-full max-h-none w-full max-w-md">
      <div className="flex h-full flex-col bg-warmwhite">
        <div className="flex items-center justify-between border-b border-cocoa/10 px-6 py-5">
          <div>
            <p className="eyebrow">Your little box</p>
            <h2 className="mt-1 font-display text-3xl text-cocoa">Reservations</h2>
          </div>
          <button
            onClick={() => setBagOpen(false)}
            className="rounded-full border border-cocoa/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cocoa/60 transition hover:border-cocoa/40 hover:text-cocoa"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {rows.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-cream">
                <ShoppingBag size={26} className="text-amber-deep" strokeWidth={1.5} />
              </span>
              <h3 className="mt-5 font-display text-3xl text-cocoa">An empty little bag.</h3>
              <p className="mt-2 max-w-[24ch] text-sm leading-relaxed text-cocoa/55">
                Reserved gifts will live here, with their booking reference and pickup details.
              </p>
              <Link to="/catalogue" onClick={() => setBagOpen(false)} className="btn btn-primary mt-6">
                Find something lovely
              </Link>
            </div>
          )}

          {loading && (
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/45">
              <Loader2 size={13} className="animate-spin" /> Updating from the shop…
            </p>
          )}

          <div className="space-y-3">
            {rows.map(({ saved, booking, error }) => {
              const status = booking?.booking_status ?? 'pending_verification'
              return (
                <div key={saved.reference} className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] font-bold tracking-wider text-cocoa/55">{saved.reference}</p>
                      <p className="mt-1 font-display text-xl leading-tight text-cocoa">{saved.itemNames}</p>
                    </div>
                    <button
                      onClick={() => {
                        removeReservation(saved.reference)
                        setRows((current) => current.filter((row) => row.saved.reference !== saved.reference))
                      }}
                      aria-label="Remove from bag"
                      className="rounded-full p-1.5 text-cocoa/30 transition hover:bg-cherry/10 hover:text-cherry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]',
                        booking ? bookingStatusTone[status] : 'border-cocoa/15 bg-cream text-cocoa/60',
                      )}
                    >
                      {booking ? bookingStatusLabels[status] : error ? 'Saved on this device' : 'Checking…'}
                    </span>
                    <span className="text-xs font-semibold text-cocoa/60">{inr(saved.advance)} advance submitted</span>
                  </div>

                  {booking && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-cocoa/8 pt-3 text-xs">
                      <div>
                        <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-cocoa/40">Reserved</dt>
                        <dd className="mt-0.5 text-cocoa/75">{dateTime(booking.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-cocoa/40">Due at pickup</dt>
                        <dd className="mt-0.5 font-semibold text-cocoa">{inr(booking.remaining_amount)}</dd>
                      </div>
                    </dl>
                  )}
                  {booking?.booking_status === 'pending_verification' && (
                    <p className="mt-3 rounded-lg bg-amber/10 px-2.5 py-2 text-[10px] leading-relaxed text-cocoa/60">
                      We are checking your UPI payment. Your booking is confirmed once the shop verifies it.
                    </p>
                  )}
                  {booking?.booking_status === 'rejected' && (
                    <p className="mt-3 rounded-lg bg-[#FDF1EC] px-2.5 py-2 text-[10px] leading-relaxed text-cocoa/60">
                      {booking.rejection_reason || 'The payment could not be verified.'} Please call the shop if you think this is a mistake.
                    </p>
                  )}
                  {error && (
                    <p className="mt-3 text-[11px] leading-relaxed text-cocoa/45">
                      The shop is unreachable right now. Your reference is {saved.reference} — quote it at the counter.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {rows.length > 0 && (
            <div className="mt-6 rounded-2xl bg-cream/70 p-4 text-xs leading-relaxed text-cocoa/65">
              <p className="font-bold text-cocoa">Collect in store</p>
              <p className="mt-1">{config?.store.address ?? '14, Palm Court Lane, Indiranagar, Bengaluru 560038'}</p>
              <p className="mt-1">{config?.store.hours ?? 'Mon–Sat, 11:00–20:00 · Sun, 12:00–18:00'}</p>
              <a
                href={`tel:${(config?.store.phone ?? '').replace(/\s/g, '')}`}
                className="mt-2 inline-flex items-center gap-1 font-semibold text-cocoa underline decoration-cocoa/25 underline-offset-4"
              >
                Call the shop <ArrowUpRight size={12} />
              </a>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="border-t border-cocoa/10 p-5">
            <Link to="/catalogue" onClick={() => setBagOpen(false)} className="btn btn-primary w-full">
              Add another little something
            </Link>
          </div>
        )}
      </div>
    </Modal>
  )
}
