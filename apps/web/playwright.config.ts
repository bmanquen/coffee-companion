import { defineConfig, devices } from '@playwright/test'
import {
  E2E_USER_EMPTY,
  E2E_USER_WITH_DATA,
} from '@coffee-companion/api/lib/e2e-auth'

// End-to-end tests. Boots the app and drives it in a real browser.
//
// Projects:
// - `public`       — unauthenticated pages (no cookie).
// - `authed-data`  — acts as the seeded user (data-state tests).
// - `authed-empty` — acts as an unseeded user (empty-state tests).
//
// The `e2e_auth=<userId>` cookie (with E2E_BYPASS_AUTH=true on the server) makes
// the app treat the request as that user without exercising the real Google
// OAuth / session machinery. See packages/api/src/lib/e2e-auth.ts.
//
// Target selection:
//   - E2E_BASE_URL set  -> run against that already-running server (e.g. a
//     hosted/staging instance); Playwright does NOT start a local server.
//   - otherwise         -> build and boot the app locally on PORT (used by CI).
const PORT = 3000
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const cookieDomain = new URL(baseURL).hostname

// storageState carrying the bypass cookie for a given user, scoped to this
// project's browser only.
const authAs = (userId: string) => ({
  cookies: [
    {
      name: 'e2e_auth',
      value: userId,
      domain: cookieDomain,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: baseURL.startsWith('https'),
      sameSite: 'Lax' as const,
    },
  ],
  origins: [],
})

export default defineConfig({
  testDir: './e2e',
  // Seed the bypass test user (skipped when targeting an external server).
  globalSetup: process.env.E2E_BASE_URL ? undefined : './e2e/seed.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'public',
      testMatch: /landing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authed-data',
      testMatch: /\.data\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authAs(E2E_USER_WITH_DATA),
      },
    },
    {
      name: 'authed-empty',
      testMatch: /\.empty\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authAs(E2E_USER_EMPTY),
      },
    },
  ],
  // When no external E2E_BASE_URL is given, run against a production build
  // rather than the dev server: the built Node server reads env at runtime and
  // connects to Postgres reliably, without the dev server's on-demand-
  // compilation and caching quirks. The build runs first (see the test:e2e
  // script); Playwright launches the server as a direct node process so it can
  // be torn down cleanly (no orphaned process on the port).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node .output/server/index.mjs',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // The server inherits the environment (DATABASE_URL etc. from CI, or
        // from .env.local locally); we only add the test-auth bypass + port.
        env: {
          PORT: String(PORT),
          E2E_BYPASS_AUTH: 'true',
        },
      },
})
