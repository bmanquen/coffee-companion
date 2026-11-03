import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  SIGN_OUT_TEST_ID,
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from '../welcome'
import { SIGN_OUT } from './copy'

export function SignedInHome({
  name,
  onSignOut,
}: {
  name: string
  onSignOut: () => void
}) {
  return (
    <View
      accessibilityLabel={WELCOME_A11Y_LABEL}
      testID={WELCOME_SCREEN_TEST_ID}
      style={styles.container}
    >
      <Text
        accessibilityRole={WELCOME_HEADING_ROLE}
        testID={WELCOME_HEADING_TEST_ID}
      >
        {welcomeMessage()}
      </Text>
      <Text>{name}</Text>
      <Pressable
        accessibilityRole="button"
        testID={SIGN_OUT_TEST_ID}
        onPress={onSignOut}
      >
        <Text>{SIGN_OUT}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
})
