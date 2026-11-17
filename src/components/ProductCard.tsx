import { motion } from 'framer-motion'
import { ArrowUpRight, Eye, Sparkles } from 'lucide-react'
import type { Product } from '@shared/types'
import { cn, inr, stockLabel } from '@/lib/format'

interface ProductCardProps {
  product: Product
  onOpen: (product: Product, intent?: 'details' | 'book') => void
  variant?: 'grid' | 'rail'
  index?: number
}

export function ProductCard({ product, onOpen, variant = 'grid', index = 0 }: ProductCardProps) {
  const price = product.discounted_price ?? product.price
  const onSale = Boolean(product.discounted_price && product.discounted_price < product.price)
  const soldOut = product.stock_quantity <= 0
  const lowStock = product.stock_quantity > 0 && product.stock_quantity <= 3

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className={cn('group flex flex-col', variant === 'rail' && 'w-[268px] shrink-0 snap-start sm:w-[300px]')}
    >
      <div className="relative overflow-hidden rounded-[1.5rem] border border-cocoa/10 bg-cream">
        <button
          type="button"
          onClick={() => onOpen(product)}
          className="block w-full text-left"
          aria-label={`View ${product.name}`}
        >
          <div className="aspect-[4/5] overflow-hidden">
            <img
              src={product.images[0] || '/products/gift-box.svg'}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={cn(
                'h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]',
                soldOut && 'opacity-80 saturate-[0.65]',
              )}
            />
          </div>
        </button>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="flex flex-wrap gap-1.5">
            {soldOut ? (
              <span className="rounded-full bg-cocoa px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-warmwhite">
                Sold out
              </span>
            ) : (
              <>
                {product.is_new_arrival && (
                  <span className="rounded-full bg-warmwhite/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-cocoa backdrop-blur">
                    New in
                  </span>
                )}
                {product.is_featured && (
                  <span className="rounded-full bg-cocoa/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber backdrop-blur">
                    Loved
                  </span>
                )}
                {onSale && (
                  <span className="rounded-full bg-cherry px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-warmwhite">
                    Sale
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => onOpen(product)}
            aria-label={`Quick view ${product.name}`}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-cocoa/10 bg-warmwhite/90 text-cocoa/70 opacity-0 shadow-sm backdrop-blur transition duration-300 hover:bg-warmwhite hover:text-cocoa focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Eye size={14} />
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="flex items-center justify-between rounded-full bg-warmwhite/95 px-3.5 py-2 shadow-soft backdrop-blur">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-cocoa/60">
              {soldOut ? 'Back soon' : `${stockLabel(product.stock_quantity)}`}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-deep">Quick view</span>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-deep/80">
              {product.category_name}
            </p>
            <h3 className="mt-1 font-display text-[1.25rem] leading-[1.1] tracking-[-0.02em] text-cocoa">
              {product.name}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-sans text-[0.95rem] font-bold text-cocoa">{inr(price)}</p>
            {onSale && <p className="text-[11px] text-cocoa/40 line-through">{inr(product.price)}</p>}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              soldOut ? 'bg-cherry' : lowStock ? 'bg-amber' : 'bg-sage',
            )}
          />
          <span className={cn('text-[11px] font-semibold', soldOut ? 'text-cherry' : lowStock ? 'text-amber-deep' : 'text-cocoa/45')}>
            {soldOut ? 'Sold out — ask us for a restock' : lowStock ? stockLabel(product.stock_quantity) : 'In the shop now'}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <button
            onClick={() => onOpen(product)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-cocoa/15 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-cocoa/75 transition hover:border-cocoa/40 hover:text-cocoa"
          >
            View details <ArrowUpRight size={12} />
          </button>
          <button
            onClick={() => onOpen(product, 'book')}
            disabled={soldOut}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] transition',
              soldOut
                ? 'cursor-not-allowed bg-cocoa/10 text-cocoa/35'
                : 'bg-cocoa text-warmwhite hover:bg-amber-deep',
            )}
          >
            {soldOut ? 'Sold out' : 'Reserve now'} {!soldOut && <Sparkles size={12} />}
          </button>
        </div>
      </div>
    </motion.article>
  )
}

export function ProductCardSkeleton({ variant = 'grid' }: { variant?: 'grid' | 'rail' }) {
  return (
    <div className={cn('flex flex-col', variant === 'rail' && 'w-[268px] shrink-0 sm:w-[300px]')}>
      <div className="skeleton aspect-[4/5] rounded-[1.5rem]" />
      <div className="mt-4 space-y-2">
        <div className="skeleton h-2.5 w-20 rounded-full" />
        <div className="skeleton h-4 w-3/4 rounded-full" />
        <div className="skeleton h-3 w-1/3 rounded-full" />
      </div>
    </div>
  )
}
