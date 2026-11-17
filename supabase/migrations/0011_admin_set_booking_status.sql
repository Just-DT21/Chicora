-- ============================================================================
-- 0011 — admin_set_booking_status()
-- CHICORA · run 11th
-- ----------------------------------------------------------------------------
-- Fulfilment transitions. Confirmation itself happens only in
-- verify_booking_payment(), so this function cannot mark an unverified payment.
-- ============================================================================

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
