import { config as loadEnv } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

// Pick up DATABASE_URL from .env.test for local runs. In CI it's already set.
// Deliberately not .env.local: that names the development database, which the
// suite would delete rows from.
//
// `override` because dotenv otherwise keeps whatever the shell already exported
// — and a shell that exports DATABASE_URL at all is exporting a development one.
// The file is the authority on which database this suite may touch.
const testEnv = loadEnv({ path: '.env.test', override: true })

// Global setup for DB-backed integration tests: applies the Drizzle migrations
// to the database pointed at by DATABASE_URL before any test runs. Intended for
// a database that exists only to be tested against — the test environment, or
// CI's service container — never a development or production one.
//
// Under Vitest's module runner, pg does not reliably honor a `connectionString`
// (it falls back to localhost), so we parse DATABASE_URL into the standard PG*
// environment variables. pg reads those for any field a connection string
// leaves unset, which fixes both this pool and the app's db singleton that the
// routers import.
export default async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set to run integration tests. Copy .env.test.example ' +
        'to .env.test and point it at the test-environment database — never a ' +
        'development or production one, as the suite deletes rows on every run.',
    )
  }

  const url = new URL(process.env.DATABASE_URL)

  // Without the file there is nothing to override with, so DATABASE_URL is
  // whatever the shell inherited. That is only acceptable when the URL itself
  // proves it's a throwaway: a local database named *_test, which is how CI's
  // service container looks. A flag like CI=true is not proof — any wrapper can
  // set it — so the target is checked, not the environment.
  if (testEnv.error && !isLocalTestDatabase(url)) {
    throw new Error(
      'packages/api/.env.test is missing, and an inherited DATABASE_URL is only ' +
        `trusted when it names a local *_test database (got ${url.hostname}/` +
        `${url.pathname.slice(1)}). Copy .env.test.example to .env.test and point ` +
        'it at the test-environment database — never a development or production ' +
        'one, as the suite deletes rows on every run.',
    )
  }
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

function isLocalTestDatabase(url: URL) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return local && url.pathname.slice(1).endsWith('_test')
}
