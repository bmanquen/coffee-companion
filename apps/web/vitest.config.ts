import { defineConfig } from 'vitest/config'
import tsConfigPaths from 'vite-tsconfig-paths'

const roastDateTests = [
  'src/components/form/date-picker.test.tsx',
  'src/lib/brew.test.ts',
  'src/routes/_authenticated/espresso/new.test.tsx',
  'src/routes/_authenticated/espresso/$shotId.edit.test.tsx',
]

// Unit + component tests (Vitest + Testing Library, jsdom). E2E lives in ./e2e
// and runs under Playwright, so it's excluded here.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**', // test helpers
        'src/routeTree.gen.ts',
        'src/routes/**', // page components — covered by Playwright e2e
        'src/components/ui/**', // shadcn primitives (vendored)
        'src/integrations/**', // tRPC / React Query wiring
        'src/router.tsx', // router setup (wiring)
        'src/client.tsx',
        'src/server.ts',
        'src/instrument.client.ts',
        'src/instrument.server.ts',
        'src/analytics.client.ts',
        'src/lib/sentry-client.ts', // browser Sentry SDK seam (wiring)
        'src/lib/auth-client.ts', // better-auth client config (wiring)
        'src/lib/request-headers.ts', // isomorphic SSR header helper (wiring)
      ],
      // Floors below current (~95%); a regression fails the run.
      thresholds: {
        statements: 90,
        functions: 90,
        lines: 90,
        branches: 75,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'chicago',
          env: { TZ: 'America/Chicago' },
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
        },
      },
      // toISOString() on local midnight rolls back a day ahead of UTC.
      {
        extends: true,
        test: {
          name: 'tokyo',
          env: { TZ: 'Asia/Tokyo' },
          include: roastDateTests,
        },
      },
    ],
  },
})
