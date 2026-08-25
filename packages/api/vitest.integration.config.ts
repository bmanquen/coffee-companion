import { defineConfig } from 'vitest/config'

// DB-backed integration tests. Require a DATABASE_URL pointing at the test
// environment; migrations are applied once in globalSetup. Run serially so
// tests sharing the database don't race.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Unit + integration together, so a coverage run reflects everything the
    // backend is actually tested by (the unit tests ride along harmlessly).
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    globalSetup: ['./test/integration.setup.ts'],
    fileParallelism: false,
    // Generous because the database is reached over the network: a fixture-heavy
    // beforeAll issues hundreds of statements, and each pays a round trip.
    hookTimeout: 300_000,
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // db/ is schema + connection + seed (declarative/boilerplate), not logic.
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/db/**',
      ],
      // Floors below current (~99%); a regression fails the run.
      thresholds: {
        statements: 90,
        functions: 85,
        lines: 90,
        branches: 75,
      },
    },
  },
})
