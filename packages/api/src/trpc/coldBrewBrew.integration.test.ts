import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { FRENCH_PRESS_DEVICE_TYPE } from '../lib/frenchpress'
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
// French press fixtures, used only to prove cross-method dial-in independence.
let frenchpressDeviceId: string
let frenchpressMethodId: string

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

  // A French Press device + method so a coffee can also have a dialed-in french
  // press brew alongside its dialed-in cold brew.
  const frenchpressTypeId = await findOrCreateDeviceType(FRENCH_PRESS_DEVICE_TYPE)
  const frenchpressDevice = await asA.brewingDevice.create({
    name: uniq('Chambord'),
    brand: 'Bodum',
    typeId: frenchpressTypeId,
  })
  frenchpressDeviceId = frenchpressDevice.id
  const frenchpressMethod = await asA.frenchpressMethod.create({
    name: uniq('Standard'),
  })
  frenchpressMethodId = frenchpressMethod.id
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

  it('returns brews most recent first', async () => {
    const older = await asA.coldBrewBrew.create(baseBrew())
    const newer = await asA.coldBrewBrew.create(baseBrew())
    const brews = await asA.coldBrewBrew.getAll()
    const olderIdx = brews.findIndex((b) => b.id === older.id)
    const newerIdx = brews.findIndex((b) => b.id === newer.id)
    expect(newerIdx).toBeGreaterThanOrEqual(0)
    expect(newerIdx).toBeLessThan(olderIdx)
  })

  it('does not return another user’s brews', async () => {
    const brews = await asB.coldBrewBrew.getAll()
    expect(brews.every((b) => b.userId === USER_B)).toBe(true)
  })
})

describe('coldBrewBrew.setDialedIn / getDialedIn', () => {
  it('dials in at most one cold brew per coffee, replacing the previous', async () => {
    const coffee = await asA.coffee.create({ name: uniq('One Per Coffee') })
    const first = await asA.coldBrewBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
    })
    const second = await asA.coldBrewBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
    })

    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: first.id })
    expect((await asA.coldBrewBrew.getById(first.id)).isDialedIn).toBe(true)

    // Dial in the second — the first clears (one per coffee).
    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: second.id })
    expect((await asA.coldBrewBrew.getById(first.id)).isDialedIn).toBe(false)
    expect((await asA.coldBrewBrew.getById(second.id)).isDialedIn).toBe(true)
  })

  it('clears the dialed-in cold brew with a null brewId', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Clear Dialed') })
    const brew = await asA.coldBrewBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
    })
    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: brew.id })
    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: null })
    expect((await asA.coldBrewBrew.getById(brew.id)).isDialedIn).toBe(false)
  })

  it('does not touch another method’s dialed-in brew for the same coffee', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Cross Method') })

    // A dialed-in french press brew for this coffee.
    const fpBrew = await asA.frenchpressBrew.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: frenchpressDeviceId,
      methodId: frenchpressMethodId,
      dose: '30',
      water: '500',
      steepTime: 240,
      waterTemp: 95,
    })
    await asA.frenchpressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: frenchpressMethodId,
      brewId: fpBrew.id,
    })

    // A dialed-in cold brew for the same coffee.
    const cbBrew = await asA.coldBrewBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
    })
    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: cbBrew.id })

    // Both stay dialed in — cold brew's dial-in is independent of french press.
    expect((await asA.frenchpressBrew.getById(fpBrew.id)).isDialedIn).toBe(true)
    expect((await asA.coldBrewBrew.getById(cbBrew.id)).isDialedIn).toBe(true)
  })

  it('getDialedIn returns only the user’s dialed-in cold brews', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Dialed List') })
    const brew = await asA.coldBrewBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
    })
    await asA.coldBrewBrew.setDialedIn({ coffeeId: coffee.id, brewId: brew.id })

    const dialedIn = await asA.coldBrewBrew.getDialedIn()
    expect(dialedIn.some((b) => b.id === brew.id)).toBe(true)
    expect(dialedIn.every((b) => b.isDialedIn && b.userId === USER_A)).toBe(true)

    // Another user sees none of A's dialed-in brews.
    const bDialed = await asB.coldBrewBrew.getDialedIn()
    expect(bDialed.every((b) => b.userId === USER_B)).toBe(true)
  })
})
