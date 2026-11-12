import { useEffect, useMemo } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { createLiveEspressoApi } from './api'
import { API_URL_DEV_TAG, apiBaseUrl } from './auth/config'
import { logApiBaseUrl } from './auth/log'
import { SignedInHome } from './auth/SignedInHome'
import { SignInScreen } from './auth/SignInScreen'
import { useAuth } from './auth/use-auth'
import { idleEspressoApi } from './espresso/types'
import type { EspressoApi } from './espresso/types'
import type { Auth } from './auth/use-auth'

export function App({
  auth,
  espresso,
}: {
  auth?: Auth
  espresso?: EspressoApi
}) {
  return auth ? (
    <Shell auth={auth} espresso={espresso ?? idleEspressoApi} />
  ) : (
    <Live espresso={espresso} />
  )
}

function Live({ espresso }: { espresso?: EspressoApi }) {
  const auth = useAuth()
  const liveEspresso = useMemo(
    () => espresso ?? createLiveEspressoApi(),
    [espresso],
  )
  useEffect(() => {
    logApiBaseUrl(apiBaseUrl(), API_URL_DEV_TAG)
  }, [])
  return <Shell auth={auth} espresso={liveEspresso} />
}

function Shell({ auth, espresso }: { auth: Auth; espresso: EspressoApi }) {
  return (
    <>
      {auth.loading && !auth.session ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : auth.session ? (
        <SignedInHome
          key={auth.session.user.id}
          userId={auth.session.user.id}
          name={auth.session.user.name}
          espresso={espresso}
          error={auth.error}
          onSignOut={() => {
            void auth.signOut().catch(() => {})
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
