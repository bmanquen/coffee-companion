import { config as loadEnv } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

// Pick up DATABASE_URL from .env.local for local runs. In CI it's already set.
loadEnv({ path: '.env.local' })

// Global setup for DB-backed integration tests: applies the Drizzle migrations
// to the database pointed at by DATABASE_URL before any test runs. Intended for
// a disposable test database (a temporary local Postgres or the CI service).
//
// Under Vitest's module runner, pg does not reliably honor a `connectionString`
// (it falls back to localhost), so we parse DATABASE_URL into the standard PG*
// environment variables. pg reads those for any field a connection string
// leaves unset, which fixes both this pool and the app's db singleton that the
// routers import.
export default async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set to run integration tests (use a disposable test database).',
    )
  }

  const url = new URL(process.env.DATABASE_URL)
  process.env.PGHOST = url.hostname
  process.env.PGPORT = url.port || '5432'
  process.env.PGUSER = decodeURIComponent(url.username)
  process.env.PGPASSWORD = decodeURIComponent(url.password)
  process.env.PGDATABASE = url.pathname.slice(1)

  const pool = new Pool()
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  await pool.end()
}
