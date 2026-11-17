import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Filter, Loader2, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Category, Product } from '@shared/types'
import { api } from '@/lib/api'
import { cn, inr } from '@/lib/format'
import { ProductCard, ProductCardSkeleton } from '@/components/ProductCard'
import { ProductModal } from '@/components/ProductModal'
import { Modal } from '@/components/ui/Modal'

type SortKey = 'featured' | 'newest' | 'price_asc' | 'price_desc'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured first' },
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]

const PRICE_PRESETS = [
  { label: 'Under ₹1,000', min: 0, max: 1000 },
  { label: '₹1,000 – ₹2,000', min: 1000, max: 2000 },
  { label: '₹2,000 – ₹3,000', min: 2000, max: 3000 },
  { label: '₹3,000+', min: 3000, max: undefined },
]

const priceOf = (p: Product) => p.discounted_price ?? p.price

export function Catalogue() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Product | null>(null)
  const [intent, setIntent] = useState<'details' | 'book'>('details')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? 'all'
  const sort = (params.get('sort') as SortKey) || 'featured'
  const productParam = params.get('p')

  const [search, setSearch] = useState(q)
  const [minPrice, setMinPrice] = useState<number | ''>('')
  const [maxPrice, setMaxPrice] = useState<number | ''>('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [newOnly, setNewOnly] = useState(false)
  const [featuredOnly, setFeaturedOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [productRes, categoryRes] = await Promise.all([api.products(), api.categories()])
      setProducts(productRes.products)
      setCategories(categoryRes.categories)
    } catch {
      setError('The collection could not load. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setSearch(q)
  }, [q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        if (search.trim() === (previous.get('q') ?? '')) return previous
        if (search.trim()) next.set('q', search.trim())
        else next.delete('q')
        next.delete('p')
        return next
      }, { replace: true })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search, setParams])

  const setParam = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  useEffect(() => {
    if (!productParam || active) return
    const found = products.find((p) => p.id === productParam)
    if (found) {
      setActive(found)
      setIntent('details')
    }
  }, [productParam, products, active])

  const closeModal = () => {
    setActive(null)
    if (productParam) setParam('p', null)
  }

  const openProduct = (product: Product, nextIntent: 'details' | 'book' = 'details') => {
    setActive(product)
    setIntent(nextIntent)
  }

  const resetFilters = () => {
    setSearch('')
    setMinPrice('')
    setMaxPrice('')
    setInStockOnly(false)
    setNewOnly(false)
    setFeaturedOnly(false)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      ;['q', 'category', 'sort', 'p'].forEach((key) => next.delete(key))
      return next
    })
  }

  const baseFiltered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return products.filter((product) => {
      if (!product.is_published) return false
      if (term) {
        const haystack = `${product.name} ${product.description} ${product.category_name ?? ''}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      if (minPrice !== '' && priceOf(product) < minPrice) return false
      if (maxPrice !== '' && priceOf(product) > maxPrice) return false
      if (inStockOnly && product.stock_quantity <= 0) return false
      if (newOnly && !product.is_new_arrival) return false
      if (featuredOnly && !product.is_featured) return false
      return true
    })
  }, [products, q, minPrice, maxPrice, inStockOnly, newOnly, featuredOnly])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const product of baseFiltered) {
      map.set(product.category_slug ?? '', (map.get(product.category_slug ?? '') ?? 0) + 1)
    }
    return map
  }, [baseFiltered])

  const filtered = useMemo(() => {
    let list = baseFiltered.filter((product) => category === 'all' || product.category_slug === category)
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'price_asc':
          return priceOf(a) - priceOf(b)
        case 'price_desc':
          return priceOf(b) - priceOf(a)
        case 'newest':
          return Date.parse(b.created_at) - Date.parse(a.created_at)
        default:
          if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
          if ((a.stock_quantity === 0) !== (b.stock_quantity === 0)) return a.stock_quantity === 0 ? 1 : -1
          return Date.parse(b.created_at) - Date.parse(a.created_at)
      }
    })
    return list
  }, [baseFiltered, category, sort])

  const activeFilterCount =
    (category !== 'all' ? 1 : 0) +
    (q ? 1 : 0) +
    (minPrice !== '' || maxPrice !== '' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (newOnly ? 1 : 0) +
    (featuredOnly ? 1 : 0)

  const activeCategoryName = categories.find((c) => c.slug === category)?.name

  const filterProps = {
    categories,
    counts,
    category,
    setCategory: (value: string) => setParam('category', value === 'all' ? null : value),
    minPrice,
    maxPrice,
    setMinPrice,
    setMaxPrice,
    inStockOnly,
    setInStockOnly,
    newOnly,
    setNewOnly,
    featuredOnly,
    setFeaturedOnly,
    reset: resetFilters,
    total: baseFiltered.length,
  }

  return (
    <>
      <section className="relative pb-10 pt-32 sm:pt-40">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-9 bg-cocoa/30" />
                <p className="eyebrow !text-[0.62rem]">The gift collection · 2026</p>
              </div>
              <h1 className="display-xl mt-4 text-cocoa">
                THE CHICORA
                <br />
                <span className="italic text-amber-deep">COLLECTION.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-cocoa/60">
                Find the perfect little something. Everything is in the shop, wrapped by hand and reserved with a 10%
                advance.
              </p>
            </div>
            <div className="flex max-w-xs items-center gap-3 rounded-2xl border border-cocoa/10 bg-warmwhite/60 p-4 backdrop-blur">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber/25 text-amber-deep">
                <SlidersHorizontal size={16} />
              </span>
              <p className="text-[11px] leading-relaxed text-cocoa/60">
                {loading ? 'Bringing the shelves into view…' : `${products.length} gifts on the shelves. Pickup only, always.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x pb-20">
        <div className="border-y border-cocoa/12 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              onSubmit={(event) => event.preventDefault()}
              className="flex flex-1 items-center gap-2.5 rounded-full border border-cocoa/15 bg-[#FFFDF8] px-4 py-2.5 transition focus-within:border-amber focus-within:shadow-[0_0_0_4px_rgba(233,162,59,0.14)]"
            >
              <Search size={17} className="shrink-0 text-cocoa/40" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the collection — candles, plush, birthday…"
                aria-label="Search products"
                className="w-full bg-transparent text-sm text-cocoa outline-none placeholder:text-cocoa/40"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-cocoa/40 hover:text-cocoa">
                  <X size={15} />
                </button>
              )}
            </form>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltersOpen(true)}
                className="chip lg:hidden"
                aria-label={`Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
              >
                <Filter size={13} /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
              </button>
              <label className="relative flex items-center gap-2 rounded-full border border-cocoa/15 bg-[#FFFDF8] px-3.5 py-2.5">
                <span className="hidden text-[9px] font-bold uppercase tracking-[0.14em] text-cocoa/40 sm:inline">Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setParam('sort', event.target.value === 'featured' ? null : event.target.value)}
                  aria-label="Sort products"
                  className="cursor-pointer appearance-none bg-transparent pr-4 text-xs font-semibold text-cocoa outline-none"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cocoa/40">▾</span>
              </label>
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-9">
          <aside className="hidden w-[236px] shrink-0 lg:block">
            <div className="sticky top-28">
              <FilterPanel {...filterProps} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-cocoa/50">
                <span className="font-bold text-cocoa">{filtered.length}</span>{' '}
                {filtered.length === 1 ? 'gift' : 'gifts'}
                {activeCategoryName ? ` in ${activeCategoryName}` : ''}
                {q ? ` matching “${q}”` : ''}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cocoa/45 transition hover:text-cocoa">
                  <RotateCcw size={11} /> Clear all filters
                </button>
              )}
            </div>

            <div className="no-scrollbar -mx-1 mb-7 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
              <button onClick={() => setParam('category', null)} className={cn('chip shrink-0', category === 'all' && 'chip-active')}>
                All gifts
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setParam('category', c.slug)}
                  className={cn('chip shrink-0', category === c.slug && 'chip-active')}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {error && (
              <div className="rounded-3xl border border-cherry/25 bg-[#FDF1EC] p-8 text-center">
                <p className="font-display text-2xl text-cocoa">The shelves went quiet.</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-cocoa/60">{error}</p>
                <button onClick={load} className="btn btn-primary mt-5">
                  Reload the collection
                </button>
              </div>
            )}

            {!error && loading && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </div>
            )}

            {!error && !loading && filtered.length > 0 && (
              <motion.div layout className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((product, index) => (
                  <ProductCard key={product.id} product={product} onOpen={openProduct} index={index} />
                ))}
              </motion.div>
            )}

            {!error && !loading && filtered.length === 0 && (
              <div className="rounded-3xl border border-dashed border-cocoa/20 bg-warmwhite/40 px-6 py-16 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-cream">
                  <Search size={22} className="text-amber-deep" />
                </span>
                <h2 className="mt-5 font-display text-3xl text-cocoa">Nothing here. Yet.</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-cocoa/55">
                  No gifts match that combination. The shelves are small but curious — try loosening a filter or two.
                </p>
                <button onClick={resetFilters} className="btn btn-primary mt-5">
                  Clear filters <RotateCcw size={13} />
                </button>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {['birthday-gifts', 'cute-gifts', 'accessories'].map((slug) => {
                    const found = categories.find((c) => c.slug === slug)
                    if (!found) return null
                    return (
                      <button key={slug} onClick={resetFilters} className="hidden" aria-hidden="true">
                        {found.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-16 flex flex-col items-start justify-between gap-4 rounded-2xl bg-cream/70 px-6 py-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-display text-lg text-cocoa">Not sure what to choose?</p>
                <p className="mt-0.5 text-xs text-cocoa/55">Tell us the person. We are unreasonably good at this.</p>
              </div>
              <a href="mailto:hello@chicora.in" className="btn btn-outline !py-2.5">
                Ask CHICORA <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} align="right" panelClassName="h-full max-h-none w-full max-w-sm">
        <div className="flex h-full flex-col bg-warmwhite">
          <div className="flex items-center justify-between border-b border-cocoa/10 px-5 py-4">
            <div>
              <p className="eyebrow">Narrow it down</p>
              <h2 className="mt-1 font-display text-2xl text-cocoa">Filters</h2>
            </div>
            <button onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="grid h-9 w-9 place-items-center rounded-full border border-cocoa/15 text-cocoa/60">
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <FilterPanel {...filterProps} />
          </div>
          <div className="border-t border-cocoa/10 p-4">
            <button onClick={() => setFiltersOpen(false)} className="btn btn-primary w-full">
              Show {filtered.length} {filtered.length === 1 ? 'gift' : 'gifts'}
            </button>
          </div>
        </div>
      </Modal>

      <ProductModal
        product={active}
        open={Boolean(active)}
        initialIntent={intent}
        onClose={closeModal}
        onBooked={load}
      />
    </>
  )
}

interface FilterPanelProps {
  categories: Category[]
  counts: Map<string, number>
  category: string
  setCategory: (value: string) => void
  minPrice: number | ''
  maxPrice: number | ''
  setMinPrice: (value: number | '') => void
  setMaxPrice: (value: number | '') => void
  inStockOnly: boolean
  setInStockOnly: (value: boolean) => void
  newOnly: boolean
  setNewOnly: (value: boolean) => void
  featuredOnly: boolean
  setFeaturedOnly: (value: boolean) => void
  reset: () => void
  total: number
}

function FilterPanel({
  categories,
  counts,
  category,
  setCategory,
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
  inStockOnly,
  setInStockOnly,
  newOnly,
  setNewOnly,
  featuredOnly,
  setFeaturedOnly,
  reset,
  total,
}: FilterPanelProps) {
  const totalCount = Array.from(counts.values()).reduce((sum, n) => sum + n, 0)
  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cocoa/45">Category</h3>
          <button onClick={reset} className="text-[10px] font-semibold text-cocoa/40 underline decoration-cocoa/20 underline-offset-2 hover:text-cocoa">
            reset
          </button>
        </div>
        <ul className="mt-3 space-y-0.5">
          <li>
            <button
              onClick={() => setCategory('all')}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[13px] transition',
                category === 'all' ? 'bg-cocoa text-warmwhite' : 'text-cocoa/65 hover:bg-cocoa/5 hover:text-cocoa',
              )}
            >
              <span>All Gifts</span>
              <span className={cn('text-[10px]', category === 'all' ? 'text-warmwhite/50' : 'text-cocoa/35')}>{totalCount}</span>
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setCategory(c.slug)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition',
                  category === c.slug ? 'bg-cocoa text-warmwhite' : 'text-cocoa/65 hover:bg-cocoa/5 hover:text-cocoa',
                )}
              >
                <span className="truncate">{c.name}</span>
                <span className={cn('text-[10px]', category === c.slug ? 'text-warmwhite/50' : 'text-cocoa/35')}>
                  {counts.get(c.slug) ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-cocoa/10 pt-6">
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cocoa/45">Price range</h3>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value === '' ? '' : Math.max(0, Number(event.target.value)))}
            placeholder="Min"
            aria-label="Minimum price"
            className="field !py-2 !text-xs"
          />
          <span className="text-cocoa/30">–</span>
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value === '' ? '' : Math.max(0, Number(event.target.value)))}
            placeholder="Max"
            aria-label="Maximum price"
            className="field !py-2 !text-xs"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const active = minPrice === preset.min && (maxPrice === (preset.max ?? ''))
            return (
              <button
                key={preset.label}
                onClick={() => {
                  if (active) {
                    setMinPrice('')
                    setMaxPrice('')
                  } else {
                    setMinPrice(preset.min)
                    setMaxPrice(preset.max ?? '')
                  }
                }}
                className={cn('chip !px-2.5 !py-1.5 !text-[10px]', active && 'chip-active')}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        {(minPrice !== '' || maxPrice !== '') && (
          <p className="mt-2 text-[10px] text-cocoa/45">
            Showing {inr(typeof minPrice === 'number' ? minPrice : 0)} –{' '}
            {typeof maxPrice === 'number' ? inr(maxPrice) : 'no limit'}
          </p>
        )}
      </div>

      <div className="border-t border-cocoa/10 pt-6">
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cocoa/45">Availability</h3>
        <div className="mt-3 space-y-2.5">
          {[
            { label: 'In stock only', checked: inStockOnly, set: setInStockOnly },
            { label: 'New arrivals', checked: newOnly, set: setNewOnly },
            { label: 'Featured gifts', checked: featuredOnly, set: setFeaturedOnly },
          ].map((option) => (
            <label key={option.label} className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-cocoa/70">
              <span>{option.label}</span>
              <span
                className={cn(
                  'relative h-5 w-9 rounded-full transition',
                  option.checked ? 'bg-cocoa' : 'bg-cocoa/15',
                )}
              >
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={(event) => option.set(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-warmwhite shadow transition-all',
                    option.checked ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </span>
            </label>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-cream/70 px-3 py-2.5 text-[10px] leading-relaxed text-cocoa/50">
          {total} {total === 1 ? 'gift matches' : 'gifts match'} currently. Sold-out pieces can still be viewed; ask us
          about a restock.
        </p>
      </div>

      <div className="rounded-2xl bg-cocoa p-4 text-warmwhite">
        <p className="font-display text-lg leading-tight">10% now.</p>
        <p className="mt-1 text-[11px] leading-relaxed text-warmwhite/55">The rest when you collect it in the shop.</p>
      </div>
    </div>
  )
}
