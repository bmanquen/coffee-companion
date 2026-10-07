import { defineConfig } from 'vitest/config'

const roastDateTests = ['src/lib/calendar-date.test.ts', 'src/db/zod.test.ts']

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Integration tests need a database and run via vitest.integration.config.ts.
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'chicago',
          env: { TZ: 'America/Chicago' },
          include: ['src/**/*.test.ts'],
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
