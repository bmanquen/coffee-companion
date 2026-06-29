import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../db/zod'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'espresso-user-a'
const USER_B = 'espresso-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

let espressoDeviceId: string
let pourOverDeviceId: string
let grinderId: string
let coffeeAId: string

// Device types are globally unique; reuse existing rows or create-and-track new
// ones so cleanup never deletes seeded data on a shared database.
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

seedUsers([USER_A, USER_B], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

beforeAll(async () => {
  const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const pourOverTypeId = await findOrCreateDeviceType('Pour Over')

  const espressoDevice = await asA.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId: espressoTypeId,
  })
  espressoDeviceId = espressoDevice.id

  const pourOverDevice = await asA.brewingDevice.create({
    name: uniq('V60'),
    brand: 'Hario',
    typeId: pourOverTypeId,
  })
  pourOverDeviceId = pourOverDevice.id

  const grinder = await asA.grinder.create({ name: uniq('Niche'), brand: 'Niche' })
  grinderId = grinder.id

  const coffee = await asA.coffee.create({ name: uniq('Ethiopia Guji') })
  coffeeAId = coffee.id
})

describe('espressoShot.create', () => {
  it('creates a shot on an espresso device', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
    })
    expect(shot.userId).toBe(USER_A)
    expect(shot.dose).toBe('18')
    expect(shot.yield).toBe('36')
  })

  it('rejects a non-espresso brewing device', async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: pourOverDeviceId,
        dose: '18',
        yield: '36',
      }),
    ).rejects.toThrow(/Espresso/)
  })

  it('rejects an unknown brewing device', async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: UNKNOWN_UUID,
        dose: '18',
        yield: '36',
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('espressoShot.getAll / getRecent', () => {
  it('returns the user shots with relations', async () => {
    const shots = await asA.espressoShot.getAll()
    expect(shots.length).toBeGreaterThanOrEqual(1)
    expect(shots.every((s) => s.userId === USER_A)).toBe(true)
    expect(shots[0].coffee).toBeTruthy()
    expect(shots[0].brewingDevice.type).toBeTruthy()
  })

  it('paginates with getRecent', async () => {
    for (let i = 0; i < 3; i++) {
      await asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
      })
    }
    const page1 = await asA.espressoShot.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await asA.espressoShot.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('espressoShot.getDialedIn', () => {
  it('returns only each coffee’s dialed-in reference shot, with relations', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Dialed Coffee') })
    const dialedShot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
    })
    // A second, non-dialed shot for the same coffee must be excluded.
    const otherShot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '20',
      yield: '40',
    })
    await asA.coffee.setDialedIn({ coffeeId: coffee.id, shotId: dialedShot.id })

    const dialedIn = await asA.espressoShot.getDialedIn()

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
    const dialedIn = await asA.espressoShot.getDialedIn()
    const times = dialedIn.map((s) => new Date(s.createdAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('caps the result to the requested limit', async () => {
    // Ensure at least two dialed-in coffees exist for this user.
    for (let i = 0; i < 2; i++) {
      const c = await asA.coffee.create({ name: uniq('Capped Coffee') })
      const s = await asA.espressoShot.create({
        coffeeId: c.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
      })
      await asA.coffee.setDialedIn({ coffeeId: c.id, shotId: s.id })
    }
    const all = await asA.espressoShot.getDialedIn()
    expect(all.length).toBeGreaterThanOrEqual(2)
    const limited = await asA.espressoShot.getDialedIn({ limit: 1 })
    expect(limited.length).toBe(1)
  })

  it('does not return another user’s dialed-in shots', async () => {
    const dialedIn = await asB.espressoShot.getDialedIn()
    expect(dialedIn.every((s) => s.userId === USER_B)).toBe(true)
  })
})
