import { describe, expect, it } from 'vitest'
import { decodeEspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import {
  ESPRESSO_SHOT_PAGE_SIZE,
  espressoShotCursor,
  espressoShotFixtureId,
  seedEspressoShotPage,
} from './espresso-shots'
import { makeRecentShot } from './factories'
import { createTestProviders } from './providers'
import { espressoShotPageInput } from '@/hooks/use-espresso-shot-pages'

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
      id: 'incoming',
    })
    seedEspressoShotPage(
      queryClient,
      trpc,
      items,
      ESPRESSO_SHOT_PAGE_SIZE,
      cursor,
    )
    expect(
      queryClient.getQueryData(
        trpc.espressoShot.getRecent.queryKey(
          espressoShotPageInput(cursor),
        ),
      ),
    ).toEqual({ items, total: ESPRESSO_SHOT_PAGE_SIZE, nextCursor: null })
  })
})
