-- ============================================================================
-- 0009 — verify_booking_payment()
-- CHICORA · run 9th
-- ----------------------------------------------------------------------------
-- Admin action: the UTR has been checked against the shop's UPI account.
-- Idempotent. Sets payment = verified, booking = confirmed, keeps the stock
-- that reserve_booking() already held, and starts the pickup window.
-- ============================================================================

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
