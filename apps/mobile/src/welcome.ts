export const WELCOME_SCREEN_TEST_ID = 'welcome-screen'
export const WELCOME_HEADING_TEST_ID = 'welcome-heading'
export const SIGN_OUT_TEST_ID = 'sign-out'
export const WELCOME_A11Y_LABEL = 'Welcome'
export const WELCOME_HEADING_ROLE = 'header' as const

/** Returns the app name displayed on the welcome screen. */
export function welcomeMessage(): string {
  return 'Coffee Companion'
}
