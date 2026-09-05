import { describe, expect, it } from 'vitest'
import { combineDurationFields, splitDurationFields } from './duration'

// One 60-based pair serves both Cold Brew (hours + minutes, stored as minutes)
// and Pour Over (minutes + seconds, stored as seconds). The conversion is the
// thing worth pinning — not which method is speaking.

describe('splitDurationFields', () => {
  it('splits a stored Cold Brew steep across hours and minutes', () => {
    expect(splitDurationFields(1110)).toEqual({ major: '18', minor: '30' })
  })

  it('splits a stored Pour Over brew time across minutes and seconds', () => {
    expect(splitDurationFields(165)).toEqual({ major: '2', minor: '45' })
  })

  it('shows both fields empty when there is no time', () => {
    expect(splitDurationFields(null)).toEqual({ major: '', minor: '' })
  })
})

describe('combineDurationFields', () => {
  it('reads Cold Brew hours as whole minutes', () => {
    expect(combineDurationFields('18', '')).toBe(1080)
  })

  it('reads Pour Over minutes as whole seconds', () => {
    expect(combineDurationFields('2', '')).toBe(120)
  })

  it('adds the minor field to the major already entered', () => {
    expect(combineDurationFields('2', '45')).toBe(165)
  })

  it('treats an empty major field as zero rather than discarding the minor', () => {
    expect(combineDurationFields('', '45')).toBe(45)
  })

  it('keeps overflow in the minor field as a whole stored value', () => {
    expect(combineDurationFields('', '165')).toBe(165)
  })

  it('reads a cleared major field as zero while the minor still holds a value', () => {
    // After a whole-unit store (1080 or 120) the minor box renders as '0'.
    expect(combineDurationFields('', '0')).toBe(0)
  })

  it('is null when both fields are empty', () => {
    expect(combineDurationFields('', '')).toBeNull()
  })
})
