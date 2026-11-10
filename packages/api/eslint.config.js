//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import globals from 'globals'

export default [
  ...tanstackConfig,
  {
    // Generated / build output — never lint these.
    ignores: [
      'coverage/**',
      'drizzle/**',
      'docs/**',
      'eslint.config.js',
    ],
  },
  {
    // This is a Node package, not a browser app; swap the shared config's
    // browser globals for Node ones.
    files: ['**/*.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // `act(async () => …)` style flushes and async test setup deliberately
    // omit an inner await; mirror the web package's allowance.
    files: ['**/*.test.ts', 'test/**'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // The allow-list mutator lives under test/; runtime only reads the Set.
    files: ['src/**/*.ts'],
    ignores: [
      'src/lib/e2e-auth.ts',
      'src/**/*.test.ts',
      'src/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/e2e-auth-allow-list',
                './**/e2e-auth-allow-list',
                '../**/e2e-auth-allow-list',
              ],
              message:
                'Mutate the E2E allow-list from packages/api/test/ only.',
            },
            {
              group: ['**/test/*', '../test/*', '../../test/*'],
              message:
                'Runtime source cannot import packages/api/test helpers.',
            },
          ],
        },
      ],
    },
  },
]
