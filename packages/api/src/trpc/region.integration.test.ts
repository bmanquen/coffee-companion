import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'region-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('region', () => {
  it('creates then lists by country', async () => {
    const country = await asA.country.create({ name: uniq('Country') })
    const region = await asA.region.create({
      name: uniq('Region'),
      countryId: country.id,
    })
    const regions = await asA.region.getAll(country.id)
    expect(regions.some((r) => r.id === region.id)).toBe(true)
  })
})
