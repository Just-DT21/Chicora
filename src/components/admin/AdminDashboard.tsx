import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Boxes,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  QrCode,
  Radio,
  X,
} from 'lucide-react'
import type { AdminStats, Booking, Category, Product } from '@shared/types'
import { api, ApiError } from '@/lib/api'
import { inr } from '@/lib/format'
import { useStore } from '@/context/StoreContext'
import { BrandMark } from '@/components/Navbar'
import { Overview } from './Overview'
import { Inventory } from './Inventory'
import { Bookings } from './Bookings'
import { BookingDetail } from './BookingDetail'
import { ProductEditor } from './ProductEditor'
import { PaymentSettings } from './PaymentSettings'
import { cn } from '@/lib/format'

type Tab = 'overview' | 'inventory' | 'bookings' | 'payments'

const TITLES: Record<Tab, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'The shop, at a glance.' },
  inventory: { title: 'Inventory', subtitle: 'Everything on the shelves.' },
  bookings: { title: 'Bookings', subtitle: 'Reservations, UPI payments and pickups.' },
  payments: { title: 'Payment settings', subtitle: 'The UPI ID and QR code customers pay.' },
}

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [lowStock, setLowStock] = useState<Product[]>([])
  const [lowStockThreshold, setLowStockThreshold] = useState(3)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [live, setLive] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mounted = useRef(true)

  const loadAll = useCallback(
    async (silent = false) => {
      try {
        const [statsRes, productsRes, categoriesRes, bookingsRes] = await Promise.all([
          api.admin.stats(),
          api.admin.products(),
          api.admin.categories(),
          api.admin.bookings(),
        ])
        if (!mounted.current) return
        setStats(statsRes.stats)
        setLowStock(statsRes.lowStock)
        setLowStockThreshold(statsRes.lowStockThreshold)
        setProducts(productsRes.products)
        setCategories(categoriesRes.categories)
        setBookings(bookingsRes.bookings)
        setError(null)
      } catch (err) {
        if (!mounted.current) return
        if (err instanceof ApiError && err.status === 401) {
          onLogout()
          return
        }
        if (!silent) setError(err instanceof Error ? err.message : 'The dashboard could not load.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [onLogout],
  )

  useEffect(() => {
    mounted.current = true
    void loadAll()
    return () => {
      mounted.current = false
    }
  }, [loadAll])

  // Live booking notifications (SSE) with a polling fallback.
  useEffect(() => {
    const source = new EventSource('/api/admin/events')
    source.addEventListener('ready', () => setLive('live'))
    source.addEventListener('booking:created', (event) => {
      setLive('live')
      setUnread((count) => count + 1)
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { booking: Booking }
        toast(
          'Payment pending verification',
          `${payload.booking.booking_reference} · ${payload.booking.customer_name} · ${inr(payload.booking.advance_amount)} · UTR ${payload.booking.payments?.[0]?.upi_transaction_id ?? '—'}`,
          'success',
        )
      } catch {
        toast('New reservation', 'A new booking just landed.', 'success')
      }
      void loadAll(true)
    })
    source.addEventListener('booking:updated', () => {
      setLive('live')
      void loadAll(true)
    })
    source.onerror = () => setLive('offline')
    return () => source.close()
  }, [loadAll, toast])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadAll(true)
    }, 45_000)
    return () => window.clearInterval(interval)
  }, [loadAll])

  const logout = async () => {
    try {
      await api.admin.logout()
    } catch {
      // Clear the client view even if the request fails.
    }
    onLogout()
  }

  const openEditor = (product: Product | null) => {
    setEditingProduct(product)
    setEditorOpen(true)
  }

  const selectTab = (next: Tab) => {
    setTab(next)
    setMobileNavOpen(false)
    if (next === 'bookings') setUnread(0)
  }

  const navItems: { key: Tab; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'inventory', label: 'Inventory', icon: Boxes, badge: products.length || undefined },
    {
      key: 'bookings',
      label: 'Bookings',
      icon: ClipboardList,
      badge: unread || bookings.filter((b) => b.booking_status === 'pending_verification').length || undefined,
    },
    { key: 'payments', label: 'Payment settings', icon: QrCode },
  ]

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-7 pt-6">
        <BrandMark compact />
        <p className="mt-2 pl-[34px] text-[9px] font-extrabold uppercase tracking-[0.2em] text-cocoa/35">Admin console</p>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Admin sections">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => selectTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition',
              tab === item.key ? 'bg-cocoa text-warmwhite' : 'text-cocoa/60 hover:bg-cocoa/5 hover:text-cocoa',
            )}
          >
            <item.icon size={16} strokeWidth={1.8} />
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[9px] font-bold',
                  tab === item.key ? 'bg-amber text-cocoa' : 'bg-cream text-cocoa/60',
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="space-y-3 px-3 pb-5">
        <div className="rounded-xl border border-cocoa/10 bg-warmwhite p-3">
          <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-cocoa/45">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                live === 'live' ? 'bg-sage' : live === 'connecting' ? 'bg-amber' : 'bg-cherry',
              )}
            />
            {live === 'live' ? 'Live updates on' : live === 'connecting' ? 'Connecting…' : 'Reconnecting'}
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-cocoa/40">
            {live === 'live' ? 'New reservations appear here automatically.' : 'Polling every 45 seconds as a fallback.'}
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-cocoa/55 transition hover:bg-cocoa/5 hover:text-cocoa"
        >
          <ExternalLink size={14} /> View the shop
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-cocoa/55 transition hover:bg-cherry/8 hover:text-cherry"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#FAF3E7]">
      <div className="mx-auto flex max-w-[1540px]">
        <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-cocoa/10 bg-[#FFFDF8] lg:block">
          {sidebar}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-cocoa/10 bg-[#FAF3E7]/90 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileNavOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-cocoa/12 text-cocoa/60 lg:hidden"
                  aria-label="Open admin menu"
                >
                  <Menu size={16} />
                </button>
                <div>
                  <h1 className="font-display text-xl leading-tight tracking-[-0.02em] text-cocoa lg:text-2xl">
                    {TITLES[tab].title}
                  </h1>
                  <p className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-cocoa/35 sm:block">
                    {TITLES[tab].subtitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-cocoa/10 bg-warmwhite px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cocoa/45 sm:flex">
                  <Radio size={11} className={live === 'live' ? 'text-sage' : 'text-amber-deep'} />
                  {live === 'live' ? 'Live' : 'Offline'}
                </span>
                <button
                  onClick={() => selectTab('bookings')}
                  aria-label="Booking notifications"
                  className="relative grid h-9 w-9 place-items-center rounded-full text-cocoa/55 transition hover:bg-cocoa/5 hover:text-cocoa"
                >
                  <Bell size={17} />
                  {unread > 0 && (
                    <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-cherry px-1 text-[9px] font-bold text-warmwhite">
                      {unread}
                    </span>
                  )}
                </button>
                <span className="mx-1 hidden h-6 w-px bg-cocoa/10 sm:block" />
                <span className="hidden text-[10px] font-semibold text-cocoa/45 sm:block">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 lg:px-8 lg:py-8">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-cocoa/40">
                <Loader2 size={22} className="animate-spin text-amber-deep" />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Bringing the numbers in…</p>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-cherry/25 bg-[#FDF1EC] p-6">
                <p className="font-display text-xl text-cocoa">The dashboard is quiet.</p>
                <p className="mt-1 text-sm text-cocoa/60">{error}</p>
                <button onClick={() => loadAll()} className="btn btn-primary mt-3">
                  Reload
                </button>
              </div>
            )}

            {!loading && !error && stats && (
              <>
                {tab === 'overview' && (
                  <Overview
                    stats={stats}
                    lowStock={lowStock}
                    threshold={lowStockThreshold}
                    bookings={bookings}
                    products={products}
                    onOpenBooking={setSelectedBooking}
                    onGoTab={selectTab}
                    onEditProduct={openEditor}
                  />
                )}
                {tab === 'inventory' && (
                  <Inventory
                    products={products}
                    categories={categories}
                    lowStockThreshold={lowStockThreshold}
                    onReload={loadAll}
                    onEdit={openEditor}
                    onAdd={() => openEditor(null)}
                  />
                )}
                {tab === 'bookings' && (
                  <Bookings
                    bookings={bookings}
                    onOpen={setSelectedBooking}
                    onReload={loadAll}
                  />
                )}
                {tab === 'payments' && (
                  <PaymentSettings
                    onSaved={() => toast('Payment settings published', 'Checkout now shows the latest UPI details.', 'success')}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[75] lg:hidden">
          <div className="absolute inset-0 bg-cocoa/40 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] border-r border-cocoa/10 bg-[#FFFDF8] shadow-lift">
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-full text-cocoa/50 hover:bg-cocoa/5"
            >
              <X size={16} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <ProductEditor
        open={editorOpen}
        product={editingProduct}
        categories={categories}
        onClose={() => setEditorOpen(false)}
        onSaved={(message) => {
          setEditorOpen(false)
          toast(message, undefined, 'success')
          void loadAll(true)
        }}
      />

      <BookingDetail
        booking={selectedBooking}
        open={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        onUpdated={(updated) => {
          setSelectedBooking(updated)
          void loadAll(true)
          toast(`Booking ${updated.booking_reference} updated`, `Now ${updated.booking_status.replace(/_/g, ' ')}.`, 'success')
        }}
      />
    </div>
  )
}
