import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useRef } from 'react'

const W = 300
const H = 224
const D = 258

const FRONT = 150 // W / 2
const SIDE = 129 // D / 2
const TOP = 112 // H / 2

function Face({
  width,
  height,
  transform,
  background,
  children,
  className = '',
}: {
  width: number
  height: number
  transform: string
  background: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`face overflow-hidden ${className}`}
      style={{
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        transform,
        background,
        boxShadow: 'inset 0 0 38px rgba(120,70,20,0.18)',
      }}
    >
      {children}
    </div>
  )
}

function Bow({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 240 170"
      width={small ? 132 : 212}
      height={small ? 94 : 150}
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 12px 14px rgba(70,30,10,0.32))' }}
    >
      <defs>
        <linearGradient id="bow-red" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E86952" />
          <stop offset="0.5" stopColor="#C9503C" />
          <stop offset="1" stopColor="#9E3628" />
        </linearGradient>
        <linearGradient id="bow-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M116 82C84 40 34 34 22 60c-12 26 22 52 90 34Z"
        fill="url(#bow-red)"
        stroke="#7E2A20"
        strokeWidth="2"
      />
      <path d="M112 80C88 46 50 40 34 56c-8 8 0 22 22 28 34 10 60 4 56-4Z" fill="url(#bow-shine)" />
      <path
        d="M124 82c32-42 82-48 94-22 12 26-22 52-90 34Z"
        fill="url(#bow-red)"
        stroke="#7E2A20"
        strokeWidth="2"
      />
      <path d="M128 80c24-34 62-40 78-24 8 8 0 22-22 28-34 10-60 4-56-4Z" fill="url(#bow-shine)" />
      <path d="M104 94c-14 20-24 34-26 58 10-4 20-2 28-12 8-12 8-30 6-46Z" fill="#C9503C" stroke="#7E2A20" strokeWidth="2" />
      <path d="M136 94c14 20 24 34 26 58-10-4-20-2-28-12-8-12-8-30-6-46Z" fill="#B84533" stroke="#7E2A20" strokeWidth="2" />
      <ellipse cx="120" cy="84" rx="21" ry="17" fill="#E86952" stroke="#7E2A20" strokeWidth="2" />
      <ellipse cx="114" cy="78" rx="7" ry="5" fill="#fff" opacity="0.45" />
    </svg>
  )
}

function Sparkle({ className, delay = 0, size = 18, color = '#E9A23B' }: { className: string; delay?: number; size?: number; color?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`absolute ${className}`}
      aria-hidden="true"
      animate={reduce ? undefined : { y: [0, -10, 0], rotate: [0, 12, 0] }}
      transition={{ duration: 5.5, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path d="M12 0c.9 8.2 3.8 11.1 12 12-8.2.9-11.1 3.8-12 12-.9-8.2-3.8-11.1-12-12C8.2 11.1 11.1 8.2 12 0Z" fill={color} />
    </motion.svg>
  )
}

/**
 * A hand-built 3D gift box: the CHICORA visual signature. It replaces the
 * Lycoris specimen's chrome flower with a wrapped, ribboned box while keeping
 * the layered specimen composition, scroll depth and pointer parallax.
 */
export function GiftBox3D() {
  const reduce = useReducedMotion()
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [18, -22]), { stiffness: 90, damping: 18 })
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-6, 10]), { stiffness: 90, damping: 18 })

  const spotX = useMotionValue(50)
  const spotY = useMotionValue(50)
  const glow = useTransform([spotX, spotY], ([x, y]) => `radial-gradient(circle at ${x}% ${y}%, rgba(255,244,220,0.9), rgba(255,244,220,0) 60%)`)

  return (
    <div
      ref={sceneRef}
      className="relative mx-auto flex h-[420px] w-full max-w-[520px] items-center justify-center sm:h-[500px]"
      onPointerMove={(event) => {
        if (reduce) return
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width - 0.5
        const y = (event.clientY - rect.top) / rect.height - 0.5
        px.set(x)
        py.set(y)
        spotX.set(((event.clientX - rect.left) / rect.width) * 100)
        spotY.set(((event.clientY - rect.top) / rect.height) * 100)
      }}
      onPointerLeave={() => {
        px.set(0)
        py.set(0)
        spotX.set(50)
        spotY.set(50)
      }}
    >
      {/* specimen rings and marks */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cocoa/15 sm:h-[400px] sm:w-[400px]" />
        <div className="absolute left-1/2 top-1/2 h-[264px] w-[264px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cocoa/10 sm:h-[330px] sm:w-[330px]" />
        <div className="absolute left-1/2 top-[14%] h-px w-16 -translate-x-1/2 bg-cocoa/20" />
        <span className="absolute left-1/2 top-[8%] -translate-x-1/2 font-sans text-[9px] font-bold uppercase tracking-[0.3em] text-cocoa/45">
          Specimen 01
        </span>
        <span className="absolute bottom-[6%] left-1/2 -translate-x-1/2 font-sans text-[9px] font-bold uppercase tracking-[0.3em] text-cocoa/45">
          The clown box
        </span>
        {[
          'left-[12%] top-[18%]',
          'right-[10%] top-[30%]',
          'left-[18%] bottom-[24%]',
          'right-[16%] bottom-[16%]',
        ].map((pos) => (
          <span key={pos} className={`absolute ${pos} h-1.5 w-1.5 rounded-full bg-cocoa/25`} />
        ))}
      </div>

      <motion.div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: glow }} aria-hidden="true" />

      <Sparkle className="left-[8%] top-[16%]" delay={0.4} size={22} color="#C9503C" />
      <Sparkle className="right-[6%] top-[24%]" delay={1.2} size={14} color="#E9A23B" />
      <Sparkle className="bottom-[24%] right-[12%]" delay={0.2} size={26} color="#E8A16A" />
      <Sparkle className="bottom-[30%] left-[6%]" delay={1.8} size={12} color="#B87525" />

      <motion.div
        initial={reduce ? undefined : { opacity: 0, scale: 0.82, y: 40 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <motion.div
          className="scene-3d box-shadow-3d relative h-[300px] w-[360px] scale-[0.62] sm:scale-[0.82] lg:scale-100"
          style={{ rotateY, rotateX }}
          animate={reduce ? undefined : { y: [-6, 8, -6] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="preserve-3d absolute left-1/2 top-1/2 h-0 w-0">
            {/* box body */}
            <Face
              width={W}
              height={H}
              transform={`translateZ(${FRONT}px)`}
              background="linear-gradient(158deg,#F4BC69 0%,#E9A23B 46%,#CF8A2A 100%)"
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,250,238,0.75) 2.2px, transparent 2.6px)',
                  backgroundSize: '46px 46px',
                }}
              />
              <div className="ribbon-v" />
              <div className="ribbon-h" />
              <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#8d5518]/35 to-transparent" />
            </Face>

            <Face
              width={D}
              height={H}
              transform={`rotateY(90deg) translateZ(${FRONT}px)`}
              background="linear-gradient(170deg,#D68F2F 0%,#B87525 55%,#93581A 100%)"
            >
              <div className="ribbon-v" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
            </Face>

            <Face
              width={D}
              height={H}
              transform={`rotateY(-90deg) translateZ(${FRONT}px)`}
              background="linear-gradient(170deg,#EFAE4A 0%,#DA922F 55%,#A9691F 100%)"
            >
              <div className="ribbon-v" />
              <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/20 to-transparent" />
            </Face>

            <Face
              width={W}
              height={H}
              transform={`rotateY(180deg) translateZ(${FRONT}px)`}
              background="linear-gradient(170deg,#D08B2C 0%,#B27024 55%,#8B5319 100%)"
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,250,238,0.7) 2.2px, transparent 2.6px)',
                  backgroundSize: '46px 46px',
                }}
              />
              <div className="ribbon-v" />
            </Face>

            <Face
              width={W}
              height={D}
              transform={`rotateX(90deg) translateZ(${TOP}px)`}
              background="linear-gradient(152deg,#FACB87 0%,#F0B158 50%,#D8973A 100%)"
            >
              <div
                className="absolute inset-0 opacity-45"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,250,238,0.85) 2.4px, transparent 2.8px)',
                  backgroundSize: '52px 52px',
                }}
              />
              <div className="ribbon-v" />
              <div className="ribbon-h" style={{ top: '40%', height: '20%' }} />
              <div className="absolute inset-0 shadow-[inset_0_0_0_10px_rgba(120,70,20,0.12)]" />
            </Face>

            <Face
              width={W}
              height={D}
              transform={`rotateX(-90deg) translateZ(${TOP}px)`}
              background="#7c4a17"
            />

            {/* lid lip */}
            <div
              className="absolute left-1/2 top-0"
              style={{ transform: `translate(-50%,-50%) translateY(${-TOP - 4}px) rotateX(90deg)` }}
            >
              <Face
                width={W + 18}
                height={D + 18}
                transform="none"
                background="linear-gradient(150deg,#FFD79E 0%,#F6C27C 55%,#E5A44C 100%)"
              >
                <div className="absolute inset-0 shadow-[inset_0_0_0_9px_rgba(150,95,35,0.22)]" />
                <div className="ribbon-v" />
                <div className="ribbon-h" style={{ top: '40%', height: '20%' }} />
              </Face>
            </div>
          </div>
        </motion.div>

        {/* bow floats just above the lid */}
        <motion.div
          className="pointer-events-none absolute left-1/2 top-[-26px] -translate-x-1/2 scale-[0.72] sm:scale-90 lg:scale-100"
          animate={reduce ? undefined : { rotate: [-5, 3, -5], y: [0, -5, 0] }}
          transition={{ duration: 6.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Bow />
        </motion.div>

        {/* swinging tag */}
        <motion.div
          className="absolute -right-2 top-[96px] hidden origin-top sm:block"
          animate={reduce ? undefined : { rotate: [4, -5, 4] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="h-14 w-px bg-cocoa/30" />
          <div className="ml-[-18px] mt-1 rotate-[-7deg] rounded-[3px] border border-cocoa/25 bg-[#FFF6E4] px-3 py-2 shadow-soft">
            <p className="font-display text-[11px] italic text-cocoa/80">for you,</p>
            <p className="mt-0.5 font-sans text-[7px] font-bold uppercase tracking-[0.22em] text-cocoa/50">with love</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export function MiniGiftBox({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <div className="absolute inset-0 rounded-[18px] bg-gradient-to-br from-amber-soft via-amber to-amber-deep shadow-[0_18px_30px_-14px_rgba(57,39,29,0.6)]" />
      <div className="absolute inset-y-0 left-1/2 w-[22%] -translate-x-1/2 bg-gradient-to-r from-[#e7cfa9] via-[#fff9ef] to-[#dcc094]" />
      <div className="absolute inset-x-0 top-[38%] h-[17%] bg-gradient-to-b from-[#f3dfbc] via-[#fff9ef] to-[#ddc094]" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
        <Bow small />
      </div>
    </div>
  )
}
