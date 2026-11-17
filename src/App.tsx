import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { ShaderBackground } from '@/components/ShaderBackground'
import { DoodleFooter } from '@/components/DoodleFooter'
import { SearchOverlay } from '@/components/SearchOverlay'
import { ReservationsDrawer } from '@/components/ReservationsDrawer'
import { ToastViewport } from '@/components/ToastViewport'
import { MiniGiftBox } from '@/components/GiftBox3D'
import { Home } from '@/pages/Home'
import { Catalogue } from '@/pages/Catalogue'
import { Terms } from '@/pages/Terms'
import { Admin } from '@/pages/Admin'

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const timer = window.setTimeout(() => {
        const element = document.getElementById(hash.replace('#', ''))
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else window.scrollTo({ top: 0, behavior: 'auto' })
      }, 120)
      return () => window.clearTimeout(timer)
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname, hash])
  return null
}

function NotFound() {
  return (
    <section className="container-x flex min-h-[80vh] flex-col items-center justify-center py-32 text-center">
      <MiniGiftBox className="h-16 w-16" />
      <p className="eyebrow mt-8">404 · Empty box</p>
      <h1 className="display-lg mt-4 max-w-xl text-cocoa">This shelf is empty.</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-cocoa/55">
        The page you were looking for has wandered off. The gifts, thankfully, have not.
      </p>
      <div className="mt-7 flex gap-3">
        <Link to="/" className="btn btn-primary">
          <ArrowLeft size={14} /> Back home
        </Link>
        <Link to="/catalogue" className="btn btn-outline">
          Browse the collection
        </Link>
      </div>
    </section>
  )
}

export default function App() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <div className="relative min-h-screen">
      <ShaderBackground />
      <div className="grain" aria-hidden="true" />
      <ScrollManager />
      {!isAdmin && <Navbar />}
      <SearchOverlay />
      <ReservationsDrawer />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10"
        >
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/catalogue" element={<Catalogue />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.div>
      </AnimatePresence>

      <DoodleFooter />
      <ToastViewport />
    </div>
  )
}
