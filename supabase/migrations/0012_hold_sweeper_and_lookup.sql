-- ============================================================================
-- 0012 — release_expired_holds() and lookup_booking()
-- CHICORA · run 12th
-- ============================================================================

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
