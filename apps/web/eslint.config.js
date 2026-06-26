//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    // Generated / build output — never lint these.
    ignores: [
      '.output/**',
      'dist/**',
      'coverage/**',
      'src/routeTree.gen.ts',
      'eslint.config.js',
    ],
  },
  {
    // shadcn-vendored UI primitives follow upstream conventions, including
    // nested render props that intentionally shadow outer-scope names.
    files: ['src/components/ui/**'],
    rules: {
      'no-shadow': 'off',
    },
  },
  {
    // `act(async () => …)` is the standard Testing Library flush idiom; the
    // callback deliberately has no await of its own.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
]
