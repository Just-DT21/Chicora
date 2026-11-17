import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { ADMIN_ACCESS_CODE, SESSION_SECRET } from './config'

const COOKIE_NAME = 'chicora_admin'
const SESSION_HOURS = 12

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url')
}

export function createSessionToken(): string {
  const payload = base64url(
    JSON.stringify({ role: 'admin', exp: Date.now() + SESSION_HOURS * 3_600_000, n: crypto.randomBytes(6).toString('hex') }),
  )
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number; role?: string }
    return data.role === 'admin' && typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export function setAdminCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    maxAge: SESSION_HOURS * 3_600_000,
    path: '/',
  })
}

export function clearAdminCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function isAdmin(req: Request) {
  const cookies = parseCookies(req.headers.cookie)
  return verifySessionToken(cookies[COOKIE_NAME])
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: 'Admin authentication required.' })
    return
  }
  next()
}

// --- login throttling -------------------------------------------------------
const attempts = new Map<string, { count: number; resetAt: number }>()

export function checkLoginThrottle(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) return true
  return entry.count < 8
}

export function recordFailedLogin(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 })
    return
  }
  entry.count += 1
}

export function clearLoginAttempts(ip: string) {
  attempts.delete(ip)
}

export function verifyAccessCode(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0 || input.length > 200) return false
  const a = Buffer.from(input)
  const b = Buffer.from(ADMIN_ACCESS_CODE)
  if (a.length !== b.length) {
    // constant-ish work so length is not leaked by timing alone
    crypto.timingSafeEqual(a, Buffer.from(a))
    return false
  }
  return crypto.timingSafeEqual(a, b)
}
