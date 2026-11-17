-- ============================================================================
-- 0014 — function permissions
-- CHICORA · run 14th
-- ----------------------------------------------------------------------------
-- These RPCs are called only by the CHICORA server, which already authenticated
-- the admin and talks to Postgres with the secret (service_role) key. Revoking
-- them from anon/authenticated means a leaked publishable key cannot create
-- bookings, read other people's reservations, or mark a payment verified.
-- ============================================================================

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
