import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { BrandMark } from '@/components/Navbar'
import { MiniGiftBox } from '@/components/GiftBox3D'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter the store access code.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.admin.login(code.trim())
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-warmwhite">
      <div className="container-x flex items-center justify-between py-5">
        <BrandMark compact />
        <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cocoa/50 transition hover:text-cocoa">
          <ArrowLeft size={12} /> Back to the shop
        </Link>
      </div>

      <div className="container-x grid gap-6 pb-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <div className="relative hidden overflow-hidden rounded-[2rem] bg-cocoa p-10 text-warmwhite lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-24 -top-16 h-72 w-72 rounded-full bg-amber/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-12 h-80 w-80 rounded-full bg-clay/10 blur-3xl" />
          <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber">
            <Lock size={13} /> Staff only
          </div>
          <div className="relative">
            <MiniGiftBox className="mb-10 h-16 w-16" />
            <h1 className="font-display text-[3.2rem] leading-[0.95] tracking-[-0.03em]">
              Tucked behind
              <br />
              <span className="italic text-amber">the counter.</span>
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-warmwhite/55">
              Inventory, advances and the little pile of reservations waiting to be packed. Everything the shop needs,
              in one quiet room.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-warmwhite/35">
            <ShieldCheck size={13} className="text-amber/70" /> Signed server-side session · HttpOnly cookie
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-[2rem] border border-cocoa/10 bg-[#FFFDF8] px-6 py-10 sm:px-10 lg:px-12">
          <p className="eyebrow">CHICORA · Admin console</p>
          <h2 className="mt-3 font-display text-[2.4rem] leading-[1.02] tracking-[-0.03em] text-cocoa">
            Welcome back,
            <br />
            <span className="italic text-amber-deep">admin.</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-cocoa/55">
            Enter the store access code to open the dashboard. The code is checked on the server, never in the browser.
          </p>

          <form onSubmit={submit} className="mt-8 max-w-sm">
            <label className="field-label" htmlFor="admin-code">
              Access code
            </label>
            <div className="relative">
              <input
                id="admin-code"
                type={show ? 'text' : 'password'}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
                className="field !py-3 !pr-12 font-mono !tracking-[0.2em]"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide access code' : 'Show access code'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-cocoa/40 transition hover:bg-cocoa/5 hover:text-cocoa"
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-cherry/25 bg-[#FDF1EC] px-3 py-2 text-xs font-semibold text-cherry">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary mt-5 w-full !py-3.5">
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Enter dashboard'} {!loading && <Lock size={13} />}
            </button>
            <p className="mt-4 text-[10px] leading-relaxed text-cocoa/40">
              Prototype access: the store code is set on the server with <code className="rounded bg-cream px-1 py-0.5">ADMIN_ACCESS_CODE</code>.
              Replace it with real admin accounts before launch. Session cookies are HTTP-only and expire after 12 hours.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
