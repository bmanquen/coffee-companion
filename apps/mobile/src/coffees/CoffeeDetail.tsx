import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { apiErrorMessage } from '../api-error'
import { TRYING_AGAIN, TRY_AGAIN } from '../espresso/copy'
import { brewSummary } from './brews'
import {
  BACK_TO_COFFEES,
  BREWS_HEADING,
  BREW_ROW_TEST_ID_PREFIX,
  BREW_SUMMARY_TEST_ID,
  COFFEE_DETAIL_BACK_TEST_ID,
  COFFEE_DETAIL_TEST_ID,
  DIALED_IN,
  EMPTY_BREWS,
  ERROR_LOAD_BREWS,
  LABEL_NOTES,
  LABEL_ORIGINS,
  LABEL_ROASTER,
  LABEL_ROAST_LEVEL,
  LABEL_VARIETIES,
  LOADING_BREWS,
} from './copy'
import type { CoffeeRow, CoffeesApi } from './types'

const COFFEE_BREWS_QUERY_KEY = 'coffee-brews'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}

export function CoffeeDetail({
  api,
  userId,
  coffee,
  onBack,
}: {
  api: CoffeesApi
  userId: string
  coffee: CoffeeRow
  onBack: () => void
}) {
  const brews = useQuery({
    queryKey: [COFFEE_BREWS_QUERY_KEY, userId, coffee.id],
    queryFn: () => api.listBrews(coffee.id),
    // A Brew logged on another tab must show the next time this opens.
    staleTime: 0,
  })
  const retrying = brews.isFetching

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => sub.remove()
  }, [onBack])

  const origins = coffee.origins
    .map((o) =>
      [o.country?.name, o.region?.name, o.process?.name]
        .filter(Boolean)
        .join(', '),
    )
    .filter(Boolean)
    .join('\n')

  return (
    <FlatList
      testID={COFFEE_DETAIL_TEST_ID}
      accessibilityLabel={coffee.name}
      style={styles.list}
      contentContainerStyle={styles.content}
      data={brews.data ?? []}
      keyExtractor={(brew) => `${brew.method}:${brew.id}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            testID={COFFEE_DETAIL_BACK_TEST_ID}
            onPress={onBack}
          >
            <Text>{BACK_TO_COFFEES}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>
            {coffee.name}
          </Text>
          <Field label={LABEL_ROASTER} value={coffee.roaster?.name ?? null} />
          <Field
            label={LABEL_ROAST_LEVEL}
            value={coffee.roastLevel?.name ?? null}
          />
          <Field label={LABEL_ORIGINS} value={origins} />
          <Field
            label={LABEL_VARIETIES}
            value={coffee.varieties
              .flatMap((v) => (v ? [v.name] : []))
              .join(', ')}
          />
          <Field label={LABEL_NOTES} value={coffee.notes} />
          {coffee.isDialedIn ? <Text>{DIALED_IN}</Text> : null}
          <Text accessibilityRole="header" style={styles.subtitle}>
            {BREWS_HEADING}
          </Text>
        </View>
      }
      ListEmptyComponent={
        brews.isPending ? (
          <View accessibilityLabel={LOADING_BREWS}>
            <ActivityIndicator />
          </View>
        ) : brews.isError ? (
          <View style={styles.error}>
            <Text accessibilityRole="alert">
              {apiErrorMessage(brews.error, ERROR_LOAD_BREWS)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: retrying, busy: retrying }}
              disabled={retrying}
              onPress={() => void brews.refetch()}
            >
              <Text>{retrying ? TRYING_AGAIN : TRY_AGAIN}</Text>
            </Pressable>
          </View>
        ) : (
          <Text>{EMPTY_BREWS}</Text>
        )
      }
      renderItem={({ item }) => (
        <View
          testID={`${BREW_ROW_TEST_ID_PREFIX}${item.id}`}
          style={[styles.row, item.sealed && styles.sealed]}
        >
          <Text style={styles.label}>
            {item.method} · {item.createdAt.toLocaleDateString()}
            {item.isDialedIn ? ` · ${DIALED_IN}` : ''}
          </Text>
          <Text testID={BREW_SUMMARY_TEST_ID}>{brewSummary(item)}</Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  content: { gap: 12, paddingHorizontal: 16, paddingBottom: 32 },
  header: { gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  field: { gap: 2 },
  label: { color: '#666' },
  error: { alignItems: 'center', gap: 8 },
  row: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sealed: { opacity: 0.6 },
})
