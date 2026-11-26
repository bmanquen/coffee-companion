import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { countries } from '../db/schema'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'region-user-a'
const USER_B = 'region-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

let sharedCountryId: string | undefined

// The user cascade removes the regions; the shared country has no owner.
seedUsers([USER_A, USER_B], async () => {
  if (sharedCountryId) {
    await db.delete(countries).where(eq(countries.id, sharedCountryId))
  }
})

describe('region', () => {
  it('creates then lists by country', async () => {
    const country = await asA.country.create({ name: uniq('Country') })
    const region = await asA.region.create({
      name: uniq('Region'),
      countryId: country.id,
    })
    const listed = await asA.region.getAll(country.id)
    expect(listed.some((r) => r.id === region.id)).toBe(true)
  })
})

describe('region.create country visibility', () => {
  it('accepts a region with no country', async () => {
    const region = await asA.region.create({ name: uniq('No country') })
    expect(region.countryId).toBeNull()
  })

  it('refuses another user’s private country', async () => {
    const theirs = await asB.country.create({
      name: uniqFor(USER_B)('Private country'),
    })
    const name = uniq('In their country')
    await expect(
      asA.region.create({ name, countryId: theirs.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Country not found' })
    const written = await db.query.regions.findFirst({ where: { name } })
    expect(written).toBeUndefined()
  })

  it('accepts a shared country', async () => {
    const [shared] = await db
      .insert(countries)
      .values({ name: uniq('Shared country') })
      .returning()
    sharedCountryId = shared.id
    const region = await asA.region.create({
      name: uniq('In shared country'),
      countryId: shared.id,
    })
    expect(region.userId).toBe(USER_A)
  })
})
