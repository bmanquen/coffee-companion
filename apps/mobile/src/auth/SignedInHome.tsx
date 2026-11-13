import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ShotForm } from '../espresso/ShotForm'
import { ShotList } from '../espresso/ShotList'
import { TRY_AGAIN } from '../espresso/copy'
import { idleEspressoApi } from '../espresso/types'
import { useEspressoCatalog } from '../espresso/use-espresso-catalog'
import { QueryProvider } from '../query'
import {
  SIGN_OUT_TEST_ID,
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from '../welcome'
import { SIGN_OUT } from './copy'
import type { EspressoApi } from '../espresso/types'

type Screen = 'list' | 'form'

export function SignedInHome({
  name,
  userId,
  onSignOut,
  espresso = idleEspressoApi,
}: {
  name: string
  userId: string
  onSignOut: () => void
  espresso?: EspressoApi
}) {
  return (
    <QueryProvider>
      <Home
        name={name}
        userId={userId}
        onSignOut={onSignOut}
        espresso={espresso}
      />
    </QueryProvider>
  )
}

function Home({
  name,
  userId,
  onSignOut,
  espresso,
}: {
  name: string
  userId: string
  onSignOut: () => void
  espresso: EspressoApi
}) {
  const [screen, setScreen] = useState<Screen>('list')
  const {
    catalog,
    loading,
    loadError,
    busy,
    saveError,
    reload,
    loadMore,
    loadPrefill,
    save,
    clearSaveError,
    loadingMore,
    loadMoreError,
  } = useEspressoCatalog(espresso, userId)

  return (
    <View
      accessibilityLabel={WELCOME_A11Y_LABEL}
      collapsable={false}
      testID={WELCOME_SCREEN_TEST_ID}
      style={styles.container}
    >
      <View style={styles.top}>
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
      {loadError && screen === 'list' ? (
        <View style={styles.loadError}>
          <Text accessibilityRole="alert">{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={reload}
          >
            <Text>{TRY_AGAIN}</Text>
          </Pressable>
        </View>
      ) : null}
      {screen === 'form' && catalog ? (
        <ShotForm
          catalog={catalog}
          busy={busy}
          error={saveError}
          loadPrefill={loadPrefill}
          onBack={() => {
            clearSaveError()
            setScreen('list')
          }}
          onClearError={clearSaveError}
          onSubmit={(input) => {
            save(input, () => setScreen('list'))
          }}
        />
      ) : (
        <ShotList
          shots={catalog?.shots ?? null}
          loading={loading}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          failed={loadError != null}
          onEndReached={loadMore}
          onLogShot={() => {
            if (!catalog) return
            clearSaveError()
            setScreen('form')
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
    gap: 16,
  },
  top: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  loadError: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
})
