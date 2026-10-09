import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SignedInHome } from './auth/SignedInHome'
import { SignInScreen } from './auth/SignInScreen'
import { useAuth } from './auth/use-auth'
import type { Auth } from './auth/use-auth'

export function App({ auth }: { auth?: Auth }) {
  return auth ? <Shell auth={auth} /> : <Live />
}

function Live() {
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
