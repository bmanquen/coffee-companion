import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import {
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from './welcome'

/** Renders the mobile welcome screen and configures the status bar. */
export function App() {
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
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
