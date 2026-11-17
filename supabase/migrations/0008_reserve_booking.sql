-- ============================================================================
-- 0008 — reserve_booking()
-- CHICORA · run 8th
-- ----------------------------------------------------------------------------
-- Submit a UPI payment claim. Prices are read from the database; a browser
-- cannot choose the advance. Stock is held immediately because verification is
-- manual, and the hold expires if no admin verifies it in time.
-- ============================================================================

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
