-- ============================================================================
-- 0013 — Row Level Security
-- CHICORA · run 13th
-- ----------------------------------------------------------------------------
-- The CHICORA server connects with the secret (service_role) key, which bypasses
-- RLS. These policies protect the project from the publishable/anon key and
-- from a future browser client: the catalogue and the UPI details are public,
-- everything financial is admin-only.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.bookings         enable row level security;
alter table public.booking_items    enable row level security;
alter table public.payments         enable row level security;
alter table public.payment_settings enable row level security;

drop policy if exists "public reads published products" on public.products;
create policy "public reads published products" on public.products
  for select to anon, authenticated using (is_published);

drop policy if exists "public reads categories" on public.categories;
create policy "public reads categories" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Checkout reads the published UPI details; only admins may change them.
drop policy if exists "public reads payment settings" on public.payment_settings;
create policy "public reads payment settings" on public.payment_settings
  for select to anon, authenticated using (true);

drop policy if exists "admins manage payment settings" on public.payment_settings;
create policy "admins manage payment settings" on public.payment_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bookings, items and payments: admins only. Customers use the RPCs.
drop policy if exists "admins read bookings" on public.bookings;
create policy "admins read bookings" on public.bookings
  for select to authenticated using (public.is_admin());

drop policy if exists "admins manage bookings" on public.bookings;
create policy "admins manage bookings" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read booking items" on public.booking_items;
create policy "admins read booking items" on public.booking_items
  for select to authenticated using (public.is_admin());

drop policy if exists "admins read payments" on public.payments;
create policy "admins read payments" on public.payments
  for select to authenticated using (public.is_admin());
