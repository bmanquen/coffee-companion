import { describe, expect, it } from 'vitest'
import { decodeEspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import { espressoShotPageInput } from '@/hooks/use-espresso-shot-pages'
import {
  ESPRESSO_SHOT_PAGE_SIZE,
  espressoShotCursor,
  espressoShotFixtureId,
  seedEspressoShotPage,
} from './espresso-shots'
import { makeRecentShot } from './factories'
import { createTestProviders } from './providers'

describe('seedEspressoShotPage', () => {
  it('encodes a cursor the API decoder accepts', () => {
    const shot = makeRecentShot({ id: espressoShotFixtureId(19) })
    expect(decodeEspressoShotCursor(espressoShotCursor(shot))).toEqual({
      createdAt: '2026-06-01 08:00:00.000000',
      id: shot.id,
    })
  })

  it('does not emit a cursor for a full final page reached via an incoming cursor', () => {
    const { queryClient, trpc } = createTestProviders()
    const items = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
      makeRecentShot({ id: espressoShotFixtureId(index) }),
    )
    const cursor = espressoShotCursor({
      createdAt: items[0].createdAt,
      // A real API cursor carries a shot's UUID.
      id: espressoShotFixtureId(ESPRESSO_SHOT_PAGE_SIZE),
    })
    seedEspressoShotPage(
      queryClient,
      trpc,
      items,
      // Includes the matches before the incoming cursor.
      ESPRESSO_SHOT_PAGE_SIZE * 2,
      cursor,
    )
    expect(
      queryClient.getQueryData(
        trpc.espressoShot.getRecent.infiniteQueryKey(espressoShotPageInput()),
      ),
    ).toEqual({
      pages: [{ items, total: ESPRESSO_SHOT_PAGE_SIZE * 2, nextCursor: null }],
      pageParams: [cursor],
    })
  })

  it('drops cached pages a replaced page no longer leads to', () => {
    const { queryClient, trpc } = createTestProviders()
    // In the API's order: newest first, and ids descending within one
    // timestamp, so the continuation is a shot after the cursor.
    const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
      makeRecentShot({
        id: espressoShotFixtureId(ESPRESSO_SHOT_PAGE_SIZE - index),
      }),
    )
    const extra = makeRecentShot({
      id: espressoShotFixtureId(0),
      createdAt: new Date(first[0].createdAt.getTime() - 60_000),
    })
    const cursor = espressoShotCursor(first[first.length - 1])
    const key = trpc.espressoShot.getRecent.infiniteQueryKey(
      espressoShotPageInput(),
    )
    const seedBoth = () => {
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(queryClient, trpc, [extra], first.length + 1, cursor)
    }

    seedBoth()
    seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
    expect(queryClient.getQueryData(key)).toMatchObject({
      pageParams: [undefined, cursor],
    })

    seedEspressoShotPage(
      queryClient,
      trpc,
      first,
      first.length,
      undefined,
      {},
      null,
    )
    expect(queryClient.getQueryData(key)).toEqual({
      pages: [{ items: first, total: first.length, nextCursor: null }],
      pageParams: [undefined],
    })
  })
})
