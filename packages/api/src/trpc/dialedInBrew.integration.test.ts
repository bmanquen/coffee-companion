import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
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

async function logShot(brewingDeviceId: string, grindSetting: string) {
  return asA.espressoShot.create({
    coffeeId,
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

describe('dialedInBrew.set / get', () => {
  it('sets and returns the Dialed-in Brew for a method × device pair', async () => {
    const shot = await logShot(espressoDeviceAId, '1.5')

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    const found = await asA.dialedInBrew.get({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
    })
    expect(found?.brewId).toBe(shot.id)
    expect(found?.brewingMethod).toBe('espresso')
    expect(found?.brewingDeviceId).toBe(espressoDeviceAId)
    expect(found?.dose).toBe('18')
    expect(found?.outputLabel).toBe('Yield')
    expect(found?.outputGrams).toBe('36')
    expect(found?.grindSetting).toBe('1.5')
    expect(found?.sealed).toBe(false)
  })

  it('replaces the pair’s Brew when a second one is set', async () => {
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

    const found = await asA.dialedInBrew.get({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
    })
    expect(found?.brewId).toBe(second.id)
    expect(found?.grindSetting).toBe('2.5')
  })

  it('clears the pair when brewId is null', async () => {
    const shot = await logShot(espressoDeviceAId, '3.0')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: null,
    })

    expect(
      await asA.dialedInBrew.get({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceAId,
      }),
    ).toBeNull()
  })

  it('does not reuse another device’s Dialed-in Brew', async () => {
    const shotA = await logShot(espressoDeviceAId, '4.0')
    const shotB = await logShot(espressoDeviceBId, '4.5')

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

    const forA = await asA.dialedInBrew.get({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
    })
    const forB = await asA.dialedInBrew.get({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceBId,
    })
    expect(forA?.brewId).toBe(shotA.id)
    expect(forB?.brewId).toBe(shotB.id)
  })

  it('does not reuse another method’s Dialed-in Brew on lookup', async () => {
    const shot = await logShot(espressoDeviceAId, '5.0')
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
        brewingMethod: 'espresso',
        brewingDeviceId: aeropressDeviceId,
      }),
    ).toBeNull()
    expect(
      (
        await asA.dialedInBrew.get({
          brewingMethod: 'aeropress',
          brewingDeviceId: espressoDeviceAId,
        })
      )?.brewId,
    ).toBeUndefined()

    const espresso = await asA.dialedInBrew.get({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
    })
    const aero = await asA.dialedInBrew.get({
      brewingMethod: 'aeropress',
      brewingDeviceId: aeropressDeviceId,
    })
    expect(espresso?.brewId).toBe(shot.id)
    expect(aero?.brewId).toBe(aeropress.id)
    expect(aero?.outputLabel).toBe('Water')
  })

  it('rejects a brew that was not logged on the given device', async () => {
    const shot = await logShot(espressoDeviceAId, '6.0')

    await expect(
      asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceBId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/this brewing device/i)
  })

  it('rejects a brew that does not belong to the given method', async () => {
    const shot = await logShot(espressoDeviceAId, '6.5')

    await expect(
      asA.dialedInBrew.set({
        brewingMethod: 'aeropress',
        brewingDeviceId: aeropressDeviceId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/not found for this method/i)
  })

  it('does not set another user’s brew', async () => {
    const shot = await logShot(espressoDeviceAId, '7.0')

    await expect(
      asB.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceAId,
        brewId: shot.id,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('does not return another user’s mapping', async () => {
    const shot = await logShot(espressoDeviceAId, '7.5')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    expect(
      await asB.dialedInBrew.get({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceAId,
      }),
    ).toBeNull()
  })

  it('clears the pointer when the referenced brew is deleted', async () => {
    const shot = await logShot(espressoDeviceAId, '8.0')
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceAId,
      brewId: shot.id,
    })

    await asA.espressoShot.delete(shot.id)

    expect(
      await asA.dialedInBrew.get({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceAId,
      }),
    ).toBeNull()
    expect(
      (await asA.dialedInBrew.list()).some((row) => row.brewId === shot.id),
    ).toBe(false)
  })

  it('rejects an unknown brewing device', async () => {
    const shot = await logShot(espressoDeviceAId, '9.0')

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
  it('returns only the caller’s mappings', async () => {
    const shot = await logShot(espressoDeviceAId, '10.0')
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
          row.brewingMethod === 'espresso' &&
          row.brewingDeviceId === espressoDeviceAId,
      ),
    ).toBe(true)

    expect(await asB.dialedInBrew.list()).toEqual([])
  })
})
