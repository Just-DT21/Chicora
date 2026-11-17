-- ============================================================================
-- 0006 — payments and UTR uniqueness
-- CHICORA · run 6th
-- ----------------------------------------------------------------------------
-- One live claim per UTR: payments_live_utr_uidx covers pending_verification
-- and verified rows only, so a rejected/cancelled UTR may be resubmitted.
-- screenshot_path is a private Storage object path and is never sent to a
-- customer-facing response.
-- ============================================================================

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id) on delete cascade,
  amount             numeric(10, 2) not null check (amount >= 0),
  payment_status     payment_status not null default 'pending_verification',
  upi_transaction_id text,
  screenshot_path    text,          -- private Storage object path
  verified_at        timestamptz,
  verified_by        text,
  rejection_reason   text,
  created_at         timestamptz not null default now()
);

create index if not exists payments_booking_idx on public.payments (booking_id);

create index if not exists payments_utr_idx on public.payments (upper(upi_transaction_id));

-- One live claim per UTR. Rejected/cancelled UTRs can be resubmitted.
create unique index if not exists payments_live_utr_uidx
  on public.payments (upper(upi_transaction_id))
  where upi_transaction_id is not null
    and payment_status in ('pending_verification', 'verified');
