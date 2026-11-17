-- ============================================================================
-- 0015 — Storage buckets and policies
-- CHICORA · run 15th
-- ----------------------------------------------------------------------------
-- payment-qr       public read  → the QR is a payment address, not a secret
-- payment-proofs   private      → admins only, served via a short-lived signed
--                                  URL from the authenticated admin API route
-- product-images   public read  → catalogue artwork uploaded from the admin UI
--
-- Requires public.is_admin() from 0013.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('payment-qr', 'payment-qr', true),
  ('payment-proofs', 'payment-proofs', false),
  ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public reads payment qr" on storage.objects;
create policy "public reads payment qr" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'payment-qr');

drop policy if exists "admins manage payment qr" on storage.objects;
create policy "admins manage payment qr" on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-qr' and public.is_admin())
  with check (bucket_id = 'payment-qr' and public.is_admin());

drop policy if exists "admins read payment proofs" on storage.objects;
create policy "admins read payment proofs" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

drop policy if exists "server writes payment proofs" on storage.objects;
create policy "server writes payment proofs" on storage.objects
  for insert to service_role
  with check (bucket_id = 'payment-proofs');

drop policy if exists "public reads product images" on storage.objects;
create policy "public reads product images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "admins manage product images" on storage.objects;
create policy "admins manage product images" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
