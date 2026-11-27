import { describe, expect, it } from 'vitest'
import { coffeeOptionLabel } from './coffee-option-label'

describe('coffeeOptionLabel', () => {
  it('is the coffee name when there is no roaster', () => {
    expect(coffeeOptionLabel({ name: 'Ethiopia Guji' })).toBe('Ethiopia Guji')
    expect(
      coffeeOptionLabel({ name: 'Ethiopia Guji', roaster: null }),
    ).toBe('Ethiopia Guji')
  })

  it('appends the roaster so same-named coffees stay distinct', () => {
    expect(
      coffeeOptionLabel({
        name: 'Ethiopia Guji',
        roaster: { name: 'Sey' },
      }),
    ).toBe('Ethiopia Guji · Sey')
    expect(
      coffeeOptionLabel({
        name: 'Ethiopia Guji',
        roaster: { name: 'Heart' },
      }),
    ).toBe('Ethiopia Guji · Heart')
  })
})
