import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  APP_NAME,
  HAS_ACCOUNT_ACTION,
  HAS_ACCOUNT_PROMPT,
  NO_ACCOUNT_ACTION,
  NO_ACCOUNT_PROMPT,
  SIGN_IN_HEADING,
  SIGN_IN_WITH_APPLE,
  SIGN_IN_WITH_GOOGLE,
  SIGN_UP_HEADING,
  SIGN_UP_WITH_APPLE,
  SIGN_UP_WITH_GOOGLE,
} from './copy'
import type { AuthError, AuthMode } from './use-auth'

export const SIGN_IN_SCREEN_TEST_ID = 'sign-in-screen'
export const SIGN_IN_HEADING_TEST_ID = 'sign-in-heading'
export const SIGN_IN_ERROR_TEST_ID = 'sign-in-error'
export const SIGN_IN_NO_ACCOUNT_TEST_ID = 'sign-in-no-account'
export const SIGN_IN_GOOGLE_TEST_ID = 'sign-in-google'
export const SIGN_IN_APPLE_TEST_ID = 'sign-in-apple'
export const SIGN_IN_TOGGLE_TEST_ID = 'sign-in-toggle'
export const SIGN_IN_A11Y_LABEL = 'Sign in'

export function SignInScreen({
  mode,
  error,
  busy,
  showApple,
  onGoogle,
  onApple,
  onToggleMode,
}: {
  mode: AuthMode
  error: AuthError | null
  busy: boolean
  showApple: boolean
  onGoogle: () => void
  onApple: () => void
  onToggleMode: () => void
}) {
  const signingUp = mode === 'sign-up'
  const heading = signingUp ? SIGN_UP_HEADING : SIGN_IN_HEADING
  const google = signingUp ? SIGN_UP_WITH_GOOGLE : SIGN_IN_WITH_GOOGLE
  const apple = signingUp ? SIGN_UP_WITH_APPLE : SIGN_IN_WITH_APPLE

  return (
    <View
      accessibilityLabel={SIGN_IN_A11Y_LABEL}
      testID={SIGN_IN_SCREEN_TEST_ID}
      style={styles.container}
    >
      <Text accessibilityRole="header">{APP_NAME}</Text>
      <Text
        accessibilityRole="header"
        testID={SIGN_IN_HEADING_TEST_ID}
        style={styles.heading}
      >
        {heading}
      </Text>
      <Pressable
        accessibilityRole="button"
        testID={SIGN_IN_GOOGLE_TEST_ID}
        disabled={busy}
        onPress={onGoogle}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{google}</Text>
      </Pressable>
      {showApple ? (
        <Pressable
          accessibilityRole="button"
          testID={SIGN_IN_APPLE_TEST_ID}
          disabled={busy}
          onPress={onApple}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>{apple}</Text>
        </Pressable>
      ) : null}
      <View style={styles.switchRow} testID={SIGN_IN_NO_ACCOUNT_TEST_ID}>
        <Text>
          {signingUp ? HAS_ACCOUNT_PROMPT : NO_ACCOUNT_PROMPT}{' '}
        </Text>
        <Pressable
          accessibilityRole="button"
          testID={SIGN_IN_TOGGLE_TEST_ID}
          disabled={busy}
          onPress={onToggleMode}
        >
          <Text style={styles.link}>
            {signingUp ? HAS_ACCOUNT_ACTION : NO_ACCOUNT_ACTION}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <View
          accessible
          accessibilityRole="alert"
          testID={SIGN_IN_ERROR_TEST_ID}
          style={styles.errorBlock}
        >
          <Text style={styles.errorTitle}>{error.title}</Text>
          {error.body ? <Text style={styles.errorBody}>{error.body}</Text> : null}
        </View>
      ) : null}
      {busy ? <ActivityIndicator /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  button: {
    minWidth: 240,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  buttonLabel: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorBlock: {
    marginTop: 8,
    gap: 4,
  },
  errorTitle: {
    color: '#b00020',
    textAlign: 'center',
    fontWeight: '600',
  },
  errorBody: {
    color: '#b00020',
    textAlign: 'center',
  },
})
