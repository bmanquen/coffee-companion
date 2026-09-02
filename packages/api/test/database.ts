import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

// The one file that names the database the test suites may touch. Deliberately
// not .env.local: that names the development database, which the suites
// delete rows from on every run.
const ENV_TEST = fileURLToPath(new URL('../.env.test', import.meta.url))

const HOW_TO_FIX =
  'Copy packages/api/.env.test.example to packages/api/.env.test and point it ' +
  'at the test-environment database — never a development or production one, ' +
  'as the test suites delete rows on every run.'

// Resolves the database the test suites may touch, leaving it in
// process.env.DATABASE_URL for whatever connects next: the integration
// suite's pool, the e2e seed, and the app server Playwright boots.
//
// `override` because dotenv otherwise keeps whatever the shell already
// exported — and a shell that exports DATABASE_URL at all is exporting a
// development one. The file is the authority on which database this is.
//
// Without the file there is nothing to override with, so DATABASE_URL is
// whatever the shell inherited. That is only acceptable when the URL itself
// proves it's a throwaway: a local database named *_test, which is how CI's
// service container looks. A flag like CI=true is not proof — any wrapper can
// set it — so the target is checked, not the environment.
export function loadTestDatabaseUrl(): URL {
  const file = loadEnv({ path: ENV_TEST, override: true, quiet: true })

  if (!process.env.DATABASE_URL) {
    throw new Error(
      `DATABASE_URL must be set to run the test suites. ${HOW_TO_FIX}`,
    )
  }

  const url = new URL(process.env.DATABASE_URL)

  if (file.error && !isLocalTestDatabase(url)) {
    throw new Error(
      'packages/api/.env.test is missing, and an inherited DATABASE_URL is only ' +
        `trusted when it names a local *_test database (got ${url.hostname}/` +
        `${url.pathname.slice(1)}). ${HOW_TO_FIX}`,
    )
  }

  return url
}

function isLocalTestDatabase(url: URL) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return local && url.pathname.slice(1).endsWith('_test')
}
