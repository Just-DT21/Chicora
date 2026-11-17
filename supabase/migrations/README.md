# CHICORA — ordered SQL migrations

These files are the byte-for-byte split of [`../schema.sql`](../schema.sql): same
tables, columns, constraints, indexes, functions, policies, buckets and seed
rows, only separated so each step can be reviewed and pasted on its own. Running
them in order produces exactly the schema [`../README.md`](../README.md) documents.

Run them in the Supabase **SQL Editor** (or any Postgres client) **in this order**.
Every file is idempotent, so re-running a step is safe.

| # | File | Creates |
| --- | --- | --- |
| 1 | `0001_extensions_and_enums.sql` | `pgcrypto`; enums `payment_status`, `booking_status` |
| 2 | `0002_categories_products.sql` | `categories`, `products`, `products_category_idx`, `products_published_idx` |
| 3 | `0003_payment_settings.sql` | single-row `payment_settings` + its default row |
| 4 | `0004_bookings.sql` | `bookings` (+ `bookings_money_matches`), `bookings_status_idx`, `bookings_hold_idx` |
| 5 | `0005_booking_items.sql` | `booking_items`, `booking_items_booking_idx` |
| 6 | `0006_payments.sql` | `payments`, `payments_booking_idx`, `payments_utr_idx`, **`payments_live_utr_uidx`** (live-UTR uniqueness) |
| 7 | `0007_updated_at_triggers.sql` | `touch_updated_at()` + `products_touch`, `bookings_touch` |
| 8 | `0008_reserve_booking.sql` | `reserve_booking(...)` — stock hold, server-side pricing, 10% advance, duplicate-UTR rejection |
| 9 | `0009_verify_booking_payment.sql` | `verify_booking_payment(...)` — the only path to `verified` + `confirmed` |
| 10 | `0010_reject_booking_payment.sql` | `reject_booking_payment(...)` — reason required, stock returned |
| 11 | `0011_admin_set_booking_status.sql` | `admin_set_booking_status(...)` — fulfilment transitions only |
| 12 | `0012_hold_sweeper_and_lookup.sql` | `release_expired_holds()`, `lookup_booking(reference, phone)` |
| 13 | `0013_rls_policies.sql` | `is_admin()`, RLS on all six tables, public-read + admin-only policies |
| 14 | `0014_function_permissions.sql` | RPC execution limited to `service_role` |
| 15 | `0015_storage_buckets.sql` | buckets `payment-qr` (public), `payment-proofs` (**private**), `product-images` (public) + their policies |
| 16 | `0016_seed_categories.sql` | the nine category shelves |

## Why the order matters

- Enums must exist before the tables that use them.
- `bookings` must exist before `booking_items` and `payments` (foreign keys).
- The tables must exist before the functions that read `public.products%rowtype`
  and friends (`0008`–`0012`).
- `0013` defines `public.is_admin()`, which `0015`'s Storage policies call.
- `0014` grants execution after the functions exist.

## After the migrations

1. Run [`../verify.sql`](../verify.sql) — read-only checks of tables, enums,
   functions, indexes, buckets, policies and two money-safety invariants.
2. Set `SUPABASE_URL` / `SUPABASE_SECRET_KEY` in `.env`, then `npm run db:check`.
3. Optional: `npm run db:migrate` to copy existing local products, bookings,
   payments, the QR and screenshots into this project (it changes no status).
4. Optional: schedule `select public.release_expired_holds();` with `pg_cron`.

## Notes

- No statement here changes or verifies an existing payment. `pending_verification`
  only becomes `verified` through `verify_booking_payment()`.
- `payment-proofs` is created **non-public**; the app reads it through
  short-lived signed URLs from the authenticated admin route.
- Products are not seeded here: the app seeds 14 gifts only in its local store.
  Use the admin UI or `npm run db:migrate` for a catalogue.
