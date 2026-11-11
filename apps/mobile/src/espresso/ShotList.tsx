import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  EMPTY_SHOTS,
  ESPRESSO_HEADING,
  LOADING_MORE_SHOTS,
  LOADING_SHOTS,
  LOG_SHOT,
  LOG_SHOT_TEST_ID,
  SHOT_LIST_A11Y_LABEL,
  SHOT_LIST_TEST_ID,
  SHOT_ROW_TEST_ID_PREFIX,
} from './copy'
import { shotSummary } from './draft'
import type { ShotRow } from './types'

export function ShotList({
  shots,
  loading,
  loadingMore,
  failed,
  onLogShot,
  onEndReached,
}: {
  shots: Array<ShotRow> | null
  loading: boolean
  loadingMore: boolean
  failed: boolean
  onLogShot: () => void
  onEndReached: () => void
}) {
  const canLog = !loading && !failed && shots != null
  const rows = failed ? [] : (shots ?? [])

  return (
    <FlatList
      accessibilityLabel={SHOT_LIST_A11Y_LABEL}
      testID={SHOT_LIST_TEST_ID}
      style={styles.list}
      contentContainerStyle={styles.content}
      data={rows}
      extraData={`${loading}:${failed}:${loadingMore}`}
      keyExtractor={(shot) => shot.id}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text accessibilityRole="header">{ESPRESSO_HEADING}</Text>
          <Pressable
            accessibilityRole="button"
            testID={LOG_SHOT_TEST_ID}
            disabled={!canLog}
            onPress={onLogShot}
          >
            <Text>{LOG_SHOT}</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        loading && shots == null ? (
          <View accessibilityLabel={LOADING_SHOTS}>
            <ActivityIndicator />
          </View>
        ) : failed ? null : (
          <Text>{EMPTY_SHOTS}</Text>
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <View accessibilityLabel={LOADING_MORE_SHOTS}>
            <ActivityIndicator />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <View
          testID={`${SHOT_ROW_TEST_ID_PREFIX}${item.id}`}
          style={styles.row}
        >
          <Text>{item.coffeeName}</Text>
          <Text>{shotSummary(item)}</Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    width: '100%',
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
})
