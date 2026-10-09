import type { ExpoConfig } from 'expo/config'

const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME

const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-secure-store',
  'expo-apple-authentication',
  'expo-dev-client',
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
  version: '1.0.0',
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
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
  plugins,
}

export default config
