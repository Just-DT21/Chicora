/**
 * Connection check for the configured Supabase project.
 *
 *   npm run db:check
 *
 * Reads one row from every required table, lists the Storage buckets, and
 * prints what is missing. Exits non-zero when the database is not usable, so a
 * deploy pipeline can use it as a gate.
 */
import { STORAGE_MODE, SUPABASE_URL } from '../config'
import { checkSupabaseConnection } from '../supabase'

async function main() {
  if (STORAGE_MODE !== 'supabase') {
    console.log('Storage mode: local (SUPABASE_URL / SUPABASE_SECRET_KEY are not both set).')
    console.log('The shop runs on data/store.json. Add the Supabase variables to .env to switch.')
    return
  }

  console.log(`Project: ${SUPABASE_URL.replace(/^https?:\/\//, '')}`)
  const health = await checkSupabaseConnection()

  console.log(health.ok ? '✓ database reachable' : '✗ database not usable')
  console.log(`  ${health.detail}`)
  if (health.missingTables.length) console.log(`  missing tables:  ${health.missingTables.join(', ')}`)
  if (health.missingBuckets.length) console.log(`  missing buckets: ${health.missingBuckets.join(', ')}`)
  if (!health.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('Check failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
