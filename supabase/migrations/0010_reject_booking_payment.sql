-- ============================================================================
-- 0010 — reject_booking_payment()
-- CHICORA · run 10th
-- ----------------------------------------------------------------------------
-- Admin action: reject the claim, record why, return held stock. A verified
-- payment can never be rejected here (cancel the booking instead).
-- ============================================================================

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
