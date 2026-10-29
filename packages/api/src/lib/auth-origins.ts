export const APP_SCHEME_ORIGIN = 'coffeecompanion://'
export const EXPO_DEV_ORIGIN = 'exp://'

// Expo’s bundler speaks exp://. That origin is a development client, not a
// production install, so production must not treat it as trusted.
export function trustedAuthOrigins(
  baseURL: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Array<string> {
  if (nodeEnv === 'production') return [baseURL, APP_SCHEME_ORIGIN]
  return [baseURL, APP_SCHEME_ORIGIN, EXPO_DEV_ORIGIN]
}
