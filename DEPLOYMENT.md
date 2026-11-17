# CHICORA — production deployment

One **Node web service** serves both the built React storefront and the Express
API on the same origin. PostgreSQL and file storage are Supabase, so the service
holds no persistent local state.

```
Browser ──► https://<service>.onrender.com
              ├── /            React build (dist/) served by Express
              ├── /api/*       Express API (bookings, admin, QR, proofs, SSE)
              └── Supabase     PostgreSQL + Storage (payment-qr, payment-proofs, product-images)
```

| Phase | Command | Output |
| --- | --- | --- |
| Install | `npm ci --include=dev` | dependencies (dev deps are needed by the build) |
| Build | `npm run build` | `dist/` (client only, ~520 kB JS) |
| Start | `npm run start:prod` | `NODE_ENV=production tsx server/index.ts` on `0.0.0.0:$PORT` |
| Health | `GET /api/health` | `200` when Supabase is reachable, `503` otherwise |

Nothing is compiled for the server: `tsx` (now a runtime dependency) executes the
TypeScript directly.

---

## 1. Push to a new GitHub repository

```bash
cd "C:\Users\ADMIN\Desktop\WEBSITE CHICORA"

# 1. start the repository (first commit only)
git init -b main
git add .
git status --short          # confirm .env, data/ and node_modules/ are absent

git commit -m "CHICORA storefront, UPI reservations and Supabase backend"

# 2. create the empty repository "chicora" on GitHub (web UI or CLI), then:
git remote add origin https://github.com/<your-username>/chicora.git
git push -u origin main
```

With the GitHub CLI signed in, the middle step is one command:

```bash
gh repo create chicora --private --source=. --remote=origin --push
```

Commit only after `git status --short` shows no `.env`, `data/`, `dist/`,
`node_modules/`, logs or `supabase/.temp/`.

## 2. Create the Render service

**Blueprint (recommended):** push the repository, then in Render choose
**New → Blueprint** and select it. `render.yaml` defines the service, build and
start commands, health check and the environment variable list.

**Manual:** **New → Web Service** → connect the repo, then:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start:prod` |
| Health check path | `/api/health` |
| Instance | Free is fine to start; it sleeps after 15 min idle, so use Starter for an always-on shop |

## 3. Environment variables (Render → Environment)

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | yes | project **secret** key (`sb_secret_…`) — server only |
| `ADMIN_ACCESS_CODE` | yes | a real access code, not `chicora` |
| `SESSION_SECRET` | yes | 32+ random chars (`openssl rand -hex 32`) |
| `SUPABASE_PUBLISHABLE_KEY` | optional | only used by the verification scripts |
| `STORE_PHONE`, `STORE_EMAIL`, `STORE_ADDRESS`, `STORE_HOURS`, `STORE_INSTAGRAM` | optional | override the store copy |
| `ADVANCE_RATE`, `VERIFICATION_HOLD_MINUTES`, `PICKUP_HOLD_DAYS` | optional | booking policy defaults |
| `INSECURE_COOKIES` | never in production | only for plain-HTTP staging |

`PORT` is provided by Render; the server reads `process.env.PORT` and binds
`0.0.0.0`. Do **not** add `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL` here — they
are only used locally by `npm run db:setup`.

The secret key must never be prefixed with `VITE_`: everything under `src/` is
bundled for the browser. The server reads it in `server/supabase.ts` only.

## 4. Database

The production project is already initialised (16 migrations, 6 tables, 3
buckets, RLS on). Do not re-run `db:setup` against it.

```bash
npm run db:verify       # 26 live checks (tables, enums, functions, buckets, RLS)
npm run db:workflows    # 33 end-to-end checks against a running server
```

Both are idempotent and clean up after themselves.

## 5. After the first deploy

1. Open `https://<service>.onrender.com/api/health` → `{"ok":true,"storage":"supabase",…}`.
2. Open `/admin`, log in with `ADMIN_ACCESS_CODE`.
3. **Admin → Payment settings:** enter the UPI ID and upload the QR; checkout
   picks it up immediately (served through `/api/payment/qr`).
4. Place a real ₹1 test booking, verify it in the dashboard, then delete the
   test booking in Supabase (Table editor → `bookings` / `payments`).
5. Check `https://<service>.onrender.com/catalogue` loads product images (they
   come from Supabase Storage `product-images`, or `/products/*.svg` for the
   seeded catalogue).

## 6. What is preserved in production

- Same-origin SPA + API, client-side routing (`/catalogue`, `/admin`, `/terms`).
- SSE admin notifications (`/api/admin/events`, 25 s heartbeat, `X-Accel-Buffering: no`).
- Admin sessions: signed HttpOnly cookie, `Secure` + `SameSite=Lax` under
  `NODE_ENV=production`, 12-hour expiry, login throttling, origin checks.
- Uploads: QR and product art to public buckets, payment screenshots to the
  private `payment-proofs` bucket, served only via `/api/admin/bookings/:id/payment-proof`
  after the session check (120 s signed URL).
- UPI-only payment flow: `pending_verification` on submit, admin verify/reject,
  stock held then released — unchanged by deployment.

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Build fails on `vite: not found` | install ran without dev deps — use `npm ci --include=dev` |
| `/api/health` 503, "missing its tables" | wrong Supabase project URL, or migrations never applied |
| Admin login appears to succeed but bounces | cookies are `Secure`; make sure the site is served over HTTPS, or set `INSECURE_COOKIES=1` for staging |
| QR 404 | no QR uploaded in Admin → Payment settings yet |
| SSE disconnects every minute | Render proxy idle timeout; the 25 s heartbeat normally prevents it |
| `SESSION_SECRET` warning in logs | set the variable in Render, otherwise sessions reset on each deploy |
