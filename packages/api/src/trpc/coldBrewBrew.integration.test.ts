import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'coldbrew-user-a'
const USER_B = 'coldbrew-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

let coldBrewDeviceId: string
let espressoDeviceId: string
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
  const coldBrewTypeId = await findOrCreateDeviceType(COLD_BREW_DEVICE_TYPE)
  const espressoTypeId = await findOrCreateDeviceType('Espresso')

  const coldBrewDevice = await asA.brewingDevice.create({
    name: uniq('Toddy'),
    brand: 'Toddy',
    typeId: coldBrewTypeId,
  })
  coldBrewDeviceId = coldBrewDevice.id

  const espressoDevice = await asA.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId: espressoTypeId,
  })
  espressoDeviceId = espressoDevice.id

  const grinder = await asA.grinder.create({ name: uniq('Ode'), brand: 'Fellow' })
  grinderId = grinder.id

  const coffee = await asA.coffee.create({ name: uniq('Ethiopia Guji') })
  coffeeAId = coffee.id
})

const baseBrew = () => ({
  coffeeId: coffeeAId,
  grinderId,
  brewingDeviceId: coldBrewDeviceId,
  dose: '50',
  water: '500',
  // 18 hours, stored as whole minutes (not seconds like the hot methods).
  steepTime: 1080,
  brewEnvironment: 'Fridge' as const,
})

describe('coldBrewBrew.create', () => {
  it('creates a brew on a cold brew device', async () => {
    const brew = await asA.coldBrewBrew.create(baseBrew())
    expect(brew.userId).toBe(USER_A)
    expect(brew.dose).toBe('50')
    expect(brew.water).toBe('500')
    expect(brew.steepTime).toBe(1080)
    expect(brew.brewEnvironment).toBe('Fridge')
  })

  it('creates a brew without a brew environment', async () => {
    const brew = await asA.coldBrewBrew.create({
      ...baseBrew(),
      brewEnvironment: null,
    })
    expect(brew.brewEnvironment).toBeNull()
  })

  it('rejects a non-cold brew brewing device', async () => {
    await expect(
      asA.coldBrewBrew.create({
        ...baseBrew(),
        brewingDeviceId: espressoDeviceId,
      }),
    ).rejects.toThrow(/Cold Brew/)
  })

  it('rejects an unknown brewing device', async () => {
    await expect(
      asA.coldBrewBrew.create({
        ...baseBrew(),
        brewingDeviceId: UNKNOWN_UUID,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects another user’s brewing device', async () => {
    const otherDevice = await asB.brewingDevice.create({
      name: `Toddy ${USER_B} ${Math.random()}`,
      brand: 'Toddy',
      typeId: (
        await db
          .select()
          .from(brewingDeviceTypes)
          .where(eq(brewingDeviceTypes.name, COLD_BREW_DEVICE_TYPE))
      )[0].id,
    })
    await expect(
      asA.coldBrewBrew.create({
        ...baseBrew(),
        brewingDeviceId: otherDevice.id,
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('coldBrewBrew.getById', () => {
  it('returns the user’s brew', async () => {
    const created = await asA.coldBrewBrew.create(baseBrew())
    const brew = await asA.coldBrewBrew.getById(created.id)
    expect(brew.id).toBe(created.id)
    expect(brew.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.coldBrewBrew.getById(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('does not return another user’s brew', async () => {
    const created = await asA.coldBrewBrew.create(baseBrew())
    await expect(asB.coldBrewBrew.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('coldBrewBrew.getAll', () => {
  it('returns the user brews with relations, scoped to the user', async () => {
    await asA.coldBrewBrew.create(baseBrew())
    const brews = await asA.coldBrewBrew.getAll()
    expect(brews.length).toBeGreaterThanOrEqual(1)
    expect(brews.every((b) => b.userId === USER_A)).toBe(true)
    expect(brews[0].coffee).toBeTruthy()
    expect(brews[0].grinder).toBeTruthy()
    expect(brews[0].brewingDevice.type).toBeTruthy()
  })
})
