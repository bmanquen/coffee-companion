import { describe, expect, it } from 'vitest'
import { lookupNameClashMessage } from './lookup-name'

const drizzleShaped = (code: string, detail?: string) => ({
  cause: { code, ...(detail === undefined ? {} : { detail }) },
})

describe('lookupNameClashMessage', () => {
  it('names the saved casing when a user write matches a shared default', () => {
    expect(lookupNameClashMessage(drizzleShaped('LKSHR', 'Inverted'))).toBe(
      'Inverted is already in the list. Pick it there, or give yours a different name.',
    )
  })

  it('names the saved casing when a user write matches their own entry', () => {
    expect(lookupNameClashMessage(drizzleShaped('LKOWN', 'Kaffa Lab'))).toBe(
      'You already have one called Kaffa Lab. Pick it there, or give this one a different name.',
    )
  })

  it('is silent for any other error, including a clash with no saved name', () => {
    expect(lookupNameClashMessage(drizzleShaped('23505', 'Onyx'))).toBe(null)
    expect(lookupNameClashMessage(drizzleShaped('LKSHR'))).toBe(null)
    expect(lookupNameClashMessage(new Error('boom'))).toBe(null)
  })
})
