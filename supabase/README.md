# CHICORA on Supabase (UPI edition)

The shop runs on **Supabase PostgreSQL + Supabase Storage** whenever
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set. Without them it falls back to
the zero-config local store (`data/store.json`, `data/payment-qr/`,
`data/payment-proofs/`), so development never needs a cloud project.

Payment behaviour is identical in both modes: a customer pays the 10% advance by
UPI to the shop's published QR / UPI ID, submits the UTR (and optionally a
screenshot), and the booking becomes `pending_verification`. **Only an admin
verification sets the payment to `verified` and the booking to `confirmed`.**

---

## 1. What the schema creates

`supabase/schema.sql` is a single idempotent script. Run it once on a fresh
project (or again after a change) in the **Supabase SQL editor**.

| Object | Name | Purpose |
| --- | --- | --- |
| enum | `payment_status` | `awaiting_payment`, `pending_verification`, `verified`, `rejected`, `cancelled` |
| enum | `booking_status` | `awaiting_payment`, `pending_verification`, `confirmed`, `packed`, `ready_for_pickup`, `collected`, `rejected`, `cancelled`, `expired` |
| table | `categories` | gift shelves (`slug` unique) |
| table | `products` | catalogue, money, stock, images, flags |
| table | `payment_settings` | **exactly one row** (`id = true`): `upi_id`, `display_name`, `qr_image_path`, `updated_at` |
| table | `bookings` | one row per reservation, money split, hold/pickup timestamps, rejection reason |
| table | `booking_items` | price + name snapshot per line (product may be deleted later) |
| table | `payments` | the UPI claim: amount, `upi_transaction_id`, private `screenshot_path`, verification audit |
| index | `products_category_idx`, `products_published_idx` | catalogue queries |
| index | `bookings_status_idx`, `bookings_hold_idx` | dashboard + hold sweeper |
| index | `booking_items_booking_idx`, `payments_booking_idx` | joins |
| index | `payments_utr_idx` | case-insensitive UTR lookups |
| unique index | `payments_live_utr_uidx` | one live claim per UTR (`pending_verification` / `verified` only) |
| trigger | `products_touch`, `bookings_touch` | maintain `updated_at` |
| function | `reserve_booking(...)` | validates + prices + holds stock + writes booking/payment atomically |
| function | `verify_booking_payment(uuid, text, int)` | admin: verified + confirmed + pickup window (idempotent) |
| function | `reject_booking_payment(uuid, text)` | admin: reject with reason, return held stock |
| function | `admin_set_booking_status(uuid, booking_status)` | fulfilment transitions only |
| function | `release_expired_holds()` | returns stock for abandoned unverified submissions |
| function | `lookup_booking(text, text)` | customer lookup by reference + phone, screenshots stripped |
| function | `is_admin()` | RLS helper reading `app_metadata.role` |
| bucket | `payment-qr` (public) | current UPI QR image |
| bucket | `payment-proofs` (**private**) | customer payment screenshots |
| bucket | `product-images` (public) | catalogue artwork uploaded from the admin UI |

## 2. Exact setup order

### Automated (preferred)

```
npm run db:setup
```

One command does the whole initialisation:

1. Reads the project reference from `SUPABASE_URL`.
2. Takes the database password from `SUPABASE_DB_PASSWORD`, or prompts for it
   with hidden input (never written to disk, `.env`, logs or Git).
3. Finds an **IPv4-reachable endpoint**. Newer projects expose
   `db.<ref>.supabase.co` over IPv6 only; on IPv4-only networks the script probes
   the pooler (`aws-<n>-<region>.pooler.supabase.com`) as `postgres.<ref>` and
   uses the region that accepts your password. `SUPABASE_DB_URL` overrides this.
4. Applies every file in [`migrations/`](./migrations) in filename order with
   the official CLI (`supabase db push --remote=<pooler url>`), recorded in
   `supabase_migrations.schema_migrations`.
5. Re-runs the push as a dry-run to prove the history is complete.
6. Runs `npm run db:verify` — 26 live checks: the six tables, all enum labels,
   the functions, the three buckets, that `payment-proofs` is genuinely private
   while signed URLs work, RLS via the publishable key, and the single
   `payment_settings` row.

Then, optionally, `npm run db:migrate` to copy the local catalogue, bookings,
payments, QR and screenshots up. Every step is idempotent; nothing is dropped.

### Manual fallback

1. **Create the project** at `database.new` (already done for this project).
2. **Run [`schema.sql`](./schema.sql)** in the SQL editor. It creates the
   extensions, enums, tables, indexes, triggers, functions, RLS policies,
   function grants, the three Storage buckets and their policies, and seeds the
   nine category shelves. Safe to re-run. `schema.sql` is the concatenation of
   every file in `migrations/`.
3. **Run [`verify.sql`](./verify.sql)** — read-only. It lists the tables and row
   counts, enums, functions, indexes, buckets, policies and two money-safety
   sanity checks (0 verified payments without a timestamp, 0 confirmed bookings
   with an unverified payment).
4. **Optional:** schedule the hold sweeper (needs the `pg_cron` extension):
   ```sql
   select cron.schedule('chicora-expire-holds', '*/5 * * * *',
     $$select public.release_expired_holds();$$);
   ```
   The app also calls `release_expired_holds()` on boot and every 60 seconds, so
   cron is a belt-and-braces measure for when the server is down.
5. **Set the server environment** (`.env`, never committed):
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...      # service key — server only
   ```
   `SUPABASE_SERVICE_ROLE_KEY` is accepted as an alias for older projects.
6. **Check the connection:** `npm run db:check`. It reads one row from every
   table, lists the buckets and prints exactly what is missing.
7. **Copy existing local data (optional, repeatable):** `npm run db:migrate`.
   Categories, products, bookings, booking items, payments, the published QR and
   every screenshot are copied. Nothing is deleted locally, existing rows are
   left alone, and **no payment status is changed**.
8. **Build and start:** `npm run build` then `NODE_ENV=production npm start`.

## 3. How the app talks to the database

```
src/ (React)  →  /api/*  →  server/routes.ts  →  server/db.ts
                                                 ├─ db-supabase.ts  (SUPABASE_URL + SUPABASE_SECRET_KEY)
                                                 └─ db-local.ts     (data/store.json)
```

- `server/db.ts` is a thin, statically typed selector: both modules export the
  same functions, so routes, checkout and the admin dashboard are unchanged.
- `server/supabase.ts` owns the **only** Supabase client. It is created with the
  secret key on the server, never imported by the Vite bundle, and the key is
  never written into a response, log line or HTML.
- Prices, stock, the 10% advance, duplicate-UTR rejection and every payment
  state transition are decided **in Postgres**, not in JavaScript and never in
  the browser.

## 4. UPI workflow (preserved end to end)

| Step | Local store | Supabase |
| --- | --- | --- |
| Customer reads QR + UPI ID | `GET /api/payment-settings` → `/api/payment/qr` (file) | same URL → **302 to the public `payment-qr` object** |
| Admin replaces the QR | file write + `payment_settings` row | upload to Storage, update `qr_image_path`, delete old object |
| Admin removes the QR | file delete + row update | object delete + `qr_image_path = null` |
| Screenshot upload | `data/payment-proofs/<token>.<ext>` | **private** `payment-proofs/proofs/<token>.<ext>` |
| Booking submit | JSON store mutation | `reserve_booking(...)` RPC |
| Admin sees the proof | file stream | **120 s signed URL** redirect from the admin route |
| Verify / reject | JSON store mutation | `verify_booking_payment` / `reject_booking_payment` |

Money rules enforced in Postgres:

- `advance = round(total × rate, 2)`, `remaining = total − advance`, with a
  `bookings_money_matches` check constraint.
- The advance rate is clamped to 1%–90% inside `reserve_booking`.
- Stock is decremented under `select … for update` on the affected products, so
  concurrent checkouts cannot oversell.
- `payments_live_utr_uidx` physically blocks a second live claim on one UTR;
  rejected/cancelled UTRs can be resubmitted.
- `collected` requires `payment_status = 'verified'`.
- `admin_set_booking_status` cannot set `confirmed` — only
  `verify_booking_payment` can.

## 5. Storage and privacy

| Bucket | Public | Read | Write |
| --- | --- | --- | --- |
| `payment-qr` | yes | anyone | service role (the app) / admin JWT |
| `payment-proofs` | **no** | admin JWT only | service role only |
| `product-images` | yes | anyone | service role / admin JWT |

- Uploads are validated by **file signature**, not the multipart MIME header
  (PNG / JPEG / WebP), 5 MB maximum.
- `payments.screenshot_path` is never included in a customer response:
  `publicBooking()` strips it and exposes only `has_screenshot`.
- `/api/admin/bookings/:id/payment-proof` requires the admin session cookie and
  redirects to a 120-second signed URL. A screenshot URL cannot be guessed and
  `getPublicUrl()` is never used for this bucket.

## 6. Security model

- **Admin identity stays in Express**: signed HttpOnly session cookie, 12-hour
  expiry, login throttling, `sameOrigin` checks on every mutating route. The
  Supabase secret key never leaves the server process.
- The RPCs `reserve_booking`, `lookup_booking`, `verify_booking_payment`,
  `reject_booking_payment`, `admin_set_booking_status` and
  `release_expired_holds` are granted **only to `service_role`**. A leaked
  publishable/anon key cannot create bookings, read somebody else's reservation
  or mark a payment verified.
- RLS is enabled on every table. `products` and `payment_settings` are readable
  by anon (public catalogue and checkout), bookings/items/payments are admin-only
  via `public.is_admin()`.
- Never place `SUPABASE_SECRET_KEY` in `src/`, `index.html`, a `VITE_*`
  variable, a screenshot or a chat message.

## 7. Local development without credentials

Unset (or blank) `SUPABASE_URL` / `SUPABASE_SECRET_KEY` and everything runs on
the local store exactly as before:

```
npm run dev          # http://localhost:8787, data/store.json
```

`GET /api/health` reports `{ storage: "local", database: { mode: "local" } }`.
With Supabase configured it reports `storage: "supabase"` and performs a real
read against the project (cached 10 s); it returns **503** when the database is
unreachable or the schema has not been applied.

If Supabase is configured but unreachable, the server logs the failure at boot
and refuses to start in production (`NODE_ENV=production`) rather than serving a
shop that cannot take reservations.

## 8. Production configuration guide

Minimum `.env` on the server:

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` enables the built SPA and secure cookies |
| `PORT` | no | default `8787` |
| `SUPABASE_URL` | yes | project URL |
| `SUPABASE_SECRET_KEY` | yes | `sb_secret_…`, server only |
| `SESSION_SECRET` | yes | 32+ random chars; otherwise generated into `data/.secret` |
| `ADMIN_ACCESS_CODE` | yes | replace the `chicora` prototype code before launch |
| `STORE_*`, `ADVANCE_RATE`, `VERIFICATION_HOLD_MINUTES`, `PICKUP_HOLD_DAYS` | no | defaults match the shop copy |

Deploy steps:

1. `npm ci && npm run typecheck && npm run build`
2. Set the environment variables above in the host (not in the repo).
3. `npm run db:check` as a release gate.
4. `NODE_ENV=production npm start` behind HTTPS (set `INSECURE_COOKIES=1` only
   for plain-HTTP staging; it disables the `Secure` cookie flag).
5. Upload the QR and UPI ID in **Admin → Payment settings**, then place a ₹1 test
   booking, verify it, and delete the test row in the Supabase table editor.

Notes:

- The server keeps no required local state in Supabase mode; `data/uploads/` is
  only served for products whose images still point at `/uploads/...`.
- `dist/` is the only build output; nothing in it contains a key.
- `/api/health` is safe for uptime monitors: it returns status only, never
  connection strings.

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `PGRST205` / "table not found" | `schema.sql` has not been run on this project |
| 503 "missing its tables. Run supabase/schema.sql" | same — the API maps it to a clear message |
| "A Supabase Storage bucket is missing" | re-run `schema.sql` (bucket section) |
| 503 "database is unreachable" | wrong `SUPABASE_URL`, paused project, or network egress blocked |
| 401 from Supabase | `SUPABASE_SECRET_KEY` is a publishable key or was rotated |
| QR 404 after upload | bucket `payment-qr` is private — re-run `schema.sql` to restore the public policy |
| Admin proof 404 | the object is missing from `payment-proofs` (run `npm run db:migrate`) |
