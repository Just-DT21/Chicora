import { AnimatePresence, motion } from 'framer-motion'
import { Check, Info, X, AlertTriangle } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { cn } from '@/lib/format'

export function ToastViewport() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-lift backdrop-blur',
              toast.tone === 'error'
                ? 'border-cherry/30 bg-[#FDF1EC]'
                : toast.tone === 'success'
                  ? 'border-[#BCC9A8] bg-[#F4F8ED]'
                  : 'border-cocoa/15 bg-warmwhite/95',
            )}
            role="status"
          >
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
                toast.tone === 'error'
                  ? 'bg-cherry/15 text-cherry'
                  : toast.tone === 'success'
                    ? 'bg-[#8C9A76]/20 text-[#53663F]'
                    : 'bg-amber/25 text-amber-deep',
              )}
            >
              {toast.tone === 'error' ? (
                <AlertTriangle size={13} />
              ) : toast.tone === 'success' ? (
                <Check size={13} />
              ) : (
                <Info size={13} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cocoa">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs leading-relaxed text-cocoa/70">{toast.description}</p>}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="rounded-full p-1 text-cocoa/40 transition hover:bg-cocoa/5 hover:text-cocoa"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
