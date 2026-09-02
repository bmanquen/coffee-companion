import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { loadTestDatabaseUrl } from './database'

// Global setup for DB-backed integration tests: applies the Drizzle migrations
// to the test database before any test runs. Intended for a database that
// exists only to be tested against — the test environment, or CI's service
// container — never a development or production one.
//
// Under Vitest's module runner, pg does not reliably honor a `connectionString`
// (it falls back to localhost), so we parse DATABASE_URL into the standard PG*
// environment variables. pg reads those for any field a connection string
// leaves unset, which fixes both this pool and the app's db singleton that the
// routers import.
export default async function setup() {
  const url = loadTestDatabaseUrl()
  process.env.PGHOST = url.hostname
  process.env.PGPORT = url.port || '5432'
  process.env.PGUSER = decodeURIComponent(url.username)
  process.env.PGPASSWORD = decodeURIComponent(url.password)
  process.env.PGDATABASE = url.pathname.slice(1)

  // Fixtures, not credentials. Nothing here reaches Stripe: the webhook tests
  // sign their own payloads with this same secret and verify them offline, and
  // the price identifiers only have to match what the server was configured
  // with. Set unconditionally so a developer whose environment holds real keys
  // never has a test use them.
  process.env.STRIPE_SECRET_KEY = 'sk_test_notARealKey'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_notARealSecret'
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_fixtureMonthly'
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_fixtureAnnual'

  const pool = new Pool()
  await migrate(drizzle({ client: pool }), { migrationsFolder: './drizzle' })
  await pool.end()
}
