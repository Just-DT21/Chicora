import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, Search, ShoppingBag, X } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { loadReservations } from '@/lib/reservations'
import { cn } from '@/lib/format'
import { MiniGiftBox } from './GiftBox3D'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <MiniGiftBox className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      <span
        className={cn(
          'font-display font-semibold leading-none tracking-[-0.04em] text-cocoa',
          compact ? 'text-xl' : 'text-[1.45rem]',
        )}
      >
        CHICORA
      </span>
    </span>
  )
}

export function Navbar() {
  const { setSearchOpen, setBagOpen, reservationsVersion } = useStore()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bagCount, setBagCount] = useState(0)
  const location = useLocation()
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 24))

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const sync = () => setBagCount(loadReservations().length)
    sync()
    window.addEventListener('chicora:reservations', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('chicora:reservations', sync)
      window.removeEventListener('storage', sync)
    }
  }, [reservationsVersion])

  const links = [
    { to: '/', label: 'Home' },
    { to: '/catalogue', label: 'Catalogue' },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="container-x pt-3 sm:pt-5">
        <div
          className={cn(
            'relative flex items-center justify-between gap-3 rounded-full border px-4 py-2.5 transition-all duration-500 sm:px-6',
            scrolled
              ? 'border-cocoa/12 bg-warmwhite/85 shadow-[0_18px_40px_-28px_rgba(57,39,29,0.6)] backdrop-blur-xl'
              : 'border-transparent bg-transparent',
          )}
        >
          <Link to="/" aria-label="CHICORA home" className="shrink-0">
            <BrandMark />
          </Link>

          <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 font-sans text-[0.8rem] font-semibold tracking-wide transition',
                    isActive ? 'bg-cocoa text-warmwhite' : 'text-cocoa/70 hover:bg-cocoa/5 hover:text-cocoa',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search gifts"
              className="grid h-10 w-10 place-items-center rounded-full text-cocoa/75 transition hover:bg-cocoa/6 hover:text-cocoa"
            >
              <Search size={18} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setBagOpen(true)}
              aria-label={`Your reservations (${bagCount})`}
              className="relative grid h-10 w-10 place-items-center rounded-full text-cocoa/75 transition hover:bg-cocoa/6 hover:text-cocoa"
            >
              <ShoppingBag size={18} strokeWidth={1.8} />
              {bagCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber px-1 text-[9px] font-bold text-cocoa">
                  {bagCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="grid h-10 w-10 place-items-center rounded-full text-cocoa/75 transition hover:bg-cocoa/6 hover:text-cocoa md:hidden"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={19} />}
            </button>
            <Link to="/catalogue" className="btn btn-primary ml-1 hidden !px-5 !py-2.5 lg:inline-flex">
              Book a gift
            </Link>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
              aria-label="Mobile"
              className="mt-2 overflow-hidden rounded-3xl border border-cocoa/10 bg-warmwhite/95 p-3 shadow-lift backdrop-blur-xl md:hidden"
            >
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-2xl px-4 py-3 font-display text-2xl tracking-tight',
                      isActive ? 'bg-cream text-cocoa' : 'text-cocoa/75',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <Link
                to="/catalogue"
                className="mt-2 flex items-center justify-between rounded-2xl bg-cocoa px-4 py-4 text-warmwhite"
              >
                <span className="font-display text-xl">Find your gift</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">Explore →</span>
              </Link>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
