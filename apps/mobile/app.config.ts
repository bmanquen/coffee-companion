import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Coffee Companion',
  slug: 'coffee-companion',
  version: '1.0.0',
  orientation: 'portrait',
  // Template Expo icons. Adaptive background is neutral white — same as the
  // welcome screen. Replace artwork before any store build; do not invent brand.
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
}

export default config
