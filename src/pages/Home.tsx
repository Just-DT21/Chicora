import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, Gift, Search, Sparkles, Store } from 'lucide-react'
import type { Product } from '@shared/types'
import { api } from '@/lib/api'
import { useStore } from '@/context/StoreContext'
import { ProductRail } from '@/components/ProductRail'
import { ProductModal } from '@/components/ProductModal'
import { GiftBox3D, MiniGiftBox } from '@/components/GiftBox3D'

const PUNCHLINES = [
  'Not just a gift. A whole little moment.',
  'Because ordinary presents are boring.',
  'Make their day unexpectedly beautiful.',
  'A little box. A ridiculously big smile.',
  'Good taste comes wrapped.',
]

export function Home() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Product | null>(null)
  const [intent, setIntent] = useState<'details' | 'book'>('details')
  const { config } = useStore()

  const loadFeatured = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { products: featured } = await api.products({ featured: true, limit: 8 })
      setProducts(featured)
    } catch {
      setError('We could not load the collection. The shop is still open — try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFeatured()
  }, [loadFeatured])

  const openProduct = (product: Product, nextIntent: 'details' | 'book' = 'details') => {
    setActive(product)
    setIntent(nextIntent)
  }

  return (
    <>
      <Hero />
      <PunchlineMarquee />
      <section className="container-x relative py-16 sm:py-24">
        <ProductRail
          products={products}
          loading={loading}
          error={error}
          onOpen={openProduct}
          onRetry={loadFeatured}
        />
        <div className="mt-8 flex justify-end">
          <Link to="/catalogue" className="group inline-flex items-center gap-2 text-sm font-bold text-cocoa">
            <span className="link-underline">See every gift in the shop</span>
            <span className="grid h-8 w-8 place-items-center rounded-full border border-cocoa/20 transition group-hover:bg-cocoa group-hover:text-warmwhite">
              <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </section>
      <BrandStatement />
      <BookingSteps />
      <FinalCTA storePhone={config?.store.phone} />
      <ProductModal
        product={active}
        open={Boolean(active)}
        initialIntent={intent}
        onClose={() => setActive(null)}
        onBooked={loadFeatured}
      />
    </>
  )
}

/* ---------------------------------------------------------------------- hero */
function Hero() {
  const ref = useRef<HTMLElement | null>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const boxY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90])
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0.35])

  const reveal = (index: number) => ({
    initial: { y: '115%' },
    animate: { y: 0 },
    transition: { duration: 1.05, delay: 0.15 + index * 0.09, ease: [0.16, 1, 0.3, 1] as const },
  })

  return (
    <section ref={ref} className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pb-10 pt-28 sm:pt-32">
      <div className="container-x relative grid items-center gap-4 lg:grid-cols-[1.04fr_0.96fr]">
        <motion.div style={{ y: copyY, opacity: fade }} className="relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex items-center gap-3"
          >
            <span className="h-px w-9 bg-cocoa/30" />
            <p className="eyebrow !text-[0.62rem]">A gift boutique · Indiranagar · Est. 2024</p>
          </motion.div>

          <h1
            className="display-xl mt-5 text-cocoa"
            aria-label="The art of making someone's day."
          >
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block" {...reveal(0)}>
                THE ART
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block" {...reveal(1)}>
                OF MAKING
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block italic text-amber-deep" {...reveal(2)}>
                someone’s
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.04em]">
              <motion.span className="block" {...reveal(3)}>
                DAY.
              </motion.span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.72, duration: 0.7 }}
            className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-cocoa/65 sm:text-base"
          >
            Some gifts are wrapped. Some become memories. Find something worth giving at CHICORA.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.7 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link to="/catalogue" className="btn btn-primary !px-7 !py-4">
              Explore the collection <ArrowRight size={15} />
            </Link>
            <a href="#booking" className="btn btn-outline !px-6 !py-4">
              How booking works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cocoa/45"
          >
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" /> 10% to reserve
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Balance at pickup
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-clay" /> No delivery, by design
            </span>
          </motion.div>
        </motion.div>

        <motion.div style={{ y: boxY }} className="relative">
          <p className="pointer-events-none absolute -left-2 top-6 hidden -rotate-90 font-sans text-[9px] font-bold uppercase tracking-[0.4em] text-cocoa/30 xl:block">
            Chicora / The gift issue
          </p>

          <GiftBox3D />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: -7 }}
            transition={{ delay: 1.05, type: 'spring', stiffness: 160, damping: 16 }}
            className="sticker absolute left-0 top-[4%] max-w-[200px] !items-start !rounded-2xl !px-3.5 !py-2.5 text-left sm:left-[2%]"
          >
            <Sparkles size={13} className="mt-0.5 shrink-0 text-amber-deep" />
            <span className="leading-snug">{PUNCHLINES[0]}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: 8 }}
            animate={{ opacity: 1, scale: 1, rotate: 5 }}
            transition={{ delay: 1.25, type: 'spring', stiffness: 150, damping: 15 }}
            className="sticker absolute bottom-[8%] right-0 max-w-[190px] !items-start !rounded-2xl !px-3.5 !py-2.5 text-left sm:right-[3%]"
          >
            <Gift size={13} className="mt-0.5 shrink-0 text-cherry" />
            <span className="leading-snug">{PUNCHLINES[3]}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.45, duration: 0.6 }}
            className="absolute bottom-[1%] left-[8%] hidden items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-cocoa/35 sm:flex"
          >
            <ArrowDown size={11} className="animate-floaty" /> Scroll to explore
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ marquee */
function PunchlineMarquee() {
  const items = [
    ...PUNCHLINES,
    'Wrapped by hand, since 2024.',
  ]
  return (
    <div className="relative z-10 overflow-hidden border-y border-cocoa/10 bg-amber/90 py-3.5">
      <div className="flex w-max animate-marquee items-center gap-8 will-change-transform">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-8" aria-hidden={copy === 1}>
            {items.map((phrase) => (
              <span key={`${copy}-${phrase}`} className="flex items-center gap-8">
                <span className="font-display text-[0.95rem] italic tracking-tight text-cocoa sm:text-base">{phrase}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#39271D" className="shrink-0 opacity-60">
                  <path d="M12 1c.9 7.5 3.6 10.2 11 11-7.4.9-10.1 3.6-11 11-.9-7.4-3.6-10.1-11-11C8.4 11.2 11.1 8.5 12 1Z" />
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ statement */
function BrandStatement() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const tilt = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 4, reduce ? 0 : -4])

  return (
    <section ref={ref} className="relative overflow-hidden border-y border-cocoa/10 bg-cream/60 py-16 sm:py-24">
      <div className="container-x">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="eyebrow">The Chicora way · 02</p>
            <h2 className="display-lg mt-4 max-w-3xl text-cocoa">
              Every gift has
              <br />a <span className="italic text-amber-deep">little story.</span>
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-cocoa/65 lg:pb-2">
            Whether it’s a birthday, a celebration, a random Tuesday or simply an excuse to make someone smile,
            CHICORA helps you find something worth remembering.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <motion.div style={{ rotate: tilt }} className="relative mx-auto w-full max-w-md">
            <div className="relative aspect-[4/3]">
              <div className="absolute left-0 top-0 h-[74%] w-[58%] -rotate-6 overflow-hidden rounded-2xl border border-cocoa/10 shadow-soft">
                <img src="/products/gift-box.svg" alt="Amber gift box with a red bow" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="absolute bottom-0 right-0 h-[68%] w-[54%] rotate-3 overflow-hidden rounded-2xl border border-cocoa/10 shadow-lift">
                <img src="/products/candle.svg" alt="A hand-poured candle in a clay vessel" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="absolute left-[38%] top-[12%] flex h-24 w-24 rotate-6 items-center justify-center rounded-full border border-cocoa/10 bg-warmwhite shadow-soft">
                <div className="text-center">
                  <p className="font-display text-2xl leading-none text-cocoa">4.9</p>
                  <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-cocoa/45">average smile</p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center font-display text-sm italic text-cocoa/45">
              “I came in for a card. I left with a whole paper bag of feelings.”
            </p>
          </motion.div>

          <div className="relative">
            <p className="font-display text-[clamp(1.6rem,3.4vw,2.9rem)] leading-[1.1] tracking-[-0.02em] text-cocoa">
              “Some gifts are wrapped.
              <br />
              <span className="italic text-amber-deep">Some become memories.”</span>
            </p>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-cocoa/65">
              We are a small shop with a large opinion about gifts. Everything on the shelves is chosen because it
              made us feel something first — the weight of a mug, the nonsense of a balloon, the perfect crisp fold of
              a ribbon. Nothing is drop-shipped. Nothing is filler. If we would not give it to our own person, it does
              not make it onto the shelf.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-cocoa/15 pt-6">
              {[
                { value: '500+', label: 'gifts wrapped' },
                { value: '1', label: 'tiny shop' },
                { value: '0', label: 'delivery vans' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-3xl tracking-tight text-cocoa">{stat.value}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-cocoa/45">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- booking */
const STEPS = [
  {
    number: '01',
    icon: Search,
    title: 'Find your gift',
    text: 'Explore the collection and choose something you love. Every piece is in the shop, photographed as it is.',
    note: 'Browse at your own pace',
  },
  {
    number: '02',
    icon: Gift,
    title: 'Reserve your pick',
    text: 'Pay just 10% of the product price by UPI to reserve it. The shop verifies your payment, then holds it behind the counter.',
    note: '10% advance · UPI',
  },
  {
    number: '03',
    icon: Store,
    title: 'Pick it up',
    text: 'Visit our physical shop, pay the remaining balance and collect your beautifully packed gift.',
    note: 'Balance at the counter',
  },
]

function BookingSteps() {
  const { config } = useStore()
  return (
    <section id="booking" className="scroll-mt-24 px-3 py-16 sm:px-5 sm:py-24">
      <div className="relative mx-auto max-w-[1320px] overflow-hidden rounded-[2.5rem] bg-cocoa px-5 py-12 text-warmwhite sm:px-10 sm:py-16 lg:px-14">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-clay/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber">Booking, simply · 03</p>
            <h2 className="display-lg mt-4 max-w-xl text-warmwhite">
              Three little steps
              <br />
              to a <span className="italic text-amber">very good gift.</span>
            </h2>
          </div>
          <div className="max-w-xs rounded-2xl border border-warmwhite/15 bg-warmwhite/5 p-4">
            <p className="font-display text-lg italic text-warmwhite/90">₹100 holds a ₹1,000 gift.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-warmwhite/55">
              The remaining ₹900 is paid when you collect it. Reserve for up to {config?.policy.pickupHoldDays ?? 7}{' '}
              days.
            </p>
          </div>
        </div>

        <div className="relative mt-10 grid gap-4 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-12 hidden border-t border-dashed border-warmwhite/20 md:block" aria-hidden="true" />
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="relative rounded-3xl border border-warmwhite/12 bg-warmwhite/[0.04] p-6 backdrop-blur-sm transition hover:border-amber/40 hover:bg-warmwhite/[0.07]"
            >
              <div className="flex items-start justify-between">
                <span className="font-display text-[3.4rem] leading-none tracking-tight text-amber/80">{step.number}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full border border-warmwhite/20 bg-warmwhite/5 text-amber">
                  <step.icon size={17} strokeWidth={1.6} />
                </span>
              </div>
              <h3 className="mt-5 font-display text-2xl text-warmwhite">{step.title}</h3>
              <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-warmwhite/60">{step.text}</p>
              <p className="mt-4 border-t border-warmwhite/12 pt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-amber/75">
                {step.note}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="relative mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="max-w-lg text-xs leading-relaxed text-warmwhite/45">
            No shipping, no home delivery — everything is collected in person. Reserved gifts are packed and kept
            behind the counter until you arrive.
          </p>
          <Link to="/catalogue" className="btn btn-amber shrink-0">
            Start with step one <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- final CTA */
function FinalCTA({ storePhone }: { storePhone?: string }) {
  return (
    <section className="container-x relative overflow-hidden py-14 sm:py-20">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-amber/40 bg-gradient-to-br from-[#F7C98D] via-[#EFB161] to-[#E9A23B] px-5 py-14 sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full border border-cocoa/10" />
          <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full border border-cocoa/10" />
          <div className="absolute right-8 top-8 hidden rotate-12 sm:block">
            <MiniGiftBox className="h-20 w-20" />
          </div>
          <p className="absolute -bottom-6 left-0 select-none font-display text-[8rem] leading-none tracking-[-0.05em] text-cocoa/[0.06] sm:text-[13rem]">
            CHICORA
          </p>
        </div>

        <div className="relative max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cocoa/55">The last little nudge · 04</p>
          <h2 className="display-lg mt-4 text-cocoa">
            Your next great gift
            <br />
            is <span className="italic">waiting.</span>
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-cocoa/65">
            Come for the gift. Stay for the wrapping. Leave with the kind of thing they will still be talking about
            next year.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/catalogue" className="btn btn-primary !px-7 !py-4">
              Explore CHICORA <ArrowUpRight size={16} />
            </Link>
            <a href={`tel:${(storePhone ?? '').replace(/\s/g, '')}`} className="btn btn-outline !border-cocoa/30 !px-6 !py-4">
              Ask us anything
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
