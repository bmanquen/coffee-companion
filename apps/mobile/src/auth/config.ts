export const APP_SCHEME = 'coffeecompanion'
export const APP_BUNDLE_ID = 'com.bmanquen.coffeecompanion'

export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
}

export function googleWebClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
}

export function googleIosClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
}
