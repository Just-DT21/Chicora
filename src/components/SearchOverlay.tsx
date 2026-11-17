import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Search, X } from 'lucide-react'
import type { Product } from '@shared/types'
import { api } from '@/lib/api'
import { inr } from '@/lib/format'
import { useStore } from '@/context/StoreContext'
import { Modal } from './ui/Modal'

export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useStore()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!searchOpen) {
      setTerm('')
      setResults([])
      setError(null)
    }
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const { products } = await api.products({ q: trimmed, limit: 6 })
        if (requestId.current !== id) return
        setResults(products)
        setError(null)
      } catch {
        if (requestId.current !== id) return
        setError('Search is taking a little break. Try again.')
      } finally {
        if (requestId.current === id) setLoading(false)
      }
    }, 260)
    return () => window.clearTimeout(timer)
  }, [term, searchOpen])

  const goToAll = (value: string) => {
    setSearchOpen(false)
    navigate(`/catalogue?q=${encodeURIComponent(value.trim())}`)
  }

  const goToProduct = (product: Product) => {
    setSearchOpen(false)
    navigate(`/catalogue?p=${product.id}`)
  }

  return (
    <Modal open={searchOpen} onClose={() => setSearchOpen(false)} hideClose panelClassName="max-w-2xl px-4">
      <div className="overflow-hidden rounded-[2rem] border border-cocoa/10 bg-warmwhite shadow-lift">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (term.trim().length >= 2) goToAll(term)
          }}
          className="flex items-center gap-3 border-b border-cocoa/10 px-5 py-4"
        >
          <Search size={19} className="shrink-0 text-cocoa/45" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search candles, soft toys, birthday gifts…"
            aria-label="Search the collection"
            className="w-full bg-transparent py-1 font-display text-xl text-cocoa outline-none placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-cocoa/40"
          />
          {loading && <Loader2 size={16} className="animate-spin text-amber-deep" />}
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-cocoa/45 hover:bg-cocoa/5 hover:text-cocoa"
          >
            <X size={16} />
          </button>
        </form>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {term.trim().length < 2 && (
            <div className="px-4 py-5">
              <p className="eyebrow">Try looking for</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {['birthday', 'candle', 'soft toy', 'couple', 'personalised', 'under ₹1,000'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setTerm(suggestion.replace('under ₹1,000', 'chocolate'))}
                    className="chip"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-xs leading-relaxed text-cocoa/50">
                Every gift is in the shop, wrapped by hand. Reserve online with 10% and collect it in person.
              </p>
            </div>
          )}

          {error && <p className="px-4 py-6 text-sm text-cherry">{error}</p>}

          {!loading && !error && term.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="font-display text-2xl text-cocoa">Nothing matched “{term}”.</p>
              <p className="mt-1 text-sm text-cocoa/55">Try a different word, or browse the whole collection.</p>
              <button onClick={() => goToAll('')} className="btn btn-outline mt-4">
                Browse everything
              </button>
            </div>
          )}

          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => goToProduct(product)}
              className="flex w-full items-center gap-4 rounded-2xl px-3 py-2.5 text-left transition hover:bg-cream/70"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-cream">
                <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-cocoa">{product.name}</p>
                <p className="text-xs text-cocoa/50">{product.category_name}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-cocoa">
                {inr(product.discounted_price ?? product.price)}
              </span>
              <ArrowRight size={15} className="shrink-0 text-cocoa/30" />
            </button>
          ))}

          {term.trim().length >= 2 && results.length > 0 && (
            <button
              onClick={() => goToAll(term)}
              className="mt-1 flex w-full items-center justify-between rounded-2xl bg-cream/60 px-4 py-3 text-sm font-semibold text-cocoa transition hover:bg-cream"
            >
              See all results for “{term}”
              <ArrowRight size={15} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-cocoa/10 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-cocoa/40">
          <span>Press Enter to search</span>
          <span>Esc to close</span>
        </div>
      </div>
    </Modal>
  )
}
