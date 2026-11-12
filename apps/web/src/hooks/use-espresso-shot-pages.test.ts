import { describe, expect, it } from 'vitest'
import {
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
  espressoShotPageInput,
} from './use-espresso-shot-pages'

describe('espressoShotPageInput', () => {
  it('keeps q within the API limit', () => {
    const q = 'x'.repeat(ESPRESSO_SHOT_Q_MAX + 25)
    expect(espressoShotPageInput(undefined, { q }).q).toHaveLength(
      ESPRESSO_SHOT_Q_MAX,
    )
  })

  it('omits blank q and uses the shared page size', () => {
    expect(espressoShotPageInput()).toEqual({ limit: ESPRESSO_SHOT_PAGE_SIZE })
    expect(espressoShotPageInput(undefined, { q: '   ' })).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
    })
  })

  it('passes an opaque cursor through as-is', () => {
    expect(espressoShotPageInput('next-page-token')).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
      cursor: 'next-page-token',
    })
  })
})
