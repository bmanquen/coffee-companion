import { coffeeMatchesSearch } from '@coffee-companion/brew-display'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { apiErrorMessage } from '../api-error'
import { TRYING_AGAIN, TRY_AGAIN } from '../espresso/copy'
import {
  COFFEES_HEADING,
  COFFEE_LIST_TEST_ID,
  COFFEE_ROW_TEST_ID_PREFIX,
  COFFEE_SEARCH_TEST_ID,
  EMPTY_COFFEES,
  ERROR_LOAD_COFFEES,
  LOADING_COFFEES,
  NO_MATCHING_COFFEES,
  SEARCH_COFFEES,
} from './copy'
import type { CoffeeRow, CoffeesApi } from './types'

export const COFFEES_QUERY_KEY = 'coffees'

export function useCoffees(api: CoffeesApi, userId: string) {
  return useQuery({
    queryKey: [COFFEES_QUERY_KEY, userId],
    queryFn: () => api.list(),
  })
}

function originSummary(coffee: CoffeeRow): string {
  return coffee.origins
    .map((o) => [o.country?.name, o.region?.name].filter(Boolean).join(', '))
    .filter(Boolean)
    .join(' · ')
}

export function CoffeeList({
  api,
  userId,
  search,
  onSearch,
  onOpen,
}: {
  api: CoffeesApi
  userId: string
  // Held by the caller, so it survives opening a Coffee and coming back.
  search: string
  onSearch: (search: string) => void
  onOpen: (coffee: CoffeeRow) => void
}) {
  const coffees = useCoffees(api, userId)
  const rows = useMemo(
    () => (coffees.data ?? []).filter((c) => coffeeMatchesSearch(search, c)),
    [coffees.data, search],
  )
  const retrying = coffees.isFetching

  return (
    <FlatList
      testID={COFFEE_LIST_TEST_ID}
      accessibilityLabel={COFFEES_HEADING}
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(coffee) => coffee.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text accessibilityRole="header">{COFFEES_HEADING}</Text>
          {coffees.data && coffees.data.length > 0 ? (
            <TextInput
              testID={COFFEE_SEARCH_TEST_ID}
              accessibilityLabel={SEARCH_COFFEES}
              placeholder={SEARCH_COFFEES}
              value={search}
              onChangeText={onSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={styles.search}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        coffees.isPending ? (
          <View accessibilityLabel={LOADING_COFFEES}>
            <ActivityIndicator />
          </View>
        ) : coffees.isError ? (
          <View style={styles.error}>
            <Text accessibilityRole="alert">
              {apiErrorMessage(coffees.error, ERROR_LOAD_COFFEES)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: retrying, busy: retrying }}
              disabled={retrying}
              onPress={() => void coffees.refetch()}
            >
              <Text>{retrying ? TRYING_AGAIN : TRY_AGAIN}</Text>
            </Pressable>
          </View>
        ) : (
          <Text>
            {coffees.data.length === 0 ? EMPTY_COFFEES : NO_MATCHING_COFFEES}
          </Text>
        )
      }
      renderItem={({ item }) => {
        const origin = originSummary(item)
        return (
          <Pressable
            accessibilityRole="button"
            testID={`${COFFEE_ROW_TEST_ID_PREFIX}${item.id}`}
            style={styles.row}
            onPress={() => onOpen(item)}
          >
            <Text style={styles.name}>{item.name}</Text>
            {item.roaster ? <Text>{item.roaster.name}</Text> : null}
            {origin ? <Text>{origin}</Text> : null}
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  content: { gap: 12, paddingHorizontal: 16, paddingBottom: 32 },
  header: { gap: 8 },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: { alignItems: 'center', gap: 8 },
  row: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  name: { fontWeight: '600' },
})
