import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUp, ArrowUpRight, Instagram, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { MiniGiftBox } from './GiftBox3D'

/* ------------------------------------------------------------------ drawings */
type CrewKind = 'bear' | 'ghost' | 'star' | 'bow' | 'bird'

const crewCopy: Record<CrewKind, string> = {
  bear: 'I’m wrapping. Give me a second.',
  ghost: 'Boo. (I’m the surprise.)',
  star: 'Told you — a whole little moment.',
  bow: 'The finishing touch, obviously.',
  bird: 'Delivery? No. Pickup, yes.',
}

function Bear() {
  return (
    <svg viewBox="0 0 120 112" className="h-full w-full">
      <g stroke="#39271D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="28" cy="26" r="15" fill="#E8A16A" />
        <circle cx="92" cy="26" r="15" fill="#E8A16A" />
        <circle cx="28" cy="26" r="7" fill="#F5EBDD" stroke="none" />
        <circle cx="92" cy="26" r="7" fill="#F5EBDD" stroke="none" />
        <path d="M60 18c24 0 42 18 42 42 0 26-18 44-42 44S18 86 18 60c0-24 18-42 42-42Z" fill="#E9A23B" />
        <ellipse cx="60" cy="72" rx="24" ry="19" fill="#FFF3DD" stroke="none" />
        <ellipse cx="60" cy="72" rx="24" ry="19" fill="none" />
        <path d="M60 70c4 0 7 3 7 6 0 4-3 6-7 6s-7-2-7-6c0-3 3-6 7-6Z" fill="#39271D" stroke="none" />
        <path d="M60 82v4M54 88c3 3 9 3 12 0" />
        <circle cx="43" cy="52" r="4" fill="#39271D" stroke="none" />
        <circle cx="77" cy="52" r="4" fill="#39271D" stroke="none" />
        <path d="M36 64c2-3 5-4 8-3M84 64c-2-3-5-4-8-3" stroke="#B87525" strokeWidth="2" />
        <path d="M26 106c2-9 8-14 14-12M94 106c-2-9-8-14-14-12" strokeWidth="3" />
      </g>
    </svg>
  )
}

function Ghost() {
  return (
    <svg viewBox="0 0 90 112" className="h-full w-full">
      <g stroke="#39271D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M12 96V46c0-20 14-34 33-34s33 14 33 34v50c-6-5-12-5-17 0-5-5-11-5-16 0-5-5-11-5-16 0-5-5-11-5-17 0Z"
          fill="#FFF9EF"
        />
        <circle cx="34" cy="48" r="4" fill="#39271D" stroke="none" />
        <circle cx="57" cy="48" r="4" fill="#39271D" stroke="none" />
        <path d="M39 60c4 4 10 4 13 0" />
        <ellipse cx="24" cy="60" rx="5" ry="3" fill="#E8A16A" stroke="none" opacity="0.7" />
        <ellipse cx="67" cy="60" rx="5" ry="3" fill="#E8A16A" stroke="none" opacity="0.7" />
        <path d="M42 16c3-6 9-8 13-3" stroke="#C9503C" strokeWidth="3" />
        <path d="M55 13l8 4-7 5" fill="#C9503C" stroke="none" />
      </g>
    </svg>
  )
}

function Star() {
  return (
    <svg viewBox="0 0 90 90" className="h-full w-full">
      <g stroke="#39271D" strokeWidth="2.4" strokeLinejoin="round">
        <path
          d="M45 6c4 13 8 21 15 25 9 5 18 6 24 7-11 5-18 11-22 19-4 8-6 17-8 27-5-14-9-22-16-27-7-5-16-8-27-10 12-4 20-8 25-15 4-6 7-14 9-26Z"
          fill="#E9A23B"
        />
        <circle cx="38" cy="43" r="2.6" fill="#39271D" stroke="none" />
        <circle cx="53" cy="43" r="2.6" fill="#39271D" stroke="none" />
        <path d="M39 52c4 4 9 4 13 0" />
      </g>
    </svg>
  )
}

function Bow() {
  return (
    <svg viewBox="0 0 96 76" className="h-full w-full">
      <g stroke="#39271D" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M46 34C34 14 8 12 8 26c0 14 22 18 38 8Z" fill="#C9503C" />
        <path d="M50 34c12-20 38-22 38-8 0 14-22 18-38 8Z" fill="#C9503C" />
        <path d="M42 42c-6 10-10 20-8 30 6-2 10-6 12-12 2-6 1-12 0-18Z" fill="#B84533" />
        <path d="M54 42c6 10 10 20 8 30-6-2-10-6-12-12-2-6-1-12 0-18Z" fill="#B84533" />
        <ellipse cx="48" cy="36" rx="9" ry="8" fill="#E86952" />
      </g>
    </svg>
  )
}

function Bird() {
  return (
    <svg viewBox="0 0 110 92" className="h-full w-full">
      <g stroke="#39271D" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M30 78c-4 8-2 12 4 12M62 78c4 8 2 12-4 12" />
        <path d="M18 44c-8-4-12-14-6-20 5-5 12-2 14 5" fill="#E8A16A" />
        <ellipse cx="52" cy="50" rx="30" ry="26" fill="#E9A23B" />
        <circle cx="62" cy="34" r="19" fill="#F3C27F" />
        <circle cx="67" cy="30" r="3" fill="#39271D" stroke="none" />
        <path d="M80 34l12 4-12 5Z" fill="#C9503C" />
        <path d="M40 48c8-8 18-6 22 4-8 8-18 6-22-4Z" fill="#F5EBDD" />
        <path d="M34 60c10 10 28 10 38 0" />
        <path d="M53 22c-2-8 3-13 9-10" stroke="#C9503C" strokeWidth="3" />
      </g>
    </svg>
  )
}

const CREW: { kind: CrewKind; className: string; size: string; rotate: number }[] = [
  { kind: 'bear', className: 'left-[2%] bottom-[68%]', size: 'w-[11%] min-w-[52px] max-w-[120px]', rotate: -6 },
  { kind: 'ghost', className: 'left-[44%] bottom-[74%]', size: 'w-[8%] min-w-[40px] max-w-[86px]', rotate: 3 },
  { kind: 'star', className: 'right-[13%] bottom-[72%]', size: 'w-[7%] min-w-[38px] max-w-[80px]', rotate: 8 },
  { kind: 'bow', className: 'left-[72%] bottom-[6%]', size: 'w-[9%] min-w-[44px] max-w-[96px]', rotate: -4 },
  { kind: 'bird', className: 'left-[26%] bottom-[2%]', size: 'w-[9%] min-w-[44px] max-w-[96px]', rotate: -3 },
]

function Doodles() {
  const reduce = useReducedMotion()
  if (reduce) return null
  const shapes = [
    { left: '6%', top: '8%', delay: 0, duration: 16, kind: 'star' },
    { left: '18%', top: '28%', delay: 3, duration: 20, kind: 'dot' },
    { left: '38%', top: '12%', delay: 6, duration: 18, kind: 'heart' },
    { left: '62%', top: '6%', delay: 1, duration: 22, kind: 'star' },
    { left: '78%', top: '22%', delay: 4, duration: 17, kind: 'dot' },
    { left: '88%', top: '44%', delay: 8, duration: 21, kind: 'heart' },
    { left: '52%', top: '36%', delay: 2, duration: 19, kind: 'dot' },
    { left: '30%', top: '52%', delay: 5, duration: 23, kind: 'star' },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {shapes.map((shape, index) => (
        <motion.span
          key={index}
          className="absolute text-amber-deep/25"
          style={{ left: shape.left, top: shape.top }}
          animate={{ y: [0, 22, 0], rotate: [0, 18, 0], opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: shape.duration, delay: shape.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          {shape.kind === 'star' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1c.9 7.5 3.6 10.2 11 11-7.4.9-10.1 3.6-11 11-.9-7.4-3.6-10.1-11-11C8.4 11.2 11.1 8.5 12 1Z" />
            </svg>
          ) : shape.kind === 'heart' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21C5 15 2 11.5 2 8c0-3 2.4-5 5-5 2 0 3.6 1 5 3 1.4-2 3-3 5-3 2.6 0 5 2 5 5 0 3.5-3 7-10 13Z" />
            </svg>
          ) : (
            <span className="block h-1.5 w-1.5 rounded-full bg-current" />
          )}
        </motion.span>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- footer */
export function DoodleFooter() {
  const { config } = useStore()
  const [talking, setTalking] = useState<CrewKind | null>(null)
  const store = config?.store
  const tagline = 'Not just a gift. A whole little moment.'

  const columns: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
    {
      title: 'Explore',
      links: [
        { label: 'Home', to: '/' },
        { label: 'Catalogue', to: '/catalogue' },
        { label: 'How booking works', to: '/#booking' },
        { label: 'Terms & conditions', to: '/terms' },
      ],
    },
    {
      title: 'Shop gifts',
      links: [
        { label: 'Birthday gifts', to: '/catalogue?category=birthday-gifts' },
        { label: 'Cute gifts', to: '/catalogue?category=cute-gifts' },
        { label: 'Couple gifts', to: '/catalogue?category=couple-gifts' },
        { label: 'Surprise boxes', to: '/catalogue?category=surprise-boxes' },
      ],
    },
    {
      title: 'Visit the shop',
      links: [
        { label: 'Pickup only', to: '/terms' },
        { label: '10% advance booking', to: '/terms' },
        { label: 'Collect within 7 days', to: '/terms' },
        { label: 'Contact us', href: `tel:${(store?.phone || '').replace(/\s/g, '')}` },
      ],
    },
  ]

  return (
    <footer className="relative mt-20 overflow-hidden rounded-t-[2.5rem] border-t border-cocoa/10 bg-cream/90">
      <Doodles />
      <div className="container-x relative pb-8 pt-14 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1.55fr]">
          <div>
            <div className="flex items-center gap-3">
              <MiniGiftBox className="h-10 w-10" />
              <span className="font-display text-3xl tracking-[-0.04em] text-cocoa">CHICORA</span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-cocoa/65">
              A small gift boutique for the big little moments. Curious objects, thoughtful wrapping, and a counter
              where we know your name.
            </p>
            <div className="mt-6 space-y-2.5 text-sm text-cocoa/70">
              <p className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                <span>{store?.address ?? '14, Palm Court Lane, Indiranagar, Bengaluru 560038'}</span>
              </p>
              <p className="flex items-start gap-2.5">
                <Phone size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                <a href={`tel:${(store?.phone ?? '').replace(/\s/g, '')}`} className="link-underline">
                  {store?.phone ?? '+91 98765 43210'}
                </a>
              </p>
              <p className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                <a href={`mailto:${store?.email ?? 'hello@chicora.in'}`} className="link-underline">
                  {store?.email ?? 'hello@chicora.in'}
                </a>
              </p>
              <p className="pl-[26px] text-xs text-cocoa/50">{store?.hours ?? 'Mon–Sat, 11:00–20:00 · Sun, 12:00–18:00'}</p>
            </div>

            <div className="mt-6 flex gap-2">
              <a
                href={store?.instagram || 'https://instagram.com/chicora'}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="CHICORA on Instagram"
                className="grid h-10 w-10 place-items-center rounded-full border border-cocoa/20 text-cocoa/70 transition hover:border-cocoa hover:bg-cocoa hover:text-warmwhite"
              >
                <Instagram size={16} />
              </a>
              <a
                href={`https://wa.me/${(store?.phone ?? '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Message CHICORA on WhatsApp"
                className="grid h-10 w-10 place-items-center rounded-full border border-cocoa/20 text-cocoa/70 transition hover:border-cocoa hover:bg-cocoa hover:text-warmwhite"
              >
                <MessageCircle size={16} />
              </a>
              <a
                href={`mailto:${store?.email ?? 'hello@chicora.in'}`}
                aria-label="Email CHICORA"
                className="grid h-10 w-10 place-items-center rounded-full border border-cocoa/20 text-cocoa/70 transition hover:border-cocoa hover:bg-cocoa hover:text-warmwhite"
              >
                <Mail size={16} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-cocoa/45">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <Link to={link.to} className="text-sm text-cocoa/70 transition hover:text-cocoa link-underline">
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="text-sm text-cocoa/70 transition hover:text-cocoa link-underline">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-cocoa/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-lg font-display text-lg italic leading-snug text-cocoa/70">
            Good taste comes wrapped. So does everything else we sell.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/catalogue" className="btn btn-primary !py-3">
              Explore the collection
            </Link>
            <Link to="/#booking" className="btn btn-outline !py-3">
              How booking works
            </Link>
          </div>
        </div>

        <div className="relative mt-14 select-none">
          <p className="mb-2 text-center font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-cocoa/40">
            {tagline}
          </p>
          <div className="relative">
            <div className="flex justify-center" aria-hidden="true">
              <span className="font-display text-[clamp(3.4rem,15.5vw,12rem)] font-semibold leading-[0.78] tracking-[-0.06em] text-cocoa">
                {'CHICORA'.split('').map((letter, index) => (
                  <motion.span
                    key={`${letter}-${index}`}
                    className="inline-block"
                    whileHover={{ y: -10, rotate: index % 2 ? 4 : -4 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            </div>
            {CREW.map((member) => (
              <button
                key={member.kind}
                onClick={() => setTalking((current) => (current === member.kind ? null : member.kind))}
                aria-label={`${member.kind}, click to say hello`}
                className={`absolute ${member.className} ${member.size} z-10 transition-transform duration-300 hover:-translate-y-1`}
                style={{ rotate: `${member.rotate}deg` }}
              >
                {member.kind === 'bear' && <Bear />}
                {member.kind === 'ghost' && <Ghost />}
                {member.kind === 'star' && <Star />}
                {member.kind === 'bow' && <Bow />}
                {member.kind === 'bird' && <Bird />}
                {talking === member.kind && (
                  <motion.span
                    initial={{ opacity: 0, y: 6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute bottom-[92%] left-1/2 z-20 w-max max-w-[180px] -translate-x-1/2 rounded-2xl rounded-bl-sm border border-cocoa/15 bg-warmwhite px-3 py-1.5 text-center font-sans text-[10px] font-semibold leading-snug text-cocoa shadow-soft"
                  >
                    {crewCopy[member.kind]}
                  </motion.span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-cocoa/10 pt-6 text-[11px] text-cocoa/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CHICORA. All rights reserved. No shipping — pickup only.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/terms" className="transition hover:text-cocoa">
              Terms & conditions
            </Link>
            <Link to="/terms#privacy" className="transition hover:text-cocoa">
              Booking policy
            </Link>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-1.5 transition hover:text-cocoa"
            >
              Back to top <ArrowUp size={12} />
            </button>
            <Link to="/admin" className="inline-flex items-center gap-1 text-cocoa/30 transition hover:text-cocoa">
              Admin <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
