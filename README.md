# CHICORA

> Not just a gift. A whole little moment.

A complete gift-boutique storefront with a physical-shop reservation system:
customers reserve a gift by paying a **10% advance over UPI**, the shop verifies
the payment manually, and the balance is paid at pickup.

Two customer pages — **Home** and **Catalogue** — plus a protected **/admin**
console, a terms page, and a server that owns pricing, stock and payment state.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:8787  (Vite HMR + API, one process)
```

Admin: <http://localhost:8787/admin> — prototype access code **`chicora`**
(set `ADMIN_ACCESS_CODE` to change it).

Production-style run:

```bash
npm run build
NODE_ENV=production npm start
```

Requires Node 20+ (developed on Node 24).

## First-run setup

1. Open **Admin → Payment settings**.
2. Enter the store’s **UPI ID** and payment display name, then **Save & publish**.
3. Upload the **UPI QR code** image (PNG/JPEG/WebP).
4. Open any gift and check the checkout screen — the QR and UPI ID appear
   immediately, fetched from storage on each visit.

Until a UPI ID is set, checkout explains that payment details are being set up
and asks the customer to call the shop; it never pretends a payment can be made.

## Environment

Copy `.env.example` to `.env`. Everything works with **no keys at all**.

| Variable | Purpose |
| --- | --- |
| `ADMIN_ACCESS_CODE` | Temporary admin access code (default `chicora`) |
| `SESSION_SECRET` | Signs admin session cookies (auto-generated in `data/.secret` if absent) |
| `ADVANCE_RATE` | Advance fraction, default `0.10` |
| `VERIFICATION_HOLD_MINUTES` | How long an unverified UPI submission holds stock (default 60) |
| `PICKUP_HOLD_DAYS` | How long a verified booking is held in store (default 7) |
| `STORE_PHONE`, `STORE_EMAIL`, `STORE_ADDRESS`, `STORE_HOURS`, `STORE_INSTAGRAM` | Store contact shown on the site |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Set both to run on Supabase PostgreSQL + Storage; leave blank for the local store |

## Payment flow

There is **no payment gateway**. CHICORA takes advances directly by UPI:

1. Customer chooses a gift and opens checkout.
2. The screen shows the total, the **10% advance**, the remaining balance, the
   admin-uploaded **UPI QR**, the store **UPI ID** and a copy button.
3. The customer pays the exact advance in any UPI app, then submits the
   **UTR / transaction ID** (required), an optional screenshot, name and phone.
4. The booking is created as **Pending verification**. A submitted screenshot is
   *never* treated as a payment.
5. The admin gets a live dashboard notification, checks the UTR in the shop’s UPI
   account, and either **verifies** or **rejects with a reason**.
6. Verifying sets the payment to **Verified**, confirms the booking, and keeps
   the stock reserved. Rejecting returns the stock immediately.

Payment states: `Awaiting Payment`, `Pending Verification`, `Verified`,
`Rejected`, `Cancelled`.

Booking states: `awaiting_payment`, `pending_verification`, `confirmed`,
`packed`, `ready_for_pickup`, `collected`, `rejected`, `cancelled`, `expired`.

## Booking and inventory rules

- `advance = total × 10%`, `remaining = total − advance`, computed **server-side**
  from database prices; client-supplied amounts are ignored.
- Stock is held when the payment claim is submitted, so two customers cannot
  claim the last box. The hold expires after 60 minutes if no admin verifies it.
- Verification keeps the reservation; rejection/cancellation/expiry restores it.
- `collected` requires a verified advance. Invalid transitions are rejected (409).
- A UTR already submitted for a live or verified payment cannot be reused
  (case-insensitive duplicate check; rejected UTRs may be resubmitted).
- Customers can only look up a booking with **both** its reference and the phone
  number used. Screenshot filenames and storage paths are stripped from every
  customer API response.
- No shipping: every confirmation explains in-store pickup.

## Production on Supabase

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, then run one command:

```
npm run db:setup      # applies all 16 migrations with the Supabase CLI
```

It takes the database password (`SUPABASE_DB_PASSWORD`, or a hidden prompt),
finds an IPv4-reachable pooler endpoint automatically, applies every migration in
`supabase/migrations/` in order, confirms the migration history and runs 26 live
checks (tables, enum labels, functions, buckets, proof privacy, RLS). The password
is used in memory only — it is never written to `.env`, source or Git.

```
npm run db:verify      # re-run the 26 database checks any time
npm run db:workflows   # 33 end-to-end booking/QR/verification/rejection checks
npm run db:migrate     # copy existing local catalogue + payments up (re-runnable)
npm run db:check       # quick read of every table + bucket list
npm run build && NODE_ENV=production npm start
```

`db:workflows` needs the app running and cleans up every row and object it
creates. Without `SUPABASE_URL`/`SUPABASE_SECRET_KEY` nothing changes: the shop
keeps using `data/store.json` and the local QR/proof folders. The full setup
order, table and bucket inventory, security model and production checklist live
in [`supabase/README.md`](supabase/README.md). Publishing the repository and
deploying the web service (build/start commands, environment variables, health
check) is documented in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Security notes

- QR and product assets are stored outside the built client. The QR is served
  dynamically at `/api/payment/qr`; replacing it changes checkout instantly —
  on Supabase the same URL redirects to the current public Storage object.
- Payment screenshots are validated by file signature (PNG/JPEG/WebP only, 5 MB
  limit), stored in the local `data/payment-proofs/` folder or the **private**
  Supabase bucket `payment-proofs`, and served **only** through the
  admin-authenticated route `/api/admin/bookings/:id/payment-proof` (a 120-second
  signed URL on Supabase, never a public link).
- Uploads reject foreign `Origin` headers; admin APIs require a signed HttpOnly
  session cookie; login attempts are throttled.
- The Supabase secret key is used only by `server/supabase.ts`. It is never
  bundled, logged or returned; the admin RPCs are granted to `service_role`
  only, so an anon/publishable key cannot verify payments.
- The admin access code is still a prototype gate, not production identity.
  Real admin accounts via Supabase Auth are prepared in `supabase/README.md`.

## Architecture

```
server/            Express API + Vite middleware (single process)
  config.ts        env, paths, store details, session secret, Supabase config
  db.ts            picks the active store; routes only ever import this
  db-local.ts      JSON store + local QR/proof folders (no credentials needed)
  db-supabase.ts   PostgreSQL + Storage implementation (same API surface)
  supabase.ts      server-only Supabase client, error mapping, health check
  scripts/         db:check and db:migrate helpers
  auth.ts          signed HttpOnly admin sessions, throttling, HttpError
  events.ts        SSE hub for live admin notifications
  routes.ts        public + admin routes, QR/proof uploads, CSV export
  seed.ts          categories + 14 gifts
src/
  pages/           Home, Catalogue, Terms, Admin
  components/      gift-box hero, doodle footer, rail, UPI checkout modal, admin UI
supabase/          production schema, RLS, Storage policies and setup notes
public/products/   hand-built SVG product artwork
data/              local store, QR, private proofs, product uploads (gitignored)
```

Admin inventory edits appear on the storefront immediately. New payment
submissions arrive over Server-Sent Events (45-second polling fallback) and the
header bell counts anything unseen.

## API (abridged)

```
GET    /api/products?q=&category=&minPrice=&maxPrice=&inStock=1&featured=1&new=1&sort=
GET    /api/products/:id
GET    /api/categories
GET    /api/config
GET    /api/payment-settings              current UPI ID / display name / QR URL
GET    /api/payment/qr                    dynamic QR image
POST   /api/quote
POST   /api/booking-proof                 optional screenshot → opaque token
POST   /api/bookings                      requires UTR; creates pending verification
GET    /api/bookings/:reference?phone=

POST   /api/admin/login | /logout         GET /api/admin/session
GET    /api/admin/stats
GET    /api/admin/products                POST/PATCH/DELETE products
GET    /api/admin/bookings                PATCH /api/admin/bookings/:id
POST   /api/admin/bookings/:id/verify-payment
POST   /api/admin/bookings/:id/reject-payment
GET    /api/admin/bookings/:id/payment-proof   admin-only screenshot
GET/PUT /api/admin/payment-settings
POST   /api/admin/payment-settings/qr     upload/replace QR
DELETE /api/admin/payment-settings/qr
POST   /api/admin/upload                  product images
GET    /api/admin/events                  SSE
GET    /api/admin/export/bookings.csv     includes UTR + payment state
```

## Design notes

- **Hero** — hand-built 3D CSS gift box adapted from the Lycoris Specimen
  composition: specimen rings, pointer parallax, scroll drift, floating bow and
  a swinging tag. No stock photo.
- **Product rail** — draggable snapping gift rail with 3D hover lift and quick view.
- **Footer** — giant ink wordmark, illustrated characters and drifting doodles.
- **Catalogue** — sticky filters, reactive category counts, price presets,
  availability, sorting, search, mobile filter sheet.
- **Checkout** — a two-step reservation screen: gift calculation, live UPI QR,
  copyable UPI ID, UTR/screenshot form, then a pending-verification confirmation
  that is explicit that payment is not yet confirmed.
- **Ambient shader** — custom WebGL amber flow with static fallbacks, paused when
  the tab is hidden or reduced motion is requested.
- Fonts: Fraunces + Manrope, self-hosted.

## Verified locally

- `tsc --noEmit` and `vite build` pass.
- API checks against the running server: settings save/publish, QR upload and
  live serving, screenshot upload validation, 10% math from server prices,
  pending-verification status on submission, duplicate UTR rejection, stock hold,
  oversell rejection, admin auth, admin verification and rejection with stock
  return, and private proof access control.
- The payment screenshot is never exposed by a public route, and no code path
  marks a submitted screenshot as paid.
