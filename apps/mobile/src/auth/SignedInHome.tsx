import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { apiErrorMessage } from '../api-error'
import { ShotForm } from '../espresso/ShotForm'
import { ShotList } from '../espresso/ShotList'
import {
  ERROR_LOAD_FAILED,
  ERROR_SAVE_FAILED,
  TRY_AGAIN,
} from '../espresso/copy'
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
  const loadSeq = useRef(0)
  const loadingRef = useRef(true)

  const showCatalog = useCallback((next: EspressoCatalog) => {
    loadingRef.current = false
    setCatalog(next)
    setLoadError(null)
    setLoading(false)
  }, [])

  const failLoad = useCallback((error: unknown) => {
    loadingRef.current = false
    setLoadError(apiErrorMessage(error, ERROR_LOAD_FAILED))
    setLoading(false)
  }, [])

  const beginLoad = useCallback(() => {
    const seq = ++loadSeq.current
    loadingRef.current = true
    setLoadError(null)
    setLoading(true)
    runMaybePromise(
      () => espresso.load(),
      (next) => {
        // A newer load replaces this one; a late failure must not hide that catalog.
        if (seq !== loadSeq.current) return
        showCatalog(next)
      },
      (error) => {
        if (seq !== loadSeq.current) return
        failLoad(error)
      },
    )
  }, [espresso, showCatalog, failLoad])

  const reload = useCallback(() => {
    if (loadingRef.current) return
    beginLoad()
  }, [beginLoad])

  useEffect(() => {
    beginLoad()
  }, [beginLoad])

  const save = (input: ShotCreate) => {
    setBusy(true)
    setSaveError(null)
    runMaybePromise(
      () => espresso.create(input),
      () => {
        setSaveError(null)
        setScreen('list')
        setBusy(false)
        reload()
      },
      (error) => {
        setSaveError(apiErrorMessage(error, ERROR_SAVE_FAILED))
        setBusy(false)
      },
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
          failed={loadError != null}
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
  loadError: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
})
