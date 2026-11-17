import { useEffect, useRef, useState } from 'react'
import { Check, ImageUp, Loader2, QrCode, Save, ShieldCheck, Trash2, Upload } from 'lucide-react'
import type { PaymentSettingsPublic } from '@shared/types'
import { api } from '@/lib/api'
import { cn, dateTime } from '@/lib/format'

export function PaymentSettings({ onSaved }: { onSaved: (settings: PaymentSettingsPublic) => void }) {
  const [settings, setSettings] = useState<PaymentSettingsPublic | null>(null)
  const [upiId, setUpiId] = useState('')
  const [displayName, setDisplayName] = useState('CHICORA')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const apply = (next: PaymentSettingsPublic) => {
    setSettings(next)
    setUpiId(next.upi_id)
    setDisplayName(next.display_name || 'CHICORA')
  }

  useEffect(() => {
    let cancelled = false
    api.admin
      .paymentSettings()
      .then(({ settings: next }) => {
        if (!cancelled) apply(next)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Payment settings could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!file) {
      setLocalPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setLocalPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = (next: File | null) => {
    setError(null)
    setNotice(null)
    if (!next) {
      setFile(null)
      return
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(next.type)) {
      setError('The QR code must be a PNG, JPEG or WebP image.')
      return
    }
    if (next.size > 5 * 1024 * 1024) {
      setError('That image is larger than 5 MB.')
      return
    }
    setFile(next)
  }

  const uploadQr = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const { settings: next } = await api.admin.uploadPaymentQr(file)
      apply(next)
      onSaved(next)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setNotice('New QR code published. Customers see it immediately.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The QR code could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  const removeQr = async () => {
    if (!settings?.qr_image_url) return
    if (!window.confirm('Remove the UPI QR code? Customers will only be able to copy the UPI ID.')) return
    setRemoving(true)
    setError(null)
    setNotice(null)
    try {
      const { settings: next } = await api.admin.removePaymentQr()
      apply(next)
      onSaved(next)
      setNotice('QR code removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The QR code could not be removed.')
    } finally {
      setRemoving(false)
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { settings: next } = await api.admin.savePaymentSettings({ upiId: upiId.trim(), displayName: displayName.trim() })
      apply(next)
      onSaved(next)
      setNotice('UPI details saved. This is what customers now see at checkout.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The payment details could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const preview = localPreview || settings?.qr_image_url || null
  const missingUpi = !settings?.upi_id
  const missingQr = !settings?.qr_image_url

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[10px] font-bold uppercase tracking-[0.18em] text-cocoa/40">
        <Loader2 size={18} className="animate-spin text-amber-deep" /> Loading payment settings…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-deep">How customers pay</p>
          <h2 className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-cocoa">Payment settings</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-cocoa/50">
            The QR code and UPI ID below appear at checkout. Upload a new QR at any time — no deployment, no code
            change.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-cocoa/10 bg-warmwhite px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cocoa/45">
          <ShieldCheck size={12} className="text-sage" /> Screenshots are private
        </div>
      </div>

      {(missingUpi || missingQr) && (
        <div className="rounded-2xl border border-amber/50 bg-amber/10 px-4 py-3 text-xs leading-relaxed text-cocoa/70">
          <strong className="font-semibold text-cocoa">Checkout is not complete yet.</strong>{' '}
          {missingUpi && missingQr
            ? 'Add the store UPI ID and upload a QR code so customers can pay.'
            : missingUpi
              ? 'Add the store UPI ID — without it customers cannot submit a booking.'
              : 'Upload a UPI QR code so customers can scan and pay.'}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {/* QR */}
        <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">UPI QR code</p>
              <p className="mt-1 text-[11px] text-cocoa/45">Shown live on the checkout screen.</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-cream text-cocoa/50">
              <QrCode size={15} />
            </span>
          </div>

          <div className="mt-4 grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-cocoa/20 bg-warmwhite p-3">
            {preview ? (
              <img src={preview} alt="UPI QR code preview" className="max-h-[230px] w-auto max-w-full rounded-lg object-contain" />
            ) : (
              <div className="py-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cream text-cocoa/30">
                  <ImageUp size={19} />
                </span>
                <p className="mt-3 text-sm font-semibold text-cocoa">No QR code yet</p>
                <p className="mx-auto mt-1 max-w-[24ch] text-[11px] leading-relaxed text-cocoa/45">
                  Upload the QR from your UPI app. PNG, JPEG or WebP.
                </p>
              </div>
            )}
          </div>

          {file && (
            <p className="mt-2 truncate text-[10px] font-semibold text-amber-deep">Ready to publish: {file.name}</p>
          )}

          <input
            ref={fileInput}
            id="qr-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <label htmlFor="qr-file" className="btn btn-outline !py-2.5 !text-[10px] cursor-pointer">
              <ImageUp size={12} /> {settings?.qr_image_url ? 'Choose replacement' : 'Choose QR image'}
            </label>
            {file && (
              <button onClick={uploadQr} disabled={uploading} className="btn btn-primary !py-2.5 !text-[10px]">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading ? 'Publishing…' : 'Upload & publish'}
              </button>
            )}
            {!file && settings?.qr_image_url && (
              <button onClick={removeQr} disabled={removing} className="btn !border !border-cherry/25 !bg-transparent !py-2.5 !text-[10px] !text-cherry hover:!bg-cherry/10">
                {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
              </button>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-cocoa/40">
            Stored outside the public build. The storefront fetches the current image from storage every time checkout
            opens.
            {settings?.updated_at && <> Last updated {dateTime(settings.updated_at)}.</>}
          </p>
        </div>

        {/* UPI details */}
        <form onSubmit={save} className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-5">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">Store UPI details</p>
          <p className="mt-1 text-[11px] text-cocoa/45">Customers copy this ID and see this name at checkout.</p>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="field-label" htmlFor="payment-upi">
                UPI ID
              </label>
              <input
                id="payment-upi"
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                placeholder="chicora@okhdfcbank"
                autoComplete="off"
                spellCheck={false}
                className="field font-mono"
              />
              <p className="mt-1 text-[10px] text-cocoa/40">Use the exact VPA customers should pay, e.g. name@bank.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="payment-name">
                Payment display name
              </label>
              <input
                id="payment-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="CHICORA"
                maxLength={60}
                className="field"
              />
              <p className="mt-1 text-[10px] text-cocoa/40">Shown beside the UPI ID and on the QR card.</p>
            </div>
          </div>

          {notice && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#BCC9A8] bg-[#F1F5EA] px-3 py-2.5 text-[11px] font-semibold text-[#53663F]">
              <Check size={13} className="mt-0.5 shrink-0" /> {notice}
            </p>
          )}
          {error && (
            <p className={cn('mt-4 rounded-xl border border-cherry/25 bg-[#FDF1EC] px-3 py-2.5 text-[11px] font-semibold text-cherry')}>
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn btn-primary mt-5 w-full">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save & publish'}
          </button>
          <p className="mt-3 text-[10px] leading-relaxed text-cocoa/40">
            Only signed-in admins can change these details. Payment screenshots live in private storage and are served
            through an authenticated admin route; customers never get a public link.
          </p>
        </form>
      </div>
    </div>
  )
}
