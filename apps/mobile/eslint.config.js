//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    // Generated / build output — never lint these.
    ignores: [
      '.expo/**',
      'dist/**',
      'coverage/**',
      'eslint.config.js',
      'scripts/**',
    ],
  },
]
