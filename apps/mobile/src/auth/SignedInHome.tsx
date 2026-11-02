import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiErrorMessage } from '../api-error'
import { ShotForm } from '../espresso/ShotForm'
import { ShotList } from '../espresso/ShotList'
import { ERROR_LOAD_FAILED, ERROR_SAVE_FAILED } from '../espresso/copy'
import { idleEspressoApi, runMaybePromise } from '../espresso/types'
import {
  SIGN_OUT_TEST_ID,
  WELCOME_A11Y_LABEL,
  WELCOME_HEADING_ROLE,
  WELCOME_HEADING_TEST_ID,
  WELCOME_SCREEN_TEST_ID,
  welcomeMessage,
} from '../welcome'
import { SIGN_OUT } from './copy'
import type { EspressoApi, EspressoCatalog, ShotCreate } from '../espresso/types'

type Screen = 'list' | 'form'

export function SignedInHome({
  name,
  onSignOut,
  espresso = idleEspressoApi,
}: {
  name: string
  onSignOut: () => void
  espresso?: EspressoApi
}) {
  const [screen, setScreen] = useState<Screen>('list')
  const [catalog, setCatalog] = useState<EspressoCatalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const showCatalog = useCallback((next: EspressoCatalog) => {
    setCatalog(next)
    setLoadError(null)
    setLoading(false)
  }, [])

  const failLoad = useCallback((error: unknown) => {
    setLoadError(apiErrorMessage(error, ERROR_LOAD_FAILED))
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    runMaybePromise(
      () => espresso.load(),
      (next) => {
        if (!cancelled) showCatalog(next)
      },
      (error) => {
        if (!cancelled) failLoad(error)
      },
    )
    return () => {
      cancelled = true
    }
  }, [espresso, showCatalog, failLoad])

  const save = (input: ShotCreate) => {
    setBusy(true)
    setSaveError(null)
    const failSave = (error: unknown) => {
      setSaveError(apiErrorMessage(error, ERROR_SAVE_FAILED))
      setBusy(false)
    }
    runMaybePromise(
      () => espresso.create(input),
      () => {
        runMaybePromise(
          () => espresso.load(),
          (next) => {
            showCatalog(next)
            setSaveError(null)
            setScreen('list')
            setBusy(false)
          },
          failSave,
        )
      },
      failSave,
    )
  }

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
        <Text accessibilityRole="alert">{loadError}</Text>
      ) : null}
      {screen === 'form' && catalog ? (
        <ShotForm
          catalog={catalog}
          busy={busy}
          error={saveError}
          onBack={() => {
            setSaveError(null)
            setScreen('list')
          }}
          onSubmit={save}
        />
      ) : (
        <ShotList
          shots={catalog?.shots ?? null}
          loading={loading}
          onLogShot={() => {
            if (!catalog) return
            setSaveError(null)
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
})
