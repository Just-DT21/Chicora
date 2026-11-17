-- ============================================================================
-- 0005 — booking items
-- CHICORA · run 5th
-- ----------------------------------------------------------------------------
-- product_name_snapshot and unit_price are copied at reservation time so the
-- history survives a product being renamed, repriced or deleted.
-- ============================================================================

create table if not exists public.booking_items (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings (id) on delete cascade,
  product_id            uuid references public.products (id) on delete set null,
  product_name_snapshot text not null,
  unit_price            numeric(10, 2) not null check (unit_price >= 0),
  quantity              integer not null check (quantity between 1 and 10),
  subtotal              numeric(10, 2) not null check (subtotal >= 0)
);

create index if not exists booking_items_booking_idx on public.booking_items (booking_id);
