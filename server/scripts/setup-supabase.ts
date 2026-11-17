/**
 * Automated Supabase database initialisation for CHICORA.
 *
 *   npm run db:setup
 *
 * 1. Reads the project reference from SUPABASE_URL.
 * 2. Takes the database password from SUPABASE_DB_PASSWORD, or prompts for it
 *    with hidden input. It is never written to disk, logged, or committed.
 * 3. Applies every file in supabase/migrations/ with the official workflow:
 *      supabase db push --remote=<project> --password <pw>
 *    Files are applied in filename order and recorded in the CLI's
 *    supabase_migrations.schema_migrations history.
 * 4. Confirms the history with a second dry-run, then runs the read/write
 *    verification in verify-supabase.ts.
 *
 * Safe to re-run: applied migrations are skipped, nothing is dropped or reset.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { ROOT, SUPABASE_URL } from '../config'
import { findDatabaseEndpoint } from './find-db-endpoint'

const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')
const CLI = 'supabase@3.2.0'
// The npm package ships a Node shim that runs the real CLI binary. Spawning it
// with node works on Windows (npx.cmd cannot be spawned without a shell).
const CLI_SHIM = path.join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js')

function projectRef(): string {
  if (!SUPABASE_URL) {
    console.error('✗ SUPABASE_URL is not set in .env — cannot determine the project reference.')
    process.exit(1)
  }
  const match = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)
  if (!match) {
    console.error(`✗ Could not read a project reference from SUPABASE_URL (${SUPABASE_URL}).`)
    process.exit(1)
  }
  return match[1]
}

function migrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('✗ supabase/migrations/ is missing.')
    process.exit(1)
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
  if (files.length === 0) {
    console.error('✗ No migration files found in supabase/migrations/.')
    process.exit(1)
  }
  return files
}

/** Hidden password prompt (never echoed, never stored). */
function askPassword(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const stream = process.stdout
    const originalWrite = stream.write.bind(stream)

    let muted = false
    // Silence the echo of typed characters while the prompt is open.
    stream.write = ((chunk: string, ...rest: unknown[]) => {
      if (muted) return true
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest)
    }) as typeof stream.write

    process.stdout.write('Supabase database password (hidden, not saved): ')
    muted = true
    rl.question('', (answer) => {
      muted = false
      stream.write = originalWrite as typeof stream.write
      process.stdout.write('\n')
      rl.close()
      resolve(answer.trim())
    })
  })
}

function runCli(args: string[], password: string) {
  const useShim = fs.existsSync(CLI_SHIM)
  const command = useShim ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const commandArgs = useShim ? [CLI_SHIM, ...args] : ['--yes', CLI, ...args]
  // shell:false keeps every argument literal — the password is never shell-parsed.
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, SUPABASE_DB_PASSWORD: password, SUPABASE_YES: 'true' },
    timeout: 10 * 60_000,
  })
  if (result.error) {
    return { status: 1, output: `Could not start the Supabase CLI (${command}): ${result.error.message}` }
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  return { status: result.status ?? 1, output }
}

async function main() {
  const ref = projectRef()
  const files = migrationFiles()

  console.log(`\nCHICORA → Supabase database initialisation`)
  console.log(`  project:    ${ref}`)
  console.log(`  migrations: ${files.length} files in supabase/migrations/`)
  files.forEach((file, index) => console.log(`    ${String(index + 1).padStart(2, '0')}. ${file}`))

  let password = (process.env.SUPABASE_DB_PASSWORD || '').trim()
  const fromPrompt = !password
  if (!password) {
    password = await askPassword()
  }
  if (!password) {
    console.error('✗ No database password provided. Nothing was changed.')
    process.exit(1)
  }
  if (fromPrompt) {
    console.log('  (password held in memory for this run only)')
  }

  console.log('\n→ Locating an IPv4-reachable database endpoint…')
  const found = await findDatabaseEndpoint(ref, password)
  if (!found.endpoint) {
    console.error(`✗ ${found.reason ?? 'No reachable database endpoint.'}`)
    console.error('  Nothing was changed. If this persists, set SUPABASE_DB_URL to the Session pooler URL.')
    process.exit(1)
  }
  // `--remote` accepts a postgres URL; the pooler is IPv4, the direct host IPv6.
  const remote = found.endpoint.url
  console.log(`  ${found.endpoint.kind} endpoint: ${found.endpoint.host}`)

  console.log('\n→ Applying migrations with the Supabase CLI (supabase db push)…')
  const push = runCli(['db', 'push', `--remote=${remote}`, '--yes'], password)
  console.log(push.output || '(no output)')
  if (push.status !== 0) {
    if (/password|authentication|SASL|28P01/i.test(push.output)) {
      console.error('\n✗ The database password was rejected. Re-run with the correct password.')
    } else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(push.output)) {
      console.error(
        '\n✗ Could not reach the database. If your network has no IPv6, use the Session pooler\n' +
          '  connection string instead: set SUPABASE_DB_URL in .env and re-run this command.',
      )
    } else {
      console.error('\n✗ supabase db push failed — see the output above. Nothing was dropped or reset.')
    }
    process.exit(1)
  }

  console.log('\n→ Confirming the migration history is complete…')
  const dry = runCli(['db', 'push', `--remote=${remote}`, '--dry-run'], password)
  console.log(dry.output || '(no output)')
  const pending = !/no (new )?migrations|up to date|already applied/i.test(dry.output) && dry.status === 0
  if (dry.status !== 0) {
    console.warn('! Could not re-read the migration history; the verification step below is authoritative.')
  } else if (pending) {
    console.warn('! The dry-run still lists migrations. Review the output above.')
  } else {
    console.log('✓ Migration history is up to date — every file has been applied.')
  }

  console.log('\n→ Verifying the live database (tables, enums, functions, buckets, RLS, Storage)…')
  const verify = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/scripts/verify-supabase.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, SUPABASE_DB_PASSWORD: '' },
    timeout: 5 * 60_000,
  })
  console.log(`${verify.stdout || ''}${verify.stderr || ''}`.trim())

  if (verify.status !== 0) {
    console.error('\n✗ Database verification failed. See the failed checks above.')
    process.exit(1)
  }

  console.log(
    '\n✓ Supabase initialisation complete.\n' +
      '  Next: upload the UPI QR in Admin → Payment settings, then run `npm run db:check`.\n',
  )
}

main().catch((error) => {
  console.error('Setup failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
