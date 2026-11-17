import type { LucideIcon } from 'lucide-react'
import type { Booking, BookingStatus, PaymentStatus } from '@shared/types'
import { cn, bookingStatusLabels, bookingStatusTone, paymentStatusLabels, paymentStatusTone } from '@/lib/format'

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone?: 'default' | 'amber' | 'cocoa' | 'danger' | 'sage'
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 sm:p-5',
        tone === 'cocoa'
          ? 'border-cocoa bg-cocoa text-warmwhite'
          : tone === 'amber'
            ? 'border-amber/50 bg-amber/15'
            : tone === 'danger'
              ? 'border-cherry/25 bg-[#FDF1EC]'
              : tone === 'sage'
                ? 'border-[#BCC9A8] bg-[#F1F5EA]'
                : 'border-cocoa/10 bg-[#FFFDF8]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'text-[9px] font-extrabold uppercase tracking-[0.16em]',
            tone === 'cocoa' ? 'text-warmwhite/45' : 'text-cocoa/45',
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full',
            tone === 'cocoa' ? 'bg-warmwhite/10 text-amber' : tone === 'danger' ? 'bg-cherry/10 text-cherry' : 'bg-cream text-cocoa/55',
          )}
        >
          <Icon size={13} strokeWidth={1.7} />
        </span>
      </div>
      <p
        className={cn(
          'mt-3 font-display text-[2rem] leading-none tracking-tight',
          tone === 'cocoa' ? 'text-warmwhite' : 'text-cocoa',
        )}
      >
        {value}
      </p>
      {hint && (
        <p className={cn('mt-1.5 text-[10px] leading-snug', tone === 'cocoa' ? 'text-warmwhite/45' : 'text-cocoa/45')}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function StatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em]',
        bookingStatusTone[status],
        className,
      )}
    >
      {bookingStatusLabels[status]}
    </span>
  )
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em]',
        paymentStatusTone[status],
      )}
    >
      {paymentStatusLabels[status]}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-cocoa/20 bg-[#FFFDF8] px-6 py-12 text-center">
      <p className="font-display text-2xl text-cocoa">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-cocoa/55">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function bookingItemNames(booking: Booking) {
  return booking.items.map((i) => i.product_name_snapshot).join(', ')
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40',
        checked ? 'bg-cocoa' : 'bg-cocoa/15',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-warmwhite shadow transition-all',
          checked ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  )
}
