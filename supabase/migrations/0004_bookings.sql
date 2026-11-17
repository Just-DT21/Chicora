-- ============================================================================
-- 0004 — bookings
-- CHICORA · run 4th
-- ----------------------------------------------------------------------------
-- bookings_money_matches guarantees that remaining = total - advance, so a
-- booking can never carry an inconsistent split.
-- ============================================================================

create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  booking_reference  text not null unique,
  customer_name      text not null check (char_length(trim(customer_name)) >= 2),
  customer_phone     text not null,
  customer_email     text,
  total_amount       numeric(10, 2) not null check (total_amount >= 0),
  advance_amount     numeric(10, 2) not null check (advance_amount >= 0),
  remaining_amount   numeric(10, 2) not null check (remaining_amount >= 0),
  payment_status     payment_status not null default 'pending_verification',
  booking_status     booking_status not null default 'pending_verification',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  pickup_date        timestamptz,
  pickup_expires_at  timestamptz,
  hold_expires_at    timestamptz,
  paid_at            timestamptz,
  rejection_reason   text,
  constraint bookings_money_matches check (abs((total_amount - advance_amount) - remaining_amount) < 0.01)
);

create index if not exists bookings_status_idx on public.bookings (booking_status, created_at desc);
create index if not exists bookings_hold_idx on public.bookings (hold_expires_at)
  where booking_status in ('pending_verification', 'awaiting_payment');
