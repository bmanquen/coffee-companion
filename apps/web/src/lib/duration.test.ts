import { describe, expect, it } from 'vitest'
import { fromSeconds, toSeconds } from './duration'

// Seconds in, hours/minutes/seconds out; hours/minutes/seconds in, seconds
// out. Display collapses empty higher units at the formatter; these tests
// pin the parts themselves.

describe('fromSeconds', () => {
  it('splits 165 seconds into 0 hours, 2 minutes, 45 seconds', () => {
    expect(fromSeconds(165)).toEqual({
      hours: '0',
      minutes: '2',
      seconds: '45',
    })
  })

  it('splits a whole-minute Pour Over into minutes and zero seconds', () => {
    expect(fromSeconds(240)).toEqual({
      hours: '0',
      minutes: '4',
      seconds: '0',
    })
  })

  it('splits an 18 hour steep (as seconds) into hours and zero minutes', () => {
    expect(fromSeconds(64_800)).toEqual({
      hours: '18',
      minutes: '0',
      seconds: '0',
    })
  })

  it('splits 18 hours 30 minutes (as seconds) across hours and minutes', () => {
    expect(fromSeconds(66_600)).toEqual({
      hours: '18',
      minutes: '30',
      seconds: '0',
    })
  })

  it('shows every part empty when there is no time', () => {
    expect(fromSeconds(null)).toEqual({
      hours: '',
      minutes: '',
      seconds: '',
    })
  })
})

describe('toSeconds', () => {
  it('saves 2 minutes 45 seconds as 165', () => {
    expect(toSeconds('', '2', '45')).toBe(165)
  })

  it('saves a lone minutes box as that many minutes of seconds', () => {
    expect(toSeconds('', '2', '')).toBe(120)
  })

  it('saves 18 hours as 64800 seconds', () => {
    expect(toSeconds('18', '', '')).toBe(64_800)
  })

  it('saves 18 hours 30 minutes as 66600 seconds', () => {
    expect(toSeconds('18', '30', '')).toBe(66_600)
  })

  it('treats an empty hours field as zero rather than discarding minutes', () => {
    expect(toSeconds('', '45', '')).toBe(2700)
  })

  it('keeps overflow in the seconds box as a whole stored value', () => {
    expect(toSeconds('', '', '165')).toBe(165)
  })

  it('reads a cleared hours field as zero while minutes still holds a value', () => {
    expect(toSeconds('', '0', '0')).toBe(0)
  })

  it('saves no time when every box is empty', () => {
    expect(toSeconds('', '', '')).toBeNull()
  })
})
