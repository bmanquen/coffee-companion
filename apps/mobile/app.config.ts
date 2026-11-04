import { execFileSync } from 'node:child_process'
import type { ExpoConfig } from 'expo/config'

export const GIT_SHORT_SHA_DIGITS = 7

type GitRunner = (
  file: string,
  args: ReadonlyArray<string>,
  options: { cwd: string; encoding: 'utf8' },
) => string

export function gitHeadShortSha(
  cwd = process.cwd(),
  run: GitRunner = execFileSync,
): string {
  return run('git', ['rev-parse', `--short=${GIT_SHORT_SHA_DIGITS}`, 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim()
}

export const VERIFY_APK_VERSION_ENV = 'VERIFY_APK_VERSION'

export function resolveApkVersion(
  env: { readonly [key: string]: string | undefined } = process.env,
  gitSha: () => string = gitHeadShortSha,
): string {
  const fromEnv = `${env[VERIFY_APK_VERSION_ENV] ?? ''}`.trim()
  if (fromEnv) return fromEnv
  return gitSha()
}

const gitHead = resolveApkVersion()
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME

// Expo 57 auto-opens the developer menu over the app; keep it closed for device E2E.
export const DEV_CLIENT_PLUGIN_CONFIG = {
  showMenuAtLaunch: false,
  skipOnboarding: true,
}

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-secure-store',
  'expo-apple-authentication',
  ['expo-dev-client', DEV_CLIENT_PLUGIN_CONFIG],
  'expo-web-browser',
]
if (googleIosUrlScheme) {
  plugins.push([
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: googleIosUrlScheme },
  ])
}

const config: ExpoConfig = {
  name: 'Coffee Companion',
  slug: 'coffee-companion',
  scheme: 'coffeecompanion',
  version: gitHead,
  orientation: 'portrait',
  // Template Expo icons. Adaptive background is neutral white — same as the
  // welcome screen. Replace artwork before any store build; do not invent brand.
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'dev.offbyonelabs.coffeecompanion',
    usesAppleSignIn: true,
  },
  android: {
    package: 'dev.offbyonelabs.coffeecompanion',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  extra: {
    gitHead,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
  plugins,
}

export default config
