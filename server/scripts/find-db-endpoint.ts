/**
 * Finds an IPv4-reachable Postgres endpoint for the Supabase project.
 *
 * Supabase's direct database host (db.<ref>.supabase.co) is IPv6-only on newer
 * projects, which fails on networks without IPv6. The shared pooler
 * (aws-<n>-<region>.pooler.supabase.com) is IPv4, but the region is not exposed
 * by any API key, so it is discovered by resolving the pooler hostnames and
 * authenticating as postgres.<ref> against each candidate.
 *
 * The password is used for authentication attempts only and never persisted.
 */
import dns from 'node:dns/promises'
import { Client } from 'pg'

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
  'sa-east-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'eu-central-2', 'eu-north-1', 'ap-south-1', 'ap-southeast-1',
  'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-east-1',
  'me-central-1', 'af-south-1', 'il-central-1',
]

export interface DbEndpoint {
  url: string
  host: string
  kind: 'pooler' | 'direct'
}

function poolerHosts(): string[] {
  const hosts: string[] = []
  for (const region of REGIONS) {
    hosts.push(`aws-0-${region}.pooler.supabase.com`, `aws-1-${region}.pooler.supabase.com`)
  }
  return hosts
}

async function tryConnect(host: string, ref: string, password: string): Promise<'ok' | 'auth' | 'no'> {
  const client = new Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    query_timeout: 8000,
  })
  try {
    await client.connect()
    const result = await client.query('select current_user as who')
    await client.end()
    return result.rows[0]?.who ? 'ok' : 'no'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await client.end().catch(() => undefined)
    if (/password authentication failed|SASL|28P01/i.test(message)) return 'auth'
    return 'no'
  }
}

export async function findDatabaseEndpoint(
  ref: string,
  password: string,
): Promise<{ endpoint?: DbEndpoint; reason?: string }> {
  const override = (process.env.SUPABASE_DB_URL || '').trim()
  if (override) {
    return { endpoint: { url: override, host: new URL(override).hostname, kind: 'pooler' } }
  }

  // IPv4-resolvable pooler hosts only — wrong regions still resolve, so the
  // deciding test is a real authentication against postgres.<ref>.
  const candidates = poolerHosts()
  const reachable: string[] = []
  await Promise.all(
    candidates.map(async (host) => {
      try {
        await dns.lookup(host, { family: 4 })
        reachable.push(host)
      } catch {
        /* no A record */
      }
    }),
  )

  if (reachable.length === 0) {
    return { reason: 'No pooler host could be resolved — check the machine\'s DNS/network.' }
  }

  const chunks: string[][] = []
  for (let i = 0; i < reachable.length; i += 8) chunks.push(reachable.slice(i, i + 8))

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(async (host) => ({ host, outcome: await tryConnect(host, ref, password) })))
    const ok = results.find((result) => result.outcome === 'ok')
    if (ok) {
      const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${ok.host}:5432/postgres?sslmode=require`
      return { endpoint: { url, host: ok.host, kind: 'pooler' } }
    }
    if (results.some((result) => result.outcome === 'auth')) {
      return { reason: 'The database password was rejected by the pooler.' }
    }
  }

  return { reason: 'No pooler region accepted the connection for this project.' }
}

/** Read-only helper used by verification scripts. */
export async function queryDatabase(url: string, sql: string): Promise<Record<string, unknown>[]> {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 })
  try {
    await client.connect()
    const result = await client.query(sql)
    return result.rows
  } finally {
    await client.end().catch(() => undefined)
  }
}
