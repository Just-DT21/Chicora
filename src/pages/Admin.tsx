import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { BrandMark } from '@/components/Navbar'

export function Admin() {
  const [session, setSession] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .session()
      .then((result) => {
        if (!cancelled) setSession(result.authenticated)
      })
      .catch(() => {
        if (!cancelled) setSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (session === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-warmwhite">
        <BrandMark />
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cocoa/40">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber border-t-transparent" />
          Opening the back room…
        </div>
      </div>
    )
  }

  if (!session) {
    return <AdminLogin onSuccess={() => setSession(true)} />
  }

  return <AdminDashboard onLogout={() => setSession(false)} />
}
