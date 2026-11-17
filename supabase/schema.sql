-- ============================================================================
-- CHICORA — relational schema for Supabase / PostgreSQL (UPI edition)
-- ----------------------------------------------------------------------------
-- Payment model: the customer pays the 10% advance by UPI to the shop's
-- published UPI ID / QR, then submits the UTR and an optional (private)
-- screenshot. That creates a payment in `pending_verification`. Only an admin
-- can move it to `verified`, which confirms the booking and keeps the stock.
--
-- Run this in the Supabase SQL editor on a fresh project. Money is numeric
-- rupees. The QR image and payment screenshots live in Supabase Storage; this
-- schema stores only their object paths.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums -----
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

-- ------------------------------------------------------------- categories ---
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 2 and 60),
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- products ---
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(trim(name)) between 2 and 140),
  description      text not null default '',
  price            numeric(10, 2) not null check (price > 0),
  discounted_price numeric(10, 2)
                     check (discounted_price is null or (discounted_price > 0 and discounted_price < price)),
  category_id      uuid not null references public.categories (id) on delete restrict,
  stock_quantity   integer not null default 0 check (stock_quantity >= 0),
  images           text[] not null default '{}',
  is_featured      boolean not null default false,
  is_new_arrival   boolean not null default false,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_published_idx on public.products (is_published, is_featured, created_at desc);

-- ------------------------------------------------------ payment settings ---
-- Exactly one row. The storefront reads it on every checkout, so an admin can
-- replace the QR without a deployment.
create table if not exists public.payment_settings (
  id             boolean primary key default true check (id),
  upi_id         text not null default '',
  display_name   text not null default 'CHICORA',
  qr_image_path  text,
  updated_at     timestamptz not null default now()
);

insert into public.payment_settings (id) values (true) on conflict (id) do nothing;

-- --------------------------------------------------------------- bookings ---
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

-- ---------------------------------------------------------- booking_items ---
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

-- --------------------------------------------------------------- payments ---
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

-- ------------------------------------------------------------ updated_at ----
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Booking engine
-- ============================================================================

-- Submit a UPI payment claim. Prices are read from the database; a browser
-- cannot choose the advance. Stock is held immediately because verification is
-- manual, and the hold expires if no admin verifies it in time.
create or replace function public.reserve_booking(
  p_customer_name  text,
  p_customer_phone text,
  p_customer_email text default null,
  p_items          jsonb default '[]'::jsonb,
  p_advance_rate   numeric default 0.10,
  p_upi_transaction text default null,
  p_screenshot_path text default null,
  p_hold_minutes   integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line        record;
  v_product     public.products%rowtype;
  v_booking     public.bookings%rowtype;
  v_total       numeric(10, 2) := 0;
  v_advance     numeric(10, 2);
  v_price       numeric(10, 2);
  v_reference   text;
  v_items       jsonb;
  v_utr         text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_RESERVATION';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'INVALID_NAME';
  end if;
  if char_length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 7 then
    raise exception 'INVALID_PHONE';
  end if;

  v_utr := upper(regexp_replace(coalesce(p_upi_transaction, ''), '\s', '', 'g'));
  if v_utr !~ '^[A-Z0-9]{8,40}$' then
    raise exception 'INVALID_UTR';
  end if;
  if exists (
    select 1 from public.payments
    where upper(upi_transaction_id) = v_utr
      and payment_status in ('pending_verification', 'verified')
  ) then
    raise exception 'DUPLICATE_UTR';
  end if;

  drop table if exists _chicora_lines;
  create temporary table _chicora_lines (
    product_id uuid primary key,
    quantity   integer not null
  ) on commit drop;

  insert into _chicora_lines (product_id, quantity)
  select (item ->> 'productId')::uuid, sum((item ->> 'quantity')::int)
  from jsonb_array_elements(p_items) as item
  group by 1;

  if exists (select 1 from _chicora_lines where quantity < 1 or quantity > 10) then
    raise exception 'INVALID_QUANTITY';
  end if;
  if (select count(*) from _chicora_lines) > 10 then
    raise exception 'TOO_MANY_PRODUCTS';
  end if;

  -- Deterministic locking prevents concurrent overselling.
  perform 1 from public.products
  where id in (select product_id from _chicora_lines)
  order by id
  for update;

  for v_line in select * from _chicora_lines loop
    select * into v_product from public.products
    where id = v_line.product_id and is_published;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;
    if v_product.stock_quantity < v_line.quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_product.name;
    end if;
    v_price := coalesce(v_product.discounted_price, v_product.price);
    v_total := v_total + round(v_price * v_line.quantity, 2);
  end loop;

  -- The advance rate is clamped server-side: a caller can never make it 0% or
  -- charge the full amount up front.
  v_advance := round(v_total * greatest(0.01, least(coalesce(p_advance_rate, 0.10), 0.90)), 2);
  v_reference := 'CHC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.bookings (
    booking_reference, customer_name, customer_phone, customer_email,
    total_amount, advance_amount, remaining_amount,
    payment_status, booking_status, hold_expires_at
  ) values (
    v_reference, trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    v_total, v_advance, v_total - v_advance,
    'pending_verification', 'pending_verification',
    now() + make_interval(mins => greatest(p_hold_minutes, 5))
  ) returning * into v_booking;

  for v_line in select * from _chicora_lines loop
    select * into v_product from public.products where id = v_line.product_id;
    insert into public.booking_items (
      booking_id, product_id, product_name_snapshot, unit_price, quantity, subtotal
    ) values (
      v_booking.id, v_product.id, v_product.name,
      coalesce(v_product.discounted_price, v_product.price),
      v_line.quantity,
      round(coalesce(v_product.discounted_price, v_product.price) * v_line.quantity, 2)
    );
    update public.products
      set stock_quantity = stock_quantity - v_line.quantity
      where id = v_line.product_id;
  end loop;

  insert into public.payments (
    booking_id, amount, payment_status, upi_transaction_id, screenshot_path
  ) values (
    v_booking.id, v_advance, 'pending_verification', v_utr, p_screenshot_path
  );

  select jsonb_agg(to_jsonb(i) order by i.id) into v_items
  from public.booking_items i where i.booking_id = v_booking.id;

  return jsonb_build_object(
    'booking', to_jsonb(v_booking) || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb)),
    'total', v_total,
    'advance', v_advance,
    'remaining', v_total - v_advance
  );
end $$;

-- Admin action: the UTR has been checked against the shop's UPI account.
-- Idempotent. Callable only by the service role / an admin.
create or replace function public.verify_booking_payment(
  p_booking_id  uuid,
  p_verified_by text default 'admin',
  p_pickup_days integer default 7
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_items   jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.payment_status = 'verified' then
    select jsonb_agg(to_jsonb(i) order by i.id) into v_items
    from public.booking_items i where i.booking_id = v_booking.id;
    return to_jsonb(v_booking) || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'already_verified', true);
  end if;
  if v_booking.payment_status <> 'pending_verification'
     or v_booking.booking_status <> 'pending_verification' then
    raise exception 'NOT_AWAITING_VERIFICATION';
  end if;

  update public.payments set
    payment_status = 'verified',
    verified_at = now(),
    verified_by = coalesce(p_verified_by, 'admin'),
    rejection_reason = null
  where booking_id = v_booking.id
    and payment_status = 'pending_verification';

  update public.bookings set
    payment_status = 'verified',
    booking_status = 'confirmed',
    paid_at = now(),
    hold_expires_at = null,
    pickup_date = now(),
    pickup_expires_at = now() + make_interval(days => greatest(p_pickup_days, 1)),
    rejection_reason = null
  where id = v_booking.id
  returning * into v_booking;

  select jsonb_agg(to_jsonb(i) order by i.id) into v_items
  from public.booking_items i where i.booking_id = v_booking.id;

  return to_jsonb(v_booking) || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'already_verified', false);
end $$;

-- Admin action: reject the claim, record why, return held stock.
create or replace function public.reject_booking_payment(
  p_booking_id uuid,
  p_reason     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_item    record;
  v_items   jsonb;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.payment_status = 'verified' then
    raise exception 'PAYMENT_ALREADY_VERIFIED';
  end if;
  if v_booking.payment_status <> 'pending_verification' then
    raise exception 'NOT_AWAITING_VERIFICATION';
  end if;

  for v_item in select product_id, quantity from public.booking_items where booking_id = v_booking.id loop
    if v_item.product_id is not null then
      update public.products set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  update public.payments set
    payment_status = 'rejected',
    rejection_reason = trim(p_reason),
    verified_at = null,
    verified_by = null
  where booking_id = v_booking.id;

  update public.bookings set
    payment_status = 'rejected',
    booking_status = 'rejected',
    rejection_reason = trim(p_reason),
    hold_expires_at = null
  where id = v_booking.id
  returning * into v_booking;

  select jsonb_agg(to_jsonb(i) order by i.id) into v_items
  from public.booking_items i where i.booking_id = v_booking.id;

  return to_jsonb(v_booking) || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
end $$;

-- Fulfilment transitions. Confirmation itself happens only in
-- verify_booking_payment, so this function cannot mark an unverified payment.
create or replace function public.admin_set_booking_status(
  p_booking_id uuid,
  p_status     booking_status
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_item    record;
  v_items   jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.booking_status = p_status then
    return to_jsonb(v_booking);
  end if;
  if p_status not in ('packed', 'ready_for_pickup', 'collected', 'cancelled') then
    raise exception 'INVALID_ADMIN_STATUS';
  end if;
  if not (
    (v_booking.booking_status = 'confirmed' and p_status in ('packed', 'ready_for_pickup', 'collected', 'cancelled')) or
    (v_booking.booking_status = 'packed' and p_status in ('ready_for_pickup', 'collected', 'cancelled')) or
    (v_booking.booking_status = 'ready_for_pickup' and p_status in ('collected', 'cancelled')) or
    (v_booking.booking_status = 'pending_verification' and p_status = 'cancelled')
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'collected' and v_booking.payment_status <> 'verified' then
    raise exception 'PAYMENT_NOT_VERIFIED';
  end if;

  if p_status = 'cancelled' then
    for v_item in select product_id, quantity from public.booking_items where booking_id = v_booking.id loop
      if v_item.product_id is not null then
        update public.products set stock_quantity = stock_quantity + v_item.quantity
        where id = v_item.product_id;
      end if;
    end loop;
    update public.payments set payment_status = 'cancelled'
    where booking_id = v_booking.id and payment_status <> 'verified';
    update public.bookings set hold_expires_at = null where id = v_booking.id;
  end if;

  update public.bookings set booking_status = p_status where id = v_booking.id
  returning * into v_booking;

  select jsonb_agg(to_jsonb(i) order by i.id) into v_items
  from public.booking_items i where i.booking_id = v_booking.id;

  return to_jsonb(v_booking) || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
end $$;

-- Release stock for abandoned, unverified submissions.
create or replace function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_item    record;
  v_count   integer := 0;
begin
  for v_booking in
    select id from public.bookings
    where booking_status in ('awaiting_payment', 'pending_verification')
      and hold_expires_at is not null
      and hold_expires_at < now()
    for update skip locked
  loop
    for v_item in select product_id, quantity from public.booking_items where booking_id = v_booking.id loop
      if v_item.product_id is not null then
        update public.products set stock_quantity = stock_quantity + v_item.quantity
        where id = v_item.product_id;
      end if;
    end loop;
    update public.payments set payment_status = 'cancelled'
    where booking_id = v_booking.id and payment_status <> 'verified';
    update public.bookings set booking_status = 'expired', hold_expires_at = null where id = v_booking.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Customer lookup: reference + phone. Never exposes screenshot paths or the
-- private Storage location.
create or replace function public.lookup_booking(p_reference text, p_phone text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'booking', to_jsonb(b) || jsonb_build_object(
      'customer_email', null,
      'items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.id)
        from public.booking_items i where i.booking_id = b.id
      ), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(
          (to_jsonb(p) - 'screenshot_path') || jsonb_build_object('has_screenshot', p.screenshot_path is not null)
          order by p.created_at desc
        )
        from public.payments p where p.booking_id = b.id
      ), '[]'::jsonb)
    )
  )
  from public.bookings b
  where b.booking_reference = p_reference
    and regexp_replace(b.customer_phone, '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

-- ============================================================================
-- Row Level Security
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

-- Function permissions ------------------------------------------------------
-- These RPCs are called only by the CHICORA server, which already authenticated
-- the admin and talks to Postgres with the secret (service_role) key. Revoking
-- them from anon/authenticated means a leaked publishable key cannot create
-- bookings, read other people's reservations, or mark a payment verified.
revoke all on function public.reserve_booking(text, text, text, jsonb, numeric, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_booking(text, text, text, jsonb, numeric, text, text, integer) to service_role;

revoke all on function public.lookup_booking(text, text) from public, anon, authenticated;
grant execute on function public.lookup_booking(text, text) to service_role;

revoke all on function public.verify_booking_payment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.verify_booking_payment(uuid, text, integer) to service_role;

revoke all on function public.reject_booking_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_booking_payment(uuid, text) to service_role;

revoke all on function public.admin_set_booking_status(uuid, booking_status) from public, anon, authenticated;
grant execute on function public.admin_set_booking_status(uuid, booking_status) to service_role;

revoke all on function public.release_expired_holds() from public, anon, authenticated;
grant execute on function public.release_expired_holds() to service_role;

-- ============================================================================
-- Storage buckets (run once; paths are stored on products/payment_settings)
-- ----------------------------------------------------------------------------
-- payment-qr      public read  → the QR is a payment address, not a secret
-- payment-proofs  private      → only admins; serve via a signed URL or an
--                                  authenticated API route, never a public URL
-- ============================================================================

-- payment-qr       public read  → the QR is a payment address, not a secret
-- payment-proofs   private      → admins only, served via short-lived signed URL
-- product-images   public read  → catalogue artwork uploaded from the admin UI

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

-- ============================================================================
-- Seed category shelves (safe to re-run)
-- ============================================================================
insert into public.categories (name, slug) values
  ('Birthday Gifts', 'birthday-gifts'),
  ('Cute Gifts', 'cute-gifts'),
  ('Personalized Gifts', 'personalized-gifts'),
  ('Accessories', 'accessories'),
  ('Soft Toys', 'soft-toys'),
  ('Decorative Gifts', 'decorative-gifts'),
  ('Couple Gifts', 'couple-gifts'),
  ('Surprise Boxes', 'surprise-boxes'),
  ('Other', 'other')
on conflict (slug) do nothing;
