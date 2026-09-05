import { describe, expect, it } from 'vitest'
import { fromStoredDuration, toStoredDuration } from './duration'

// One bidirectional helper: a stored whole-unit value ↔ two 60-based boxes.
// Pour Over stores seconds (minutes + seconds). Cold Brew stores minutes
// (hours + minutes) — same math, different base unit, never converted through
// seconds.

describe('fromStoredDuration', () => {
  it('turns stored seconds into minutes and seconds boxes', () => {
    expect(fromStoredDuration(165)).toEqual({ major: '2', minor: '45' })
  })

  it('turns stored Cold Brew minutes into hours and minutes boxes', () => {
    expect(fromStoredDuration(1110)).toEqual({ major: '18', minor: '30' })
  })

  it('shows both boxes empty when the database has no time', () => {
    expect(fromStoredDuration(null)).toEqual({ major: '', minor: '' })
  })
})

describe('toStoredDuration', () => {
  it('saves minutes and seconds as whole seconds', () => {
    expect(toStoredDuration('2', '45')).toBe(165)
  })

  it('saves a lone minutes box as that many minutes of seconds', () => {
    expect(toStoredDuration('2', '')).toBe(120)
  })

  it('saves Cold Brew hours as whole minutes, not seconds', () => {
    expect(toStoredDuration('18', '')).toBe(1080)
  })

  it('treats an empty major box as zero rather than discarding the minor', () => {
    expect(toStoredDuration('', '45')).toBe(45)
  })

  it('keeps overflow in the minor box as a whole stored value', () => {
    expect(toStoredDuration('', '165')).toBe(165)
  })

  it('reads a cleared major box as zero while the minor still holds a value', () => {
    // After a whole-unit store the minor box renders as '0', not empty.
    expect(toStoredDuration('', '0')).toBe(0)
  })

  it('saves no time when both boxes are empty', () => {
    expect(toStoredDuration('', '')).toBeNull()
  })
})
