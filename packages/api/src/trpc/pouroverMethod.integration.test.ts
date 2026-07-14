import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { pouroverMethods } from '../db/schema'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'pourover-method-user-a'
const USER_B = 'pourover-method-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

// A system-default method (null userId) is shared across users. Names are
// globally unique, so create-and-track it for cleanup instead of assuming a
// seeded row exists on the shared test database.
let systemMethodId: string
const createdSystemIds: Array<string> = []

seedUsers([USER_A, USER_B], async () => {
  if (createdSystemIds.length) {
    await db
      .delete(pouroverMethods)
      .where(inArray(pouroverMethods.id, createdSystemIds))
  }
})

beforeAll(async () => {
  const name = uniq('Standard')
  const existing = await db
    .select()
    .from(pouroverMethods)
    .where(eq(pouroverMethods.name, name))
  if (existing[0]) {
    systemMethodId = existing[0].id
  } else {
    const [row] = await db
      .insert(pouroverMethods)
      .values({ name })
      .returning()
    systemMethodId = row.id
    createdSystemIds.push(row.id)
  }
})

describe('pouroverMethod.create', () => {
  it('creates a method scoped to the user', async () => {
    const created = await asA.pouroverMethod.create({ name: uniq('Pulse') })
    expect(created.userId).toBe(USER_A)
  })
})

describe('pouroverMethod.list', () => {
  it('returns the user’s own methods and shared system defaults', async () => {
    const created = await asA.pouroverMethod.create({
      name: uniq('Continuous'),
    })
    const list = await asA.pouroverMethod.list()

    // Own method is listed.
    expect(list.some((m) => m.id === created.id)).toBe(true)
    // The system-default (null userId) method is listed too.
    expect(list.some((m) => m.id === systemMethodId)).toBe(true)
    // Ordered by name ascending.
    const names = list.map((m) => m.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('does not return another user’s methods', async () => {
    const mine = await asA.pouroverMethod.create({ name: uniq('Private') })
    const list = await asB.pouroverMethod.list()
    expect(list.some((m) => m.id === mine.id)).toBe(false)
    // But B still sees the shared system default.
    expect(list.some((m) => m.id === systemMethodId)).toBe(true)
  })
})
