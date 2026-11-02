import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  EMPTY_SHOTS,
  ESPRESSO_HEADING,
  LOADING_SHOTS,
  LOG_SHOT,
  SHOT_LIST_A11Y_LABEL,
  SHOT_LIST_TEST_ID,
  SHOT_ROW_TEST_ID_PREFIX,
} from './copy'
import { shotSummary } from './draft'
import type { ShotRow } from './types'

export function ShotList({
  shots,
  loading,
  onLogShot,
}: {
  shots: Array<ShotRow> | null
  loading: boolean
  onLogShot: () => void
}) {
  return (
    <View
      accessibilityLabel={SHOT_LIST_A11Y_LABEL}
      testID={SHOT_LIST_TEST_ID}
      style={styles.list}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header">{ESPRESSO_HEADING}</Text>
        <Pressable accessibilityRole="button" onPress={onLogShot}>
          <Text>{LOG_SHOT}</Text>
        </Pressable>
      </View>
      {loading && shots == null ? (
        <View accessibilityLabel={LOADING_SHOTS}>
          <ActivityIndicator />
        </View>
      ) : shots == null || shots.length === 0 ? (
        <Text>{EMPTY_SHOTS}</Text>
      ) : (
        shots.map((shot) => (
          <View
            key={shot.id}
            testID={`${SHOT_ROW_TEST_ID_PREFIX}${shot.id}`}
            style={styles.row}
          >
            <Text>{shot.coffeeName}</Text>
            <Text>{shotSummary(shot)}</Text>
          </View>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: 12,
    paddingHorizontal: 16,
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
