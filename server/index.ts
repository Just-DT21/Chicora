import express from 'express'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import {
  DIST_DIR,
  IS_PROD,
  PORT,
  STORAGE_MODE,
  STORE,
  SUPABASE_URL,
  UPLOAD_DIR,
  VERIFICATION_HOLD_MINUTES,
} from './config'
import 'express-async-errors'
import { registerRoutes } from './routes'
import { HttpError } from './auth'
import { checkDatabase, expireStaleHolds } from './db'

async function start() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    next()
  })

  // Kept in both modes so products migrated from the local store keep their
  // existing /uploads/... image URLs; new uploads go to Supabase Storage.
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }))

  registerRoutes(app)

  // Admin dashboard shell must not leak inventory markup to unauthenticated users;
  // the SPA itself is public, every admin API is protected above.
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next()
        return
      }
      res.sendFile(path.join(DIST_DIR, 'index.html'))
    })
  }

  // Central error handler (must come after routes).
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    if (message.includes('Only image files') || message.includes('File too large')) {
      res.status(400).json({ error: message })
      return
    }
    console.error('[chicora] Unhandled error:', error)
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
  })

  // Connection check before serving: a misconfigured database must be visible
  // in the logs immediately, not as a 500 on the first customer checkout.
  const health = await checkDatabase()
  if (!health.ok) {
    console.error(`\n  [chicora] Data store unavailable (${STORAGE_MODE} mode): ${health.detail}`)
    if (STORAGE_MODE === 'supabase' && IS_PROD) {
      console.error('  [chicora] Refusing to start in production without a working database.\n')
      process.exit(1)
    }
    console.error('  [chicora] Continuing anyway — API requests will fail until this is fixed.\n')
  }

  await expireStaleHolds().catch((error) => {
    console.error('[chicora] Could not release expired holds on startup:', error)
  })

  // Bind every interface so a container/host (Render, Fly, Docker) can route to us.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  CHICORA is open at http://localhost:${PORT}`)
    console.log(`  Store: ${STORE.name} · ${STORE.address}`)
    console.log(
      STORAGE_MODE === 'supabase'
        ? `  Data:  PostgreSQL + Storage via Supabase (${SUPABASE_URL.replace(/^https?:\/\//, '')})\n` +
            `  Check: ${health.detail}`
        : `  Data:  local store (data/store.json, data/payment-qr, data/payment-proofs)`,
    )
    console.log(
      `  Payments: UPI QR + UPI ID, verified manually in Admin → Payment settings\n` +
        `  Unverified payment holds expire after ${VERIFICATION_HOLD_MINUTES} minutes.\n` +
        `  Admin:   http://localhost:${PORT}/admin\n`,
    )
  })
}

start().catch((error) => {
  console.error('[chicora] Failed to start:', error)
  process.exit(1)
})
