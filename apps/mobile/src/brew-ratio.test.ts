import { formatBrewRatio } from './brew-ratio'

describe('formatBrewRatio', () => {
  it('is yield divided by dose, as 1:x', () => {
    expect(formatBrewRatio('18', '36')).toBe('1:2')
    expect(formatBrewRatio('18', '45')).toBe('1:2.5')
    expect(formatBrewRatio('18.0', '36.0')).toBe('1:2')
  })

  it('is null when a weight is missing or dose is zero', () => {
    expect(formatBrewRatio(null, '36')).toBeNull()
    expect(formatBrewRatio('18', '')).toBeNull()
    expect(formatBrewRatio('0', '36')).toBeNull()
  })

  it('does not round a tiny positive output to 1:0', () => {
    expect(formatBrewRatio('18', '0.05')).toBe('1:0.003')
  })
})
