import { SHOT_IDEMPOTENCY_DELETED } from '@coffee-companion/api/lib/espresso'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiErrorMessage, mayHaveCommitted } from '../api-error'
import { ShotForm } from '../espresso/ShotForm'
import { ShotList } from '../espresso/ShotList'
import { TRYING_AGAIN, TRY_AGAIN } from '../espresso/copy'
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
import type { PrefillSource } from '../espresso/ShotForm'
import type { EspressoApi } from '../espresso/types'

type Screen = 'list' | 'form'

export function SignedInHome({
  name,
  userId,
  onSignOut,
  signOutError = null,
  espresso = idleEspressoApi,
}: {
  name: string
  userId: string
  onSignOut: () => void
  signOutError?: string | null
  espresso?: EspressoApi
}) {
  return (
    <QueryProvider>
      {/* Keyed by user, so another account never inherits a pending save,
          its draft, or its retry keys. */}
      <Home
        key={userId}
        name={name}
        userId={userId}
        onSignOut={onSignOut}
        signOutError={signOutError}
        espresso={espresso}
      />
    </QueryProvider>
  )
}

function Home({
  name,
  userId,
  onSignOut,
  signOutError,
  espresso,
}: {
  name: string
  userId: string
  onSignOut: () => void
  signOutError: string | null
  espresso: EspressoApi
}) {
  const [screen, setScreen] = useState<Screen>('list')
  const idempotencyKeys = useRef(new Map<string, string>())
  const unresolvedSaves = useRef(new Map<string, Map<string, PrefillSource>>())
  const {
    catalog,
    shots,
    hasMore,
    refreshing,
    loading,
    loadError,
    retrying,
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
          // Like Back, it would leave the form while a save is out.
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onSignOut}
        >
          <Text>{SIGN_OUT}</Text>
        </Pressable>
        {signOutError ? (
          <Text accessibilityRole="alert">{signOutError}</Text>
        ) : null}
      </View>
      {loadError && screen === 'list' ? (
        <View style={styles.loadError}>
          <Text accessibilityRole="alert">{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: retrying, busy: retrying }}
            disabled={retrying}
            onPress={reload}
          >
            <Text>{retrying ? TRYING_AGAIN : TRY_AGAIN}</Text>
          </Pressable>
        </View>
      ) : null}
      {screen === 'form' && catalog ? (
        <ShotForm
          catalog={catalog}
          busy={busy}
          error={saveError}
          loadPrefill={loadPrefill}
          idempotencyKeys={idempotencyKeys.current}
          unresolvedSaves={unresolvedSaves.current}
          onBack={() => {
            clearSaveError()
            setScreen('list')
          }}
          onClearError={clearSaveError}
          onSubmit={(input) => {
            const saves = unresolvedSaves.current
            const forgetKey = () => {
              const keys = idempotencyKeys.current
              for (const [draft, key] of keys) {
                if (key === input.idempotencyKey) keys.delete(draft)
              }
              saves.get(input.coffeeId)?.delete(input.idempotencyKey)
            }
            save(
              input,
              () => {
                forgetKey()
                setScreen('list')
              },
              // That shot is gone for good, so the next Log saves a new one.
              (error) => {
                if (apiErrorMessage(error, '') === SHOT_IDEMPOTENCY_DELETED) {
                  forgetKey()
                } else if (mayHaveCommitted(error)) {
                  // Its retry must replay it, so later prefills fill this.
                  const forCoffee = saves.get(input.coffeeId) ?? new Map()
                  forCoffee.delete(input.idempotencyKey)
                  forCoffee.set(input.idempotencyKey, {
                    grinderId: input.grinderId,
                    brewingDeviceId: input.brewingDeviceId,
                    roastDate: input.roastDate,
                  })
                  saves.set(input.coffeeId, forCoffee)
                }
              },
            )
          }}
        />
      ) : (
        <ShotList
          shots={shots}
          // The form needs the equipment catalog, not only the history.
          canLog={!loading && catalog != null}
          hasMore={hasMore}
          refreshing={refreshing}
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
