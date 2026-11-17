-- ============================================================================
-- CHICORA — post-setup verification (read only, safe to run any time)
-- Run in the Supabase SQL editor after schema.sql. Nothing is modified.
-- ============================================================================

-- 1. Tables and row counts -----------------------------------------------
select 'categories' as table_name, count(*) as rows from public.categories
union all select 'products', count(*) from public.products
union all select 'payment_settings', count(*) from public.payment_settings
union all select 'bookings', count(*) from public.bookings
union all select 'booking_items', count(*) from public.booking_items
union all select 'payments', count(*) from public.payments
order by table_name;

-- 2. Enums ----------------------------------------------------------------
select t.typname as enum_name, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname in ('payment_status', 'booking_status')
group by t.typname;

-- 3. Functions -------------------------------------------------------------
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'reserve_booking', 'verify_booking_payment', 'reject_booking_payment',
    'admin_set_booking_status', 'release_expired_holds', 'lookup_booking', 'is_admin'
  )
order by p.proname;

-- 4. Indexes that protect the money rules ---------------------------------
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('payments', 'bookings', 'products')
order by tablename, indexname;

-- 5. Storage buckets -------------------------------------------------------
select id, public, file_size_limit, created_at
from storage.buckets
where id in ('payment-qr', 'payment-proofs', 'product-images')
order by id;

-- 6. Storage policies ------------------------------------------------------
select policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual like '%payment-qr%' or qual like '%payment-proofs%' or qual like '%product-images%')
order by policyname;

-- 7. The single payment settings row --------------------------------------
-- upi_id is a public payment address; qr_image_path is a Storage object path.
select id, upi_id, display_name, qr_image_path, updated_at
from public.payment_settings;

-- 8. Sanity: no payment may be verified without a timestamp --------------
select count(*) as verified_without_timestamp
from public.payments
where payment_status = 'verified' and verified_at is null;

-- 9. Sanity: no confirmed booking with an unverified payment -------------
select count(*) as confirmed_but_unverified
from public.bookings
where booking_status in ('confirmed', 'packed', 'ready_for_pickup', 'collected')
  and payment_status <> 'verified';
