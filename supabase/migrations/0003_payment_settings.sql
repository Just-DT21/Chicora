-- ============================================================================
-- 0003 — payment settings (the UPI QR + UPI ID published at checkout)
-- CHICORA · run 3rd
-- ----------------------------------------------------------------------------
-- Exactly one row. The storefront reads it on every checkout, so an admin can
-- replace the QR without a deployment. qr_image_path is a Storage object path
-- in the payment-qr bucket.
-- ============================================================================

create table if not exists public.payment_settings (
  id             boolean primary key default true check (id),
  upi_id         text not null default '',
  display_name   text not null default 'CHICORA',
  qr_image_path  text,
  updated_at     timestamptz not null default now()
);

insert into public.payment_settings (id) values (true) on conflict (id) do nothing;
