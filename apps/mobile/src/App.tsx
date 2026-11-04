import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { API_URL_DEV_TAG, apiBaseUrl } from './auth/config'
import { logApiBaseUrl } from './auth/log'
import { SignedInHome } from './auth/SignedInHome'
import { SignInScreen } from './auth/SignInScreen'
import { useAuth } from './auth/use-auth'
import type { Auth } from './auth/use-auth'

export function App({ auth }: { auth?: Auth }) {
  return auth ? <Shell auth={auth} /> : <Live />
}

let loggedApiUrl = false

function Live() {
  if (!loggedApiUrl) {
    loggedApiUrl = true
    logApiBaseUrl(apiBaseUrl(), API_URL_DEV_TAG)
  }
  return <Shell auth={useAuth()} />
}

function Shell({ auth }: { auth: Auth }) {
  return (
    <>
      {auth.loading && !auth.session ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : auth.session ? (
        <SignedInHome
          name={auth.session.user.name}
          onSignOut={() => {
            void auth.signOut()
          }}
        />
      ) : (
        <SignInScreen
          mode={auth.mode}
          error={auth.error}
          busy={auth.busy}
          showApple={auth.showApple}
          onGoogle={() => {
            void auth.signInGoogle()
          }}
          onApple={() => {
            void auth.signInApple()
          }}
          onToggleMode={() =>
            auth.setMode(auth.mode === 'sign-in' ? 'sign-up' : 'sign-in')
          }
          onE2ESignIn={() => {
            void auth.signInE2E()
          }}
        />
      )}
      <StatusBar style="auto" />
    </>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
})
