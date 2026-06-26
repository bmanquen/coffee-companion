import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { ESPRESSO_DEVICE_TYPE } from '../db/zod'

// The effective user id is mutable so tests can switch identities and verify
// per-user data scoping. authedProcedure reads it via the mocked getSession;
// a null id simulates an unauthenticated request.
const authState = vi.hoisted(() => ({ userId: 'integration-user-a' as string | null }))

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        authState.userId
          ? {
              user: { id: authState.userId },
              session: { id: 'integration-test-session' },
            }
          : null,
      ),
    },
  },
}))

const { db } = await import('../db')
const { brewingDeviceTypes, brewingDevices, coffees, countries, grinders, user } =
  await import('../db/schema')
const { createCallerFactory } = await import('./init')
const { trpcRouter } = await import('./router')

const USER_A = 'integration-user-a'
const USER_B = 'integration-user-b'
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

const caller = createCallerFactory(trpcRouter)({ headers: new Headers() })
const asUser = (id: string) => {
  authState.userId = id
}

// Device types are globally unique; reuse an existing one (e.g. a seeded
// "Espresso") and only create-and-track ones we add, so cleanup never deletes
// real data when tests run against a shared database.
const createdTypeIds: Array<string> = []
async function findOrCreateDeviceType(name: string): Promise<string> {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, name))
  if (existing[0]) return existing[0].id
  const [row] = await db.insert(brewingDeviceTypes).values({ name }).returning()
  createdTypeIds.push(row.id)
  return row.id
}

let espressoDeviceId: string
let pourOverDeviceId: string
let grinderAId: string
let coffeeAId: string

beforeAll(async () => {
  await db.delete(user).where(inArray(user.id, [USER_A, USER_B]))
  await db.insert(user).values([
    { id: USER_A, name: 'User A', email: `${USER_A}@example.com` },
    { id: USER_B, name: 'User B', email: `${USER_B}@example.com` },
  ])

  const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const pourOverTypeId = await findOrCreateDeviceType('Pour Over')

  const [espressoDevice] = await db
    .insert(brewingDevices)
    .values({
      userId: USER_A,
      name: 'Linea Mini',
      brand: 'La Marzocco',
      typeId: espressoTypeId,
    })
    .returning()
  espressoDeviceId = espressoDevice.id

  const [pourOverDevice] = await db
    .insert(brewingDevices)
    .values({
      userId: USER_A,
      name: 'V60',
      brand: 'Hario',
      typeId: pourOverTypeId,
    })
    .returning()
  pourOverDeviceId = pourOverDevice.id

  const [grinder] = await db
    .insert(grinders)
    .values({ userId: USER_A, name: 'Niche Zero', brand: 'Niche' })
    .returning()
  grinderAId = grinder.id

  const [coffee] = await db
    .insert(coffees)
    .values({ userId: USER_A, name: 'Ethiopia Guji' })
    .returning()
  coffeeAId = coffee.id
})

afterAll(async () => {
  // Removing the users cascades all their scoped rows; created device types are
  // global, so drop the ones we added afterward.
  await db.delete(user).where(inArray(user.id, [USER_A, USER_B]))
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
  await db.$client.end()
})

describe('espressoShot.create', () => {
  it('creates a shot on an espresso device', async () => {
    asUser(USER_A)
    const shot = await caller.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId: grinderAId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
    })
    expect(shot.userId).toBe(USER_A)
    expect(shot.dose).toBe('18')
    expect(shot.yield).toBe('36')
  })

  it('rejects a non-espresso brewing device', async () => {
    asUser(USER_A)
    await expect(
      caller.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId: grinderAId,
        brewingDeviceId: pourOverDeviceId,
        dose: '18',
        yield: '36',
      }),
    ).rejects.toThrow(/Espresso/)
  })

  it('rejects an unknown brewing device', async () => {
    asUser(USER_A)
    await expect(
      caller.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId: grinderAId,
        brewingDeviceId: UNKNOWN_UUID,
        dose: '18',
        yield: '36',
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('espressoShot.getAll / getRecent', () => {
  it('returns the user shots with relations', async () => {
    asUser(USER_A)
    const shots = await caller.espressoShot.getAll()
    expect(shots.length).toBeGreaterThanOrEqual(1)
    expect(shots.every((s) => s.userId === USER_A)).toBe(true)
    expect(shots[0].coffee).toBeTruthy()
    expect(shots[0].brewingDevice.type).toBeTruthy()
  })

  it('paginates with getRecent', async () => {
    asUser(USER_A)
    for (let i = 0; i < 3; i++) {
      await caller.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId: grinderAId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
      })
    }
    const page1 = await caller.espressoShot.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await caller.espressoShot.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('espressoShot.getDialedIn', () => {
  it('returns only each coffee’s dialed-in reference shot, with relations', async () => {
    asUser(USER_A)
    const coffee = await caller.coffee.create({ name: uniq('Dialed Coffee') })
    const dialedShot = await caller.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinderAId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
    })
    // A second, non-dialed shot for the same coffee must be excluded.
    const otherShot = await caller.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinderAId,
      brewingDeviceId: espressoDeviceId,
      dose: '20',
      yield: '40',
    })
    await caller.coffee.setDialedIn({ coffeeId: coffee.id, shotId: dialedShot.id })

    const dialedIn = await caller.espressoShot.getDialedIn()

    const entry = dialedIn.find((s) => s.id === dialedShot.id)
    expect(entry).toBeTruthy()
    expect(entry!.coffee.name).toBe(coffee.name)
    expect(entry!.grinder.name).toBeTruthy()
    expect(entry!.brewingDevice.type).toBeTruthy()

    expect(dialedIn.some((s) => s.id === otherShot.id)).toBe(false)
    // Every returned shot is the dialed-in reference for its own coffee.
    expect(dialedIn.every((s) => s.coffee.dialedInShotId === s.id)).toBe(true)
  })

  it('returns shots ordered most recent first', async () => {
    asUser(USER_A)
    const dialedIn = await caller.espressoShot.getDialedIn()
    const times = dialedIn.map((s) => new Date(s.createdAt).getTime())
    const descending = [...times].sort((a, b) => b - a)
    expect(times).toEqual(descending)
  })

  it('caps the result to the requested limit', async () => {
    asUser(USER_A)
    // Ensure at least two dialed-in coffees exist for this user.
    for (let i = 0; i < 2; i++) {
      const c = await caller.coffee.create({ name: uniq('Capped Coffee') })
      const s = await caller.espressoShot.create({
        coffeeId: c.id,
        grinderId: grinderAId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
      })
      await caller.coffee.setDialedIn({ coffeeId: c.id, shotId: s.id })
    }
    const all = await caller.espressoShot.getDialedIn()
    expect(all.length).toBeGreaterThanOrEqual(2)
    const limited = await caller.espressoShot.getDialedIn({ limit: 1 })
    expect(limited.length).toBe(1)
  })

  it('does not return another user’s dialed-in shots', async () => {
    asUser(USER_B)
    const dialedIn = await caller.espressoShot.getDialedIn()
    expect(dialedIn.every((s) => s.userId === USER_B)).toBe(true)
  })
})

describe('coffee.setDialedIn', () => {
  it('sets and clears the dialed-in shot', async () => {
    asUser(USER_A)
    const shot = await caller.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId: grinderAId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
    })
    const coffee = await caller.coffee.create({ name: 'Dial-in Test Coffee' })

    const dialedIn = await caller.coffee.setDialedIn({
      coffeeId: coffee.id,
      shotId: shot.id,
    })
    expect(dialedIn.dialedInShotId).toBe(shot.id)

    const cleared = await caller.coffee.setDialedIn({
      coffeeId: coffee.id,
      shotId: null,
    })
    expect(cleared.dialedInShotId).toBeNull()
  })

  it('will not dial in a coffee owned by another user', async () => {
    // coffeeAId belongs to USER_A; as USER_B the scoped update matches nothing.
    asUser(USER_B)
    const result = await caller.coffee.setDialedIn({
      coffeeId: coffeeAId,
      shotId: null,
    })
    expect(result).toBeUndefined()
  })
})

describe('grinder (representative lookup CRUD)', () => {
  it('creates and lists a grinder, scoped to the user', async () => {
    asUser(USER_A)
    const grinder = await caller.grinder.create({
      name: 'Test Grinder',
      brand: 'Test Brand',
    })
    expect(grinder.userId).toBe(USER_A)

    const list = await caller.grinder.list()
    expect(list.some((g) => g.id === grinder.id)).toBe(true)
  })
})

describe('user scoping', () => {
  it('never returns another user’s data', async () => {
    asUser(USER_B)

    const coffeesForB = await caller.coffee.getAll()
    expect(coffeesForB.every((c) => c.userId === USER_B)).toBe(true)
    expect(coffeesForB.some((c) => c.id === coffeeAId)).toBe(false)

    const grindersForB = await caller.grinder.list()
    expect(grindersForB.some((g) => g.id === grinderAId)).toBe(false)

    const shotsForB = await caller.espressoShot.getAll()
    expect(shotsForB.every((s) => s.userId === USER_B)).toBe(true)
  })
})

describe('coffee.getRecent', () => {
  it('paginates the user’s coffees', async () => {
    asUser(USER_A)
    for (let i = 0; i < 3; i++) {
      await caller.coffee.create({ name: `Recent Coffee ${i}` })
    }
    const page1 = await caller.coffee.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await caller.coffee.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('country (shared lookup: global + user-scoped)', () => {
  // Distinctive names so cleanup never touches real lookup data.
  const GLOBAL_NAME = '__test_global_country__'
  const OWNED_NAME = '__test_user_a_country__'

  it('lists global rows plus the user’s own, scoped per user', async () => {
    await db
      .delete(countries)
      .where(inArray(countries.name, [GLOBAL_NAME, OWNED_NAME]))
    // A global country has a null userId (shared across all users).
    const [globalCountry] = await db
      .insert(countries)
      .values({ name: GLOBAL_NAME })
      .returning()

    asUser(USER_A)
    const owned = await caller.country.create({ name: OWNED_NAME })
    expect(owned.userId).toBe(USER_A)

    const listA = await caller.country.list()
    expect(listA.some((c) => c.id === globalCountry.id)).toBe(true)
    expect(listA.some((c) => c.id === owned.id)).toBe(true)

    asUser(USER_B)
    const listB = await caller.country.list()
    expect(listB.some((c) => c.id === globalCountry.id)).toBe(true)
    expect(listB.some((c) => c.id === owned.id)).toBe(false)

    await db
      .delete(countries)
      .where(inArray(countries.id, [globalCountry.id, owned.id]))
  })
})

describe('authedProcedure', () => {
  it('rejects unauthenticated requests', async () => {
    authState.userId = null
    await expect(caller.coffee.getAll()).rejects.toThrow(/UNAUTHORIZED/)
    asUser(USER_A)
  })
})

// Unique names avoid the global unique-name constraint across runs; rows are
// scoped to USER_A so they cascade-delete in afterAll.
const uniq = (label: string) => `${label} ${USER_A} ${Math.random()}`

describe('roaster', () => {
  it('creates then lists', async () => {
    asUser(USER_A)
    const created = await caller.roaster.create({ name: uniq('Roaster') })
    expect(created.userId).toBe(USER_A)
    const list = await caller.roaster.list()
    expect(list.some((r) => r.id === created.id)).toBe(true)
  })
})

describe('roastLevel', () => {
  it('creates then lists', async () => {
    asUser(USER_A)
    const created = await caller.roastLevel.create({ name: uniq('Roast') })
    const list = await caller.roastLevel.list()
    expect(list.some((r) => r.id === created.id)).toBe(true)
  })
})

describe('coffeeProcess', () => {
  it('creates then getAll', async () => {
    asUser(USER_A)
    const created = await caller.coffeeProcess.create({ name: uniq('Process') })
    const all = await caller.coffeeProcess.getAll()
    expect(all.some((p) => p.id === created.id)).toBe(true)
  })
})

describe('brewingDeviceType', () => {
  it('creates then lists', async () => {
    asUser(USER_A)
    const created = await caller.brewingDeviceType.create({ name: uniq('Type') })
    const list = await caller.brewingDeviceType.list()
    expect(list.some((t) => t.id === created.id)).toBe(true)
  })
})

describe('brewingDevice', () => {
  it('creates then lists', async () => {
    asUser(USER_A)
    const typeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
    const created = await caller.brewingDevice.create({
      name: uniq('Device'),
      brand: 'Test Brand',
      typeId,
    })
    expect(created.userId).toBe(USER_A)
    const list = await caller.brewingDevice.list()
    expect(list.some((d) => d.id === created.id)).toBe(true)
  })
})

describe('region', () => {
  it('creates then lists by country', async () => {
    asUser(USER_A)
    const country = await caller.country.create({ name: uniq('Country') })
    const region = await caller.region.create({
      name: uniq('Region'),
      countryId: country.id,
    })
    const regions = await caller.region.getAll(country.id)
    expect(regions.some((r) => r.id === region.id)).toBe(true)
  })
})
