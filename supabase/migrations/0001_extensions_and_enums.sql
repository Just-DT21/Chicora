-- ============================================================================
-- 0001 — extensions and enums
-- CHICORA · run 1st
-- ============================================================================

create extension if not exists pgcrypto;

-- Payment states are separate from booking states on purpose: a submitted UTR
-- or screenshot is never the same thing as a verified payment.
do $$ begin
  create type payment_status as enum (
    'awaiting_payment', 'pending_verification', 'verified', 'rejected', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum (
    'awaiting_payment', 'pending_verification', 'confirmed', 'packed',
    'ready_for_pickup', 'collected', 'rejected', 'cancelled', 'expired'
  );
exception when duplicate_object then null; end $$;
