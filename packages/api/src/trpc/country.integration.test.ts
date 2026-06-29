import { describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db } from '../db'
import { countries } from '../db/schema'
import { callerFor, seedUsers } from '../../test/trpc'

const USER_A = 'country-user-a'
const USER_B = 'country-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)

// Distinctive names so cleanup never touches real lookup data. The owned row
// cascades with USER_A; the global row (null userId) must be cleaned explicitly.
const GLOBAL_NAME = '__test_global_country__'
const OWNED_NAME = '__test_user_a_country__'

seedUsers([USER_A, USER_B], async () => {
  await db
    .delete(countries)
    .where(inArray(countries.name, [GLOBAL_NAME, OWNED_NAME]))
})

describe('country', () => {
  it('lists global rows plus the user’s own, scoped per user', async () => {
    await db
      .delete(countries)
      .where(inArray(countries.name, [GLOBAL_NAME, OWNED_NAME]))
    // A global country has a null userId (shared across all users).
    const [globalCountry] = await db
      .insert(countries)
      .values({ name: GLOBAL_NAME })
      .returning()

    const owned = await asA.country.create({ name: OWNED_NAME })
    expect(owned.userId).toBe(USER_A)

    const listA = await asA.country.list()
    expect(listA.some((c) => c.id === globalCountry.id)).toBe(true)
    expect(listA.some((c) => c.id === owned.id)).toBe(true)

    const listB = await asB.country.list()
    expect(listB.some((c) => c.id === globalCountry.id)).toBe(true)
    expect(listB.some((c) => c.id === owned.id)).toBe(false)
  })
})
