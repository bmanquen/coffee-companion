import { registerRootComponent } from 'expo'
import { App } from './src/App'
import { API_URL_DEV_TAG } from './src/auth/config'

// Keep the tag in the entry graph. A lazy Metro client bundle can omit App.tsx.
void API_URL_DEV_TAG

// Sets up Expo Go and native builds; AppRegistry.registerComponent alone does not.
registerRootComponent(App)
