import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { welcomeMessage } from './welcome'

/** Renders the mobile welcome screen and configures the status bar. */
export function App() {
  return (
    <View style={styles.container}>
      <Text>{welcomeMessage()}</Text>
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
