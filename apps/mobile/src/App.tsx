import { useEffect, useMemo } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { createLiveCoffeesApi, createLiveEspressoApi } from './api'
import { API_URL_DEV_TAG, apiBaseUrl } from './auth/config'
import { logApiBaseUrl } from './auth/log'
import { SignedInHome } from './auth/SignedInHome'
import { SignInScreen } from './auth/SignInScreen'
import { useAuth } from './auth/use-auth'
import { idleCoffeesApi } from './coffees/types'
import { idleEspressoApi } from './espresso/types'
import type { CoffeesApi } from './coffees/types'
import type { EspressoApi } from './espresso/types'
import type { Auth } from './auth/use-auth'

export function App({
  auth,
  espresso,
  coffees,
}: {
  auth?: Auth
  espresso?: EspressoApi
  coffees?: CoffeesApi
}) {
  return auth ? (
    <Shell
      auth={auth}
      espresso={espresso ?? idleEspressoApi}
      coffees={coffees ?? idleCoffeesApi}
    />
  ) : (
    <Live espresso={espresso} coffees={coffees} />
  )
}

function Live({
  espresso,
  coffees,
}: {
  espresso?: EspressoApi
  coffees?: CoffeesApi
}) {
  const auth = useAuth()
  const liveEspresso = useMemo(
    () => espresso ?? createLiveEspressoApi(),
    [espresso],
  )
  const liveCoffees = useMemo(
    () => coffees ?? createLiveCoffeesApi(),
    [coffees],
  )
  useEffect(() => {
    logApiBaseUrl(apiBaseUrl(), API_URL_DEV_TAG)
  }, [])
  return <Shell auth={auth} espresso={liveEspresso} coffees={liveCoffees} />
}

function Shell({
  auth,
  espresso,
  coffees,
}: {
  auth: Auth
  espresso: EspressoApi
  coffees: CoffeesApi
}) {
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
          coffees={coffees}
          signOutError={auth.error?.title ?? null}
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
