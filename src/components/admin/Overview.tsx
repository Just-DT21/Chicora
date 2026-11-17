import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock,
  PackageCheck,
  PackageX,
  Pencil,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import type { AdminStats, Booking, Product } from '@shared/types'
import { dateTime, inr } from '@/lib/format'
import { EmptyState, PaymentPill, StatCard, StatusPill, bookingItemNames } from './Shared'

export function Overview({
  stats,
  lowStock,
  threshold,
  bookings,
  products,
  onOpenBooking,
  onGoTab,
  onEditProduct,
}: {
  stats: AdminStats
  lowStock: Product[]
  threshold: number
  bookings: Booking[]
  products: Product[]
  onOpenBooking: (booking: Booking) => void
  onGoTab: (tab: 'inventory' | 'bookings') => void
  onEditProduct: (product: Product) => void
}) {
  const recent = bookings.slice(0, 5)
  const newBookings = bookings.filter((b) => b.booking_status === 'pending_verification').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-deep">The back room</p>
          <h2 className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-cocoa sm:text-[2.6rem]">
            A very good day
            <br />
            at the shop.
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onGoTab('inventory')} className="btn btn-outline !py-2.5 !text-[10px]">
            Manage inventory
          </button>
          <button onClick={() => onGoTab('bookings')} className="btn btn-primary !py-2.5 !text-[10px]">
            {newBookings > 0 ? `${newBookings} to verify` : 'Open bookings'}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-cocoa/35">Inventory</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total products" value={stats.totalProducts} hint={`${products.filter((p) => p.is_published).length} published`} icon={Boxes} />
          <StatCard
            label="Available"
            value={stats.availableProducts}
            hint="In stock and on sale"
            icon={PackageCheck}
            tone="sage"
          />
          <StatCard
            label="Low stock"
            value={stats.lowStockProducts}
            hint={`${threshold} or fewer remaining`}
            icon={TriangleAlert}
            tone={stats.lowStockProducts > 0 ? 'amber' : 'default'}
          />
          <StatCard
            label="Out of stock"
            value={stats.outOfStockProducts}
            hint="Needs a restock or unpublish"
            icon={PackageX}
            tone={stats.outOfStockProducts > 0 ? 'danger' : 'default'}
          />
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-cocoa/35">Bookings & money</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total bookings" value={stats.totalBookings} hint="All time" icon={ClipboardList} />
          <StatCard
            label="Pending verification"
            value={stats.pendingVerificationBookings}
            hint="Check UTR, verify or reject"
            icon={Clock}
            tone={stats.pendingVerificationBookings > 0 ? 'amber' : 'default'}
          />
          <StatCard label="To fulfil" value={stats.confirmedBookings} hint="Confirmed → ready for pickup" icon={PackageCheck} />
          <StatCard label="Collected" value={stats.collectedBookings} hint="Paid in full at the counter" icon={CheckCircle2} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-cocoa p-5 text-warmwhite">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber/20 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber">Advances verified</p>
              <p className="mt-2 font-display text-[2.4rem] leading-none tracking-tight">{inr(stats.advanceVerified)}</p>
              <p className="mt-2 text-[10px] text-warmwhite/45">
                {stats.advancePendingVerification > 0
                  ? `${inr(stats.advancePendingVerification)} submitted and still to check.`
                  : 'Only admin-verified UPI payments are counted here.'}
              </p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-warmwhite/10 text-amber">
              <Wallet size={15} />
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-amber/50 bg-amber/15 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-deep">Due at pickup</p>
              <p className="mt-2 font-display text-[2.4rem] leading-none tracking-tight text-cocoa">
                {inr(stats.revenueAtPickup)}
              </p>
              <p className="mt-2 text-[10px] text-cocoa/50">
                The remaining 90% to collect across open bookings.
              </p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-warmwhite/60 text-amber-deep">
              <CircleDollarSign size={15} />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8]">
          <div className="flex items-center justify-between border-b border-cocoa/10 px-5 py-4">
            <div>
              <h3 className="font-display text-xl leading-none text-cocoa">Low stock</h3>
              <p className="mt-1 text-[10px] text-cocoa/40">Pieces with {threshold} or fewer left.</p>
            </div>
            <button
              onClick={() => onGoTab('inventory')}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cocoa/45 transition hover:text-cocoa"
            >
              Inventory <ArrowUpRight size={12} />
            </button>
          </div>
          {lowStock.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-semibold text-cocoa">Every shelf is happily stocked.</p>
              <p className="mt-1 text-xs text-cocoa/45">No low-stock warnings right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-cocoa/8">
              {lowStock.slice(0, 5).map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-cream">
                    <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-cocoa">{product.name}</p>
                    <p className="text-[10px] text-cocoa/45">{product.category_name}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${
                      product.stock_quantity === 0
                        ? 'border-cherry/25 bg-[#FBE4DF] text-cherry'
                        : 'border-amber/40 bg-amber-100 text-amber-deep'
                    }`}
                  >
                    {product.stock_quantity === 0 ? 'Sold out' : `${product.stock_quantity} left`}
                  </span>
                  <button
                    onClick={() => onEditProduct(product)}
                    aria-label={`Edit ${product.name}`}
                    className="grid h-8 w-8 place-items-center rounded-full border border-cocoa/10 text-cocoa/50 transition hover:border-cocoa/30 hover:text-cocoa"
                  >
                    <Pencil size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8]">
          <div className="flex items-center justify-between border-b border-cocoa/10 px-5 py-4">
            <div>
              <h3 className="font-display text-xl leading-none text-cocoa">Latest reservations</h3>
              <p className="mt-1 text-[10px] text-cocoa/40">Newest first. Updates live.</p>
            </div>
            <button
              onClick={() => onGoTab('bookings')}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cocoa/45 transition hover:text-cocoa"
            >
              All bookings <ArrowUpRight size={12} />
            </button>
          </div>
          {recent.length === 0 ? (
            <EmptyState title="No bookings yet." description="The first reservation will appear here the moment it is paid." />
          ) : (
            <ul className="divide-y divide-cocoa/8">
              {recent.map((booking) => (
                <li key={booking.id}>
                  <button
                    onClick={() => onOpenBooking(booking)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-cream/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-bold tracking-wider text-cocoa/45">
                          {booking.booking_reference}
                        </span>
                        <StatusPill status={booking.booking_status} />
                        <PaymentPill status={booking.payment_status} />
                      </div>
                      <p className="mt-1 truncate text-[13px] font-semibold text-cocoa">
                        {booking.customer_name} · {bookingItemNames(booking)}
                      </p>
                      <p className="text-[10px] text-cocoa/40">{dateTime(booking.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold text-cocoa">{inr(booking.advance_amount)}</p>
                      <p className="text-[9px] uppercase tracking-[0.08em] text-cocoa/35">advance</p>
                    </div>
                    <ArrowRight size={12} className="mt-2 shrink-0 text-cocoa/25" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-cocoa/10 bg-cream/50 px-5 py-4 sm:flex-row sm:items-center">
        <p className="text-xs leading-relaxed text-cocoa/55">
          A customer’s screenshot is not a payment. Verify the <strong className="font-semibold text-cocoa">UTR</strong> in your UPI app before confirming a booking.
        </p>
        <Link to="/catalogue" className="text-[10px] font-bold uppercase tracking-[0.12em] text-cocoa underline decoration-cocoa/25 underline-offset-4">
          See the customer view
        </Link>
      </div>
    </div>
  )
}
