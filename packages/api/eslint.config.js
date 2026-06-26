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
]
