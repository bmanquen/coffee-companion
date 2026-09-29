import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, dialedInBrews } from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  UNKNOWN_UUID,
  callerFor,
  createCoffeeFor,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

const USER_A = 'dialed-in-brew-user-a'
const USER_B = 'dialed-in-brew-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)
const createCoffee = createCoffeeFor(asA, uniq)

let espressoDeviceAId: string
let espressoDeviceBId: string
let aeropressDeviceId: string
let grinderId: string
let coffeeId: string
let standardMethodId: string

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

afterEach(async () => {
  await db.delete(dialedInBrews).where(eq(dialedInBrews.userId, USER_A))
})

beforeAll(async () => {
  const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const aeropressTypeId = await findOrCreateDeviceType(AEROPRESS_DEVICE_TYPE)

  espressoDeviceAId = (
    await asA.brewingDevice.create({
      name: uniq('Linea Mini'),
      brand: 'La Marzocco',
      typeId: espressoTypeId,
    })
  ).id
  espressoDeviceBId = (
    await asA.brewingDevice.create({
      name: uniq('Linea Classic'),
      brand: 'La Marzocco',
      typeId: espressoTypeId,
    })
  ).id
  aeropressDeviceId = (
    await asA.brewingDevice.create({
      name: uniq('AeroPress Go'),
      brand: 'AeroPress',
      typeId: aeropressTypeId,
    })
  ).id

  grinderId = (await asA.grinder.create({ name: uniq('Niche'), brand: 'Niche' }))
    .id
  coffeeId = (await createCoffee(uniq('Ethiopia Guji'))).id
  standardMethodId = (await asA.aeropressMethod.create({ name: uniq('Standard') }))
    .id
})

async function logShot(
  brewingDeviceId: string,
  grindSetting: string,
  coffee = coffeeId,
) {
  return asA.espressoShot.create({
    coffeeId: coffee,
    grinderId,
    brewingDeviceId,
    dose: '18',
    yield: '36',
    time: 30,
    grindSetting,
  })
}

async function logAeropress(grindSetting: string) {
  return asA.aeropressBrew.create({
    coffeeId,
    grinderId,
    brewingDeviceId: aeropressDeviceId,
    methodId: standardMethodId,
    dose: '15',
    water: '220',
    steepTime: 90,
    grindSetting,
  })
}

function espressoKey(deviceId: string, coffee = coffeeId) {
  return {
    coffeeId: coffee,
    brewingMethod: 'espresso' as const,
    brewingDeviceId: deviceId,
  }
}

function idsOf(views: Array<{ brewId: string }>) {
  return views.map((view) => view.brewId).sort()
}

describe('dialedInBrew.set / get / unset', () => {
  it('marks a brew and returns it in the coffee × method × device set', async () => {
    const shot = await logShot(espressoDeviceAId, '1.5')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    const found = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    expect(found).toHaveLength(1)
    expect(found[0]?.brewId).toBe(shot.id)
    expect(found[0]?.coffeeId).toBe(coffeeId)
    expect(found[0]?.brewingMethod).toBe('espresso')
    expect(found[0]?.brewingDeviceId).toBe(espressoDeviceAId)
    expect(found[0]?.dose).toBe('18')
    expect(found[0]?.outputLabel).toBe('Yield')
    expect(found[0]?.outputGrams).toBe('36')
    expect(found[0]?.grindSetting).toBe('1.5')
    expect(found[0]?.sealed).toBe(false)
  })

  it('keeps both brews when two are marked in the same set', async () => {
    const first = await logShot(espressoDeviceAId, '2.0')
    const second = await logShot(espressoDeviceAId, '2.5')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: first.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: second.id,
    })

    const found = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    expect(idsOf(found)).toEqual([first.id, second.id].sort())
    expect((await asA.espressoShot.getById(first.id)).isDialedIn).toBe(true)
    expect((await asA.espressoShot.getById(second.id)).isDialedIn).toBe(true)
  })

  it('unmarks one brew and leaves the rest of the set', async () => {
    const first = await logShot(espressoDeviceAId, '3.0')
    const second = await logShot(espressoDeviceAId, '3.5')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: first.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: second.id,
    })
    await asA.dialedInBrew.unset({ brewId: first.id })

    const found = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    expect(idsOf(found)).toEqual([second.id])
    expect((await asA.espressoShot.getById(first.id)).isDialedIn).toBe(false)
    expect((await asA.espressoShot.getById(second.id)).isDialedIn).toBe(true)
  })

  it('keeps a second mark of the same brew as a no-op', async () => {
    const shot = await logShot(espressoDeviceAId, '2.1')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    const found = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    expect(found.filter((row) => row.brewId === shot.id)).toHaveLength(1)
  })

  it('keeps two coffees on the same method and device in their own sets', async () => {
    const coffeeX = (await createCoffee(uniq('Coffee X'))).id
    const coffeeY = (await createCoffee(uniq('Coffee Y'))).id
    const shotX = await logShot(espressoDeviceAId, '4.0', coffeeX)
    const shotY = await logShot(espressoDeviceAId, '4.5', coffeeY)

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shotX.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shotY.id,
    })

    const forX = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId, coffeeX))
    const forY = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId, coffeeY))
    expect(idsOf(forX)).toEqual([shotX.id])
    expect(idsOf(forY)).toEqual([shotY.id])
  })

  it('does not show another coffee’s set when the coffee changes', async () => {
    const coffeeX = (await createCoffee(uniq('Lookup X'))).id
    const coffeeY = (await createCoffee(uniq('Lookup Y'))).id
    const shotX = await logShot(espressoDeviceAId, '4.6', coffeeX)

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shotX.id,
    })

    expect(
      await asA.dialedInBrew.get(espressoKey(espressoDeviceAId, coffeeY)),
    ).toEqual([])
  })

  it('does not reuse another device’s set', async () => {
    const shotA = await logShot(espressoDeviceAId, '5.0')
    const shotB = await logShot(espressoDeviceBId, '5.5')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shotA.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceBId,
      brewId: shotB.id,
    })

    expect(idsOf(await asA.dialedInBrew.get(espressoKey(espressoDeviceAId)))).toEqual(
      [shotA.id],
    )
    expect(idsOf(await asA.dialedInBrew.get(espressoKey(espressoDeviceBId)))).toEqual(
      [shotB.id],
    )
  })

  it('does not reuse another method’s set', async () => {
    const shot = await logShot(espressoDeviceAId, '6.0')
    const aeropress = await logAeropress('18')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'aeropress',
      brewingDeviceId: aeropressDeviceId,
      brewId: aeropress.id,
    })

    expect(
      await asA.dialedInBrew.get({
        coffeeId,
        brewingMethod: 'espresso',
        brewingDeviceId: aeropressDeviceId,
      }),
    ).toEqual([])
    expect(
      await asA.dialedInBrew.get({
        coffeeId,
        brewingMethod: 'aeropress',
        brewingDeviceId: espressoDeviceAId,
      }),
    ).toEqual([])

    const espresso = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    const aero = await asA.dialedInBrew.get({
      coffeeId,
      brewingMethod: 'aeropress',
      brewingDeviceId: aeropressDeviceId,
    })
    expect(idsOf(espresso)).toEqual([shot.id])
    expect(idsOf(aero)).toEqual([aeropress.id])
    expect(aero[0]?.outputLabel).toBe('Water')
  })

  it('rejects a brew that was not logged on the given device', async () => {
    const shot = await logShot(espressoDeviceAId, '7.0')

    await expect(
      asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceBId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/this brewing device/i)
  })

  it('rejects a brew that does not belong to the given method', async () => {
    const shot = await logShot(espressoDeviceAId, '7.5')

    await expect(
      asA.dialedInBrew.set({
        brewingMethod: 'aeropress',
        brewingDeviceId: aeropressDeviceId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/not found for this method/i)
  })

  it('does not set another user’s brew', async () => {
    const shot = await logShot(espressoDeviceAId, '8.0')

    await expect(
      asB.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceAId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('does not return another user’s set', async () => {
    const shot = await logShot(espressoDeviceAId, '8.5')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    expect(await asB.dialedInBrew.get(espressoKey(espressoDeviceAId))).toEqual([])
  })

  it('removes only the deleted brew from the set', async () => {
    const first = await logShot(espressoDeviceAId, '9.0')
    const second = await logShot(espressoDeviceAId, '9.5')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: first.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: second.id,
    })

    await asA.espressoShot.delete(first.id)

    const found = await asA.dialedInBrew.get(espressoKey(espressoDeviceAId))
    expect(idsOf(found)).toEqual([second.id])
    expect(
      (await asA.dialedInBrew.list()).some((row) => row.brewId === first.id),
    ).toBe(false)
  })

  it('rejects an unknown brewing device', async () => {
    const shot = await logShot(espressoDeviceAId, '10.0')

    await expect(
      asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: UNKNOWN_UUID,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('dialedInBrew.list', () => {
  it('returns only the caller’s memberships, including coffeeId', async () => {
    const shot = await logShot(espressoDeviceAId, '11.0')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    const listed = await asA.dialedInBrew.list()
    expect(
      listed.some(
        (row) =>
          row.brewId === shot.id &&
          row.coffeeId === coffeeId &&
          row.brewingMethod === 'espresso' &&
          row.brewingDeviceId === espressoDeviceAId,
      ),
    ).toBe(true)

    expect(await asB.dialedInBrew.list()).toEqual([])
  })
})

describe('coffee.getAll dialed-in', () => {
  it('is true exactly when the coffee has at least one membership', async () => {
    const coffee = await createCoffee(uniq('Card Flag'))
    const first = await logShot(espressoDeviceAId, '12.0', coffee.id)
    const second = await logShot(espressoDeviceAId, '12.5', coffee.id)

    const before = await asA.coffee.getAll()
    expect(before.find((row) => row.id === coffee.id)?.isDialedIn).toBe(false)

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: first.id,
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: second.id,
    })
    expect(
      (await asA.coffee.getAll()).find((row) => row.id === coffee.id)?.isDialedIn,
    ).toBe(true)

    await asA.dialedInBrew.unset({ brewId: first.id })
    expect(
      (await asA.coffee.getAll()).find((row) => row.id === coffee.id)?.isDialedIn,
    ).toBe(true)

    await asA.dialedInBrew.unset({ brewId: second.id })
    expect(
      (await asA.coffee.getAll()).find((row) => row.id === coffee.id)?.isDialedIn,
    ).toBe(false)
  })
})
