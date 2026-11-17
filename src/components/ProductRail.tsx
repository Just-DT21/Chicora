import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MoveHorizontal } from 'lucide-react'
import type { Product } from '@shared/types'
import { ProductCard, ProductCardSkeleton } from './ProductCard'
import { cn } from '@/lib/format'

interface ProductRailProps {
  products: Product[]
  loading: boolean
  error?: string | null
  onOpen: (product: Product, intent?: 'details' | 'book') => void
  onRetry?: () => void
}

/**
 * A physical-feeling gift rail: draggable sideways, snapping cards, 3D-lifting
 * hover. Adapted from the 21st.dev Product Rail Gallery, rebuilt around gifts
 * and CHICORA's booking actions rather than garments on hangers.
 */
export function ProductRail({ products, loading, error, onOpen, onRetry }: ProductRailProps) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 })
  const [progress, setProgress] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [dragging, setDragging] = useState(false)

  const measure = useCallback(() => {
    const node = railRef.current
    if (!node) return
    const max = node.scrollWidth - node.clientWidth
    const ratio = max > 4 ? node.scrollLeft / max : 0
    setProgress(ratio)
    setAtStart(node.scrollLeft < 8)
    setAtEnd(max - node.scrollLeft < 8)
  }, [])

  useEffect(() => {
    measure()
    const node = railRef.current
    if (!node) return
    const handler = () => measure()
    node.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', handler)
    return () => {
      node.removeEventListener('scroll', handler)
      window.removeEventListener('resize', handler)
    }
  }, [measure, products.length])

  const scrollByCards = (direction: number) => {
    const node = railRef.current
    if (!node) return
    const card = node.querySelector<HTMLElement>('[data-rail-card]')
    const gap = 20
    const amount = (card?.offsetWidth ?? 300) + gap
    node.scrollBy({ left: direction * amount * 1.5, behavior: 'smooth' })
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const node = railRef.current
    if (!node) return
    drag.current = { active: true, startX: event.clientX, startScroll: node.scrollLeft, moved: 0 }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = railRef.current
    if (!node || !drag.current.active) return
    const dx = event.clientX - drag.current.startX
    if (Math.abs(dx) > 4) drag.current.moved = Math.abs(dx)
    node.scrollLeft = drag.current.startScroll - dx
  }

  const endDrag = () => {
    drag.current.active = false
    setDragging(false)
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Featured collection · 01</p>
          <h2 className="display-lg mt-3 text-cocoa">
            The little things
            <br />
            that mean <span className="italic text-amber-deep">a lot.</span>
          </h2>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="mr-2 hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cocoa/35 lg:flex">
            <MoveHorizontal size={13} /> Drag to explore
          </span>
          <button
            onClick={() => scrollByCards(-1)}
            disabled={atStart}
            aria-label="Scroll gifts left"
            className="grid h-11 w-11 place-items-center rounded-full border border-cocoa/15 text-cocoa/70 transition hover:border-cocoa hover:bg-cocoa hover:text-warmwhite disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cocoa/70"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            onClick={() => scrollByCards(1)}
            disabled={atEnd}
            aria-label="Scroll gifts right"
            className="grid h-11 w-11 place-items-center rounded-full border border-cocoa/15 text-cocoa/70 transition hover:border-cocoa hover:bg-cocoa hover:text-warmwhite disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cocoa/70"
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-cherry/25 bg-[#FDF1EC] p-5">
          <p className="text-sm text-cherry">{error}</p>
          {onRetry && (
            <button onClick={onRetry} className="btn btn-outline !py-2.5">
              Try again
            </button>
          )}
        </div>
      )}

      {!error && (
        <div className="relative">
          <div
            ref={railRef}
            role="region"
            aria-label="Featured gifts"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                scrollByCards(1)
              }
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                scrollByCards(-1)
              }
            }}
            className={cn(
              'no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 pt-1',
              dragging ? 'cursor-grabbing select-none' : 'cursor-grab',
            )}
            style={{ overscrollBehaviorX: 'contain' }}
          >
            {loading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} data-rail-card>
                  <ProductCardSkeleton variant="rail" />
                </div>
              ))}

            {!loading &&
              products.map((product, index) => (
                <div key={product.id} data-rail-card onClickCapture={(event) => {
                  if (drag.current.moved > 6) {
                    event.stopPropagation()
                    event.preventDefault()
                  }
                }}>
                  <ProductCard product={product} onOpen={onOpen} variant="rail" index={index} />
                </div>
              ))}
          </div>

          {!loading && products.length > 0 && (
            <div className="mt-2 flex items-center gap-4">
              <div className="h-px flex-1 bg-cocoa/12">
                <div
                  className="h-px bg-cocoa transition-[width] duration-150"
                  style={{ width: `${Math.max(12, progress * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] tracking-wider text-cocoa/40">
                {String(Math.round(progress * Math.max(products.length - 1)) + 1).padStart(2, '0')} /{' '}
                {String(products.length).padStart(2, '0')}
              </span>
            </div>
          )}

          {!loading && products.length === 0 && !error && (
            <div className="rounded-3xl border border-dashed border-cocoa/20 p-10 text-center">
              <p className="font-display text-2xl text-cocoa">The rail is being restocked.</p>
              <p className="mt-1 text-sm text-cocoa/55">New little things arrive every week.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
