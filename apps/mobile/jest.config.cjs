const { dirname } = require('node:path')

// babel-preset-expo is Expo's dependency, not a direct mobile dep.
function mjsBabelTransform() {
  const expoRoot = dirname(require.resolve('expo/package.json'))
  const babelPresetExpo = require.resolve('babel-preset-expo', {
    paths: [expoRoot],
  })
  return [
    'babel-jest',
    {
      presets: [babelPresetExpo],
      caller: { name: 'metro', bundler: 'jest', platform: 'ios' },
    },
  ]
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  // better-auth ships ESM .mjs; jest-expo's babel transform is only .[jt]sx?
  transform: {
    '\\.mjs$': mjsBabelTransform(),
  },
  // pnpm nests packages under node_modules/.pnpm; Expo's default ignore
  // pattern would skip transforming react-native and expo there.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|@react-native-google-signin/.*|@coffee-companion/.*|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|test-renderer|better-auth|@better-auth/.*|nanostores|@nanostores/.*|@better-fetch/.*|defu|@trpc/.*|superjson))',
  ],
}
