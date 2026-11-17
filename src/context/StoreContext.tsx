import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicConfig } from '@shared/types'
import { api } from '@/lib/api'

interface ToastItem {
  id: number
  title: string
  description?: string
  tone: 'default' | 'success' | 'error'
}

interface StoreContextValue {
  config: PublicConfig | null
  configError: boolean
  reloadConfig: () => Promise<void>
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  bagOpen: boolean
  setBagOpen: (open: boolean) => void
  reservationsVersion: number
  bumpReservations: () => void
  toasts: ToastItem[]
  toast: (title: string, description?: string, tone?: ToastItem['tone']) => void
  dismissToast: (id: number) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [configError, setConfigError] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [bagOpen, setBagOpen] = useState(false)
  const [reservationsVersion, setReservationsVersion] = useState(0)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const reloadConfig = useCallback(async () => {
    try {
      const next = await api.config()
      setConfig(next)
      setConfigError(false)
    } catch {
      setConfigError(true)
    }
  }, [])

  useEffect(() => {
    void reloadConfig()
  }, [reloadConfig])

  const bumpReservations = useCallback(() => setReservationsVersion((v) => v + 1), [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (title: string, description?: string, tone: ToastItem['tone'] = 'default') => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-2), { id, title, description, tone }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id))
      }, 5200)
    },
    [],
  )

  const value = useMemo(
    () => ({
      config,
      configError,
      reloadConfig,
      searchOpen,
      setSearchOpen,
      bagOpen,
      setBagOpen,
      reservationsVersion,
      bumpReservations,
      toasts,
      toast,
      dismissToast,
    }),
    [config, configError, reloadConfig, searchOpen, bagOpen, reservationsVersion, bumpReservations, toasts, toast, dismissToast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
