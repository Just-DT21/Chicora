import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  ImageUp,
  Loader2,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from 'lucide-react'
import type { Booking, CreateBookingResult, PaymentSettingsPublic, Product } from '@shared/types'
import { api } from '@/lib/api'
import { cn, inr } from '@/lib/format'
import { saveReservation } from '@/lib/reservations'
import { useStore } from '@/context/StoreContext'
import { Modal } from './ui/Modal'

type Step = 'details' | 'pay' | 'done'

interface ProductModalProps {
  product: Product | null
  open: boolean
  initialIntent?: 'details' | 'book'
  onClose: () => void
  onBooked?: () => void
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function ProductModal({ product, open, initialIntent = 'details', onClose, onBooked }: ProductModalProps) {
  const { config } = useStore()
  const [step, setStep] = useState<Step>('details')
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)
  const [form, setForm] = useState({ name: '', phone: '', email: '', utr: '' })
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreateBookingResult | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [settings, setSettings] = useState<PaymentSettingsPublic | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const advanceRate = config?.policy.advanceRate ?? 0.1
  const holdMinutes = config?.policy.verificationHoldMinutes ?? 60
  const unitPrice = product ? product.discounted_price ?? product.price : 0
  const total = round(unitPrice * quantity)
  const advance = round(total * advanceRate)
  const remaining = round(total - advance)
  const soldOut = (product?.stock_quantity ?? 0) <= 0
  const maxQty = Math.max(1, Math.min(10, product?.stock_quantity ?? 1))
  const images = product?.images?.length ? product.images : ['/products/gift-box.svg']
  const canSubmit = Boolean(settings?.upi_id)

  useEffect(() => {
    if (!open) return
    setStep(initialIntent === 'book' && !soldOut ? 'pay' : 'details')
    setQuantity(1)
    setImageIndex(0)
    setErrors({})
    setCreated(null)
    setBooking(null)
    setForm({ name: '', phone: '', email: '', utr: '' })
    setScreenshot(null)
    setScreenshotPreview(null)
    setAgree(false)
    setSettingsError(null)
    setCopiedField(null)
  }, [open, initialIntent, product?.id, soldOut])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSettingsLoading(true)
    api
      .paymentSettings()
      .then(({ settings: next }) => {
        if (!cancelled) {
          setSettings(next)
          setSettingsError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setSettingsError('The shop’s payment details could not be loaded. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview(null)
      return
    }
    const url = URL.createObjectURL(screenshot)
    setScreenshotPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  const quoteLabel = useMemo(
    () => ({
      total: inr(total, { paise: true }),
      advance: inr(advance, { paise: true }),
      remaining: inr(remaining, { paise: true }),
    }),
    [total, advance, remaining],
  )

  if (!product) return null

  const remember = (resultBooking: Booking) => {
    saveReservation({
      reference: resultBooking.booking_reference,
      phone: resultBooking.customer_phone,
      name: resultBooking.customer_name,
      advance: resultBooking.advance_amount,
      createdAt: resultBooking.created_at,
      itemNames: resultBooking.items
        .map((i) => (i.quantity > 1 ? `${i.product_name_snapshot} ×${i.quantity}` : i.product_name_snapshot))
        .join(', '),
    })
  }

  const copy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(null), 1800)
    } catch {
      setCopiedField(null)
    }
  }

  const pickScreenshot = (file: File | null) => {
    setErrors((current) => ({ ...current, screenshot: '' }))
    if (!file) {
      setScreenshot(null)
      return
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setErrors((current) => ({ ...current, screenshot: 'Use a PNG, JPEG or WebP screenshot.' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, screenshot: 'That screenshot is larger than 5 MB.' }))
      return
    }
    setScreenshot(file)
  }

  const submitBooking = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (form.name.trim().length < 2) nextErrors.name = 'Please tell us your name.'
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length < 7) nextErrors.phone = 'Enter a phone number we can reach you on.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      nextErrors.email = 'That email address looks incomplete.'
    }
    const utr = form.utr.trim().replace(/\s+/g, '').toUpperCase()
    if (!/^[A-Z0-9]{8,40}$/.test(utr)) {
      nextErrors.utr = 'Enter the UPI transaction ID / UTR from your payment app (8–40 letters or numbers).'
    }
    if (!canSubmit) nextErrors.form = 'The shop has not added a UPI ID yet, so payment cannot be submitted. Please call us.'
    if (!agree) nextErrors.agree = 'Please confirm you have paid the advance and accept the booking terms.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      let proofToken: string | null = null
      if (screenshot) {
        const uploaded = await api.uploadProof(screenshot)
        proofToken = uploaded.token
      }
      const result = await api.createBooking({
        customerName: form.name.trim(),
        customerPhone: form.phone.trim(),
        customerEmail: form.email.trim() || undefined,
        items: [{ productId: product.id, quantity }],
        upiTransactionId: utr,
        proofToken,
      })
      setCreated(result)
      setBooking(result.booking)
      remember(result.booking)
      onBooked?.()
      setStep('done')
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'We could not submit that booking. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="product-modal-title"
      panelClassName="w-[calc(100vw-1.25rem)] max-w-6xl max-h-[94vh] overflow-y-auto rounded-[1.75rem] bg-warmwhite shadow-lift"
    >
      <div ref={panelRef} className="max-h-[94vh] overflow-y-auto">
        <div className="grid lg:grid-cols-[1.02fr_1fr]">
          {/* gallery */}
          <div className="relative bg-cream/70 p-4 sm:p-6 lg:sticky lg:top-0 lg:h-[94vh] lg:overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="relative overflow-hidden rounded-2xl bg-cream">
                <div className="aspect-[4/5] sm:aspect-square lg:aspect-[4/5]">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={images[imageIndex]}
                      src={images[imageIndex]}
                      alt={`${product.name} — view ${imageIndex + 1}`}
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="h-full w-full object-cover"
                    />
                  </AnimatePresence>
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                      aria-label="Previous image"
                      className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-warmwhite/90 text-cocoa shadow-soft backdrop-blur transition hover:bg-warmwhite"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                      aria-label="Next image"
                      className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-warmwhite/90 text-cocoa shadow-soft backdrop-blur transition hover:bg-warmwhite"
                    >
                      <ArrowRight size={15} />
                    </button>
                  </>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  {product.is_new_arrival && (
                    <span className="rounded-full bg-warmwhite/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-cocoa backdrop-blur">
                      New in
                    </span>
                  )}
                  {product.discounted_price && (
                    <span className="rounded-full bg-cherry px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-warmwhite">
                      On sale
                    </span>
                  )}
                </div>
              </div>
              {images.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      onClick={() => setImageIndex(index)}
                      aria-label={`View image ${index + 1}`}
                      className={cn(
                        'h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition',
                        index === imageIndex ? 'border-amber' : 'border-transparent opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cocoa/45 lg:flex">
                <Store size={13} /> Hand-wrapped in store · Pickup only
              </div>
            </div>
          </div>

          {/* panel */}
          <div className="p-5 sm:p-7 lg:p-9">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-deep">
                {step === 'done' ? 'Submitted for verification' : product.category_name}
              </p>
              <button
                onClick={onClose}
                aria-label="Close product"
                className="grid h-9 w-9 place-items-center rounded-full border border-cocoa/10 text-cocoa/50 transition hover:bg-cocoa/5 hover:text-cocoa"
              >
                <X size={15} />
              </button>
            </div>

            {step !== 'done' && (
              <>
                <h2
                  id="product-modal-title"
                  className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-cocoa sm:text-[2.6rem]"
                >
                  {product.name}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="font-sans text-xl font-bold text-cocoa">{inr(unitPrice)}</span>
                  {product.discounted_price && (
                    <span className="text-sm text-cocoa/40 line-through">{inr(product.price)}</span>
                  )}
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]',
                      soldOut
                        ? 'border-cherry/30 bg-[#FBE4DF] text-cherry'
                        : product.stock_quantity <= 3
                          ? 'border-amber/40 bg-amber-100 text-amber-deep'
                          : 'border-[#BCC9A8] bg-[#EAF0E2] text-[#53663F]',
                    )}
                  >
                    {soldOut
                      ? 'Sold out'
                      : product.stock_quantity <= 3
                        ? `Only ${product.stock_quantity} left`
                        : `${product.stock_quantity} in the shop`}
                  </span>
                </div>
              </>
            )}

            <AnimatePresence mode="wait">
              {step === 'details' && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <p className="mt-4 text-sm leading-relaxed text-cocoa/70">{product.description}</p>

                  <div className="mt-5 flex items-center justify-between rounded-2xl border border-cocoa/10 bg-cream/50 p-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cocoa/55">Quantity</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                        className="grid h-8 w-8 place-items-center rounded-full border border-cocoa/15 text-cocoa transition hover:bg-cocoa hover:text-warmwhite disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cocoa"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-cocoa">{quantity}</span>
                      <button
                        onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                        disabled={quantity >= maxQty || soldOut}
                        aria-label="Increase quantity"
                        className="grid h-8 w-8 place-items-center rounded-full border border-cocoa/15 text-cocoa transition hover:bg-cocoa hover:text-warmwhite disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cocoa"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  <BookingMath
                    quantity={quantity}
                    unitPrice={unitPrice}
                    total={quoteLabel.total}
                    advance={quoteLabel.advance}
                    remaining={quoteLabel.remaining}
                    advanceRate={advanceRate}
                  />

                  <button onClick={() => setStep('pay')} disabled={soldOut} className="btn btn-primary mt-5 w-full !py-4">
                    {soldOut ? 'Currently sold out' : 'Reserve now'} {!soldOut && <ArrowRight size={15} />}
                  </button>
                  <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-cocoa/50">
                    <Store size={13} className="mt-0.5 shrink-0" />
                    No shipping. Pay the 10% advance by UPI, then collect and pay the balance at our Indiranagar shop.
                  </p>
                </motion.div>
              )}

              {step === 'pay' && (
                <motion.div
                  key="pay"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="mt-5"
                >
                  <button
                    onClick={() => setStep('details')}
                    className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cocoa/50 transition hover:text-cocoa"
                  >
                    <ArrowLeft size={12} /> Back to the gift
                  </button>

                  <p className="eyebrow">Step 2 of 2 · Advance payment</p>
                  <h3 className="mt-2 font-display text-[1.9rem] leading-[1.04] tracking-[-0.03em] text-cocoa">
                    Reserve your little something
                  </h3>

                  <div className="mt-4 flex gap-3 rounded-2xl border border-cocoa/10 bg-cream/50 p-3">
                    <img
                      src={images[0]}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-cocoa">{product.name}</p>
                      <p className="mt-0.5 text-[11px] text-cocoa/50">
                        {inr(unitPrice)} × {quantity}
                      </p>
                      <p className="mt-1 text-xs font-bold text-cocoa">{quoteLabel.total}</p>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-3 text-center">
                    <div>
                      <dt className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-cocoa/40">Total</dt>
                      <dd className="mt-1 text-[11px] font-semibold text-cocoa">{quoteLabel.total}</dd>
                    </div>
                    <div className="border-x border-cocoa/10">
                      <dt className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-amber-deep">Advance</dt>
                      <dd className="mt-1 text-[13px] font-bold text-amber-deep">{quoteLabel.advance}</dd>
                    </div>
                    <div>
                      <dt className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-cocoa/40">At pickup</dt>
                      <dd className="mt-1 text-[11px] font-semibold text-cocoa">{quoteLabel.remaining}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-2xl border border-amber/40 bg-amber/10 p-4">
                    <div className="flex items-center gap-2">
                      <QrCode size={14} className="text-amber-deep" />
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-amber-deep">
                        Pay exactly {quoteLabel.advance} by UPI
                      </p>
                    </div>

                    <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row">
                      <div className="grid h-[188px] w-[188px] shrink-0 place-items-center rounded-2xl border border-cocoa/10 bg-warmwhite p-2">
                        {settingsLoading ? (
                          <Loader2 size={20} className="animate-spin text-amber-deep" />
                        ) : settings?.qr_image_url ? (
                          <img
                            key={settings.qr_image_url}
                            src={settings.qr_image_url}
                            alt={`${settings.display_name} UPI QR code`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="px-3 text-center">
                            <QrCode size={24} className="mx-auto text-cocoa/25" />
                            <p className="mt-2 text-[10px] leading-relaxed text-cocoa/50">
                              The shop has not uploaded a QR code yet. Use the UPI ID below.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="w-full min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-cocoa/45">Store UPI ID</p>
                        <p className="mt-1 break-all font-mono text-sm font-bold text-cocoa">
                          {settings?.upi_id || 'Not configured yet'}
                        </p>
                        {settings?.display_name && (
                          <p className="mt-0.5 text-[10px] text-cocoa/45">Paying {settings.display_name}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => settings?.upi_id && copy(settings.upi_id, 'upi')}
                          disabled={!settings?.upi_id}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cocoa/15 bg-warmwhite px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cocoa/70 transition hover:border-cocoa disabled:opacity-40"
                        >
                          {copiedField === 'upi' ? <Check size={11} /> : <Copy size={11} />}
                          {copiedField === 'upi' ? 'Copied' : 'Copy UPI ID'}
                        </button>
                        <p className="mt-2 text-[10px] leading-relaxed text-cocoa/45">
                          Scan with any UPI app or pay to the ID above. Keep the transaction ID / UTR your app shows.
                        </p>
                      </div>
                    </div>

                    {settingsError && <p className="mt-2 text-[11px] font-semibold text-cherry">{settingsError}</p>}
                    {!settingsLoading && !settings?.upi_id && (
                      <p className="mt-3 rounded-lg bg-warmwhite/70 px-2.5 py-2 text-[10px] leading-relaxed text-cocoa/60">
                        Payment details are being set up. Please call{' '}
                        <a href={`tel:${(config?.store.phone ?? '').replace(/\s/g, '')}`} className="font-semibold text-cocoa underline">
                          {config?.store.phone ?? 'the shop'}
                        </a>{' '}
                        to reserve this gift.
                      </p>
                    )}
                  </div>

                  <form onSubmit={submitBooking} className="mt-5" noValidate>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cocoa/50">
                      After paying · send us the details
                    </p>

                    <div className="mt-3 grid gap-4">
                      <div>
                        <label className="field-label" htmlFor="booking-utr">
                          UPI transaction ID / UTR <span className="text-cherry">*</span>
                        </label>
                        <input
                          id="booking-utr"
                          value={form.utr}
                          onChange={(e) => setForm((f) => ({ ...f, utr: e.target.value }))}
                          placeholder="e.g. 452891730612"
                          autoComplete="off"
                          spellCheck={false}
                          className={cn('field font-mono uppercase tracking-wider', errors.utr && 'field-error')}
                        />
                        {errors.utr && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.utr}</p>}
                      </div>

                      <div>
                        <span className="field-label">Payment screenshot <span className="font-medium normal-case tracking-normal text-cocoa/35">(optional)</span></span>
                        <label
                          htmlFor="booking-screenshot"
                          className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-cocoa/25 bg-[#FFFDF8] px-3 py-3 transition hover:border-cocoa/50"
                        >
                          {screenshotPreview ? (
                            <img src={screenshotPreview} alt="Selected payment screenshot" className="h-11 w-11 rounded-lg object-cover" />
                          ) : (
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cream text-cocoa/45">
                              <ImageUp size={17} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-semibold text-cocoa">
                              {screenshot ? screenshot.name : 'Attach a screenshot of the payment'}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-cocoa/40">
                              PNG, JPEG or WebP · up to 5 MB · only the shop can see it
                            </span>
                          </span>
                          <span className="rounded-full border border-cocoa/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-cocoa/55">
                            {screenshot ? 'Replace' : 'Choose'}
                          </span>
                        </label>
                        <input
                          id="booking-screenshot"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => pickScreenshot(e.target.files?.[0] ?? null)}
                        />
                        {screenshot && (
                          <button
                            type="button"
                            onClick={() => pickScreenshot(null)}
                            className="mt-1 text-[10px] font-semibold text-cocoa/45 underline underline-offset-2 hover:text-cocoa"
                          >
                            Remove screenshot
                          </button>
                        )}
                        {errors.screenshot && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.screenshot}</p>}
                      </div>

                      <div>
                        <label className="field-label" htmlFor="booking-name">
                          Full name
                        </label>
                        <input
                          id="booking-name"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Aarav Mehta"
                          autoComplete="name"
                          className={cn('field', errors.name && 'field-error')}
                        />
                        {errors.name && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.name}</p>}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="field-label" htmlFor="booking-phone">
                            Phone number
                          </label>
                          <input
                            id="booking-phone"
                            value={form.phone}
                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="+91 98765 43210"
                            autoComplete="tel"
                            inputMode="tel"
                            className={cn('field', errors.phone && 'field-error')}
                          />
                          {errors.phone && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.phone}</p>}
                        </div>
                        <div>
                          <label className="field-label" htmlFor="booking-email">
                            Email <span className="font-medium normal-case tracking-normal text-cocoa/35">(optional)</span>
                          </label>
                          <input
                            id="booking-email"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="you@email.com"
                            autoComplete="email"
                            className={cn('field', errors.email && 'field-error')}
                          />
                          {errors.email && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.email}</p>}
                        </div>
                      </div>
                    </div>

                    <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[11px] leading-relaxed text-cocoa/60">
                      <input
                        type="checkbox"
                        checked={agree}
                        onChange={(e) => setAgree(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-cocoa/25 accent-[#B87525]"
                      />
                      <span>
                        I have paid the {quoteLabel.advance} advance by UPI and understand the shop verifies it manually
                        before the booking is confirmed. I accept the{' '}
                        <Link to="/terms" target="_blank" className="font-semibold text-cocoa underline decoration-cocoa/30 underline-offset-2">
                          booking terms
                        </Link>
                        .
                      </span>
                    </label>
                    {errors.agree && <p className="mt-1 text-[11px] font-semibold text-cherry">{errors.agree}</p>}

                    {errors.form && (
                      <p className="mt-4 rounded-xl border border-cherry/25 bg-[#FDF1EC] px-3 py-2 text-xs font-semibold text-cherry">
                        {errors.form}
                      </p>
                    )}

                    <button type="submit" disabled={submitting} className="btn btn-primary mt-5 w-full !py-4">
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Submitting your booking…
                        </>
                      ) : (
                        <>
                          Submit booking <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                    <p className="mt-2.5 flex items-start justify-center gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-cocoa/40">
                      <ShieldCheck size={12} className="mt-px shrink-0" /> Submitted, not verified — we check every payment
                    </p>
                  </form>
                </motion.div>
              )}

              {step === 'done' && booking && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-amber/20 text-amber-deep">
                      <Clock3 size={20} />
                    </span>
                    <div>
                      <h2 id="product-modal-title" className="font-display text-2xl leading-tight text-cocoa">
                        Booking submitted
                      </h2>
                      <p className="text-xs text-cocoa/55">Your payment is pending verification by the shop.</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber/40 bg-amber/10 p-3.5 text-[11px] leading-relaxed text-cocoa/70">
                    We have <strong className="font-semibold text-cocoa">not</strong> confirmed your payment yet. Once we
                    match the UTR to the shop’s UPI account, your booking is confirmed and we will hold the gift for
                    pickup.
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-cocoa/10 bg-cream/60 p-4">
                    <div>
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-cocoa/45">Booking reference</p>
                      <p className="mt-1 font-mono text-lg font-bold tracking-wider text-cocoa">{booking.booking_reference}</p>
                    </div>
                    <button
                      onClick={() => copy(booking.booking_reference, 'reference')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-cocoa/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cocoa/70 transition hover:border-cocoa hover:text-cocoa"
                    >
                      {copiedField === 'reference' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedField === 'reference' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <dl className="mt-4 space-y-2 rounded-2xl border border-cocoa/10 p-4 text-sm">
                    {booking.items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-4">
                        <dt className="text-cocoa/65">
                          {item.product_name_snapshot} <span className="text-cocoa/40">× {item.quantity}</span>
                        </dt>
                        <dd className="font-semibold text-cocoa">{inr(item.subtotal)}</dd>
                      </div>
                    ))}
                    <div className="mt-2 flex justify-between border-t border-cocoa/10 pt-2">
                      <dt className="text-cocoa/55">Total</dt>
                      <dd className="font-semibold text-cocoa">{inr(booking.total_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-cocoa/55">Advance submitted</dt>
                      <dd className="font-semibold text-cocoa">{inr(booking.advance_amount)}</dd>
                    </div>
                    <div className="flex justify-between rounded-lg bg-amber/10 px-2 py-1.5">
                      <dt className="font-semibold text-cocoa">Pay at pickup</dt>
                      <dd className="font-bold text-cocoa">{inr(booking.remaining_amount)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-cocoa/10 pt-2 text-[11px]">
                      <dt className="text-cocoa/45">UTR submitted</dt>
                      <dd className="font-mono text-cocoa/70">{booking.payments[0]?.upi_transaction_id ?? '—'}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-2xl bg-cocoa p-4 text-warmwhite">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber">What happens next</p>
                    <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-warmwhite/70">
                      <li>1. We check your UTR and screenshot against our UPI account.</li>
                      <li>2. You’ll hear from us on {booking.customer_phone} once it is verified.</li>
                      <li>
                        3. Collect at {config?.store.address ?? '14, Palm Court Lane, Indiranagar'} and pay{' '}
                        {inr(booking.remaining_amount)} at the counter.
                      </li>
                    </ol>
                    {booking.hold_expires_at && (
                      <p className="mt-2 border-t border-warmwhite/15 pt-2 text-[10px] text-warmwhite/55">
                        Your gift is held while we verify, until{' '}
                        {new Date(booking.hold_expires_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        (about {holdMinutes} minutes). If it cannot be verified in that time, the hold is released.
                      </p>
                    )}
                  </div>

                  <button onClick={onClose} className="btn btn-amber mt-4 w-full">
                    Done <Sparkles size={14} />
                  </button>
                  <p className="mt-2 text-center text-[10px] text-cocoa/40">
                    Saved in your bag ·{' '}
                    <Link to="/terms" target="_blank" className="underline decoration-cocoa/25 underline-offset-2">
                      Booking terms
                    </Link>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function BookingMath({
  quantity,
  unitPrice,
  total,
  advance,
  remaining,
  advanceRate,
  compact = false,
}: {
  quantity: number
  unitPrice: number
  total: string
  advance: string
  remaining: string
  advanceRate: number
  compact?: boolean
}) {
  return (
    <div className={cn('rounded-2xl border border-cocoa/10 bg-[#FFFDF8]', compact ? 'p-3.5' : 'mt-4 p-4')}>
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/45">Booking calculation</p>
        <span className="rounded-full bg-amber/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-deep">
          {Math.round(advanceRate * 100)}% advance
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-cocoa/60">
          <span>
            {inr(unitPrice)} × {quantity}
          </span>
          <span className="font-semibold text-cocoa">{total}</span>
        </div>
        <div className="flex justify-between text-cocoa/60">
          <span>Advance by UPI ({Math.round(advanceRate * 100)}%)</span>
          <span className="font-bold text-amber-deep">{advance}</span>
        </div>
        <div className="flex justify-between border-t border-dashed border-cocoa/15 pt-1.5 text-cocoa/60">
          <span>Remaining at pickup</span>
          <span className="font-semibold text-cocoa">{remaining}</span>
        </div>
      </div>
      {!compact && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-cocoa/45">
          <ShoppingBag size={12} className="mt-0.5 shrink-0" />
          Example: a ₹1,000 gift reserves for ₹100, with ₹900 due when you collect it.
        </p>
      )}
    </div>
  )
}
