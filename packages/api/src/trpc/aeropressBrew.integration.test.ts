import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'aeropress-user-a'
const USER_B = 'aeropress-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

let aeropressDeviceId: string
let espressoDeviceId: string
let grinderId: string
let coffeeAId: string
let standardMethodId: string
let invertedMethodId: string
// A method owned by USER_B, to prove cross-user methods are rejected.
let otherUserMethodId: string

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
  const aeropressTypeId = await findOrCreateDeviceType(AEROPRESS_DEVICE_TYPE)
  const espressoTypeId = await findOrCreateDeviceType('Espresso')

  const aeropressDevice = await asA.brewingDevice.create({
    name: uniq('AeroPress Go'),
    brand: 'AeroPress',
    typeId: aeropressTypeId,
  })
  aeropressDeviceId = aeropressDevice.id

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

  // Methods are user-scoped (they cascade-delete with the user), so unique names
  // sidestep the globally-unique name index.
  const standard = await asA.aeropressMethod.create({ name: uniq('Standard') })
  standardMethodId = standard.id
  const inverted = await asA.aeropressMethod.create({ name: uniq('Inverted') })
  invertedMethodId = inverted.id
  const otherMethod = await asB.aeropressMethod.create({
    name: `Inverted ${USER_B} ${Math.random()}`,
  })
  otherUserMethodId = otherMethod.id
})

const baseBrew = () => ({
  coffeeId: coffeeAId,
  grinderId,
  brewingDeviceId: aeropressDeviceId,
  methodId: standardMethodId,
  dose: '15',
  water: '220',
})

describe('aeropressBrew.create', () => {
  it('creates a brew on an aeropress device', async () => {
    const brew = await asA.aeropressBrew.create(baseBrew())
    expect(brew.userId).toBe(USER_A)
    expect(brew.dose).toBe('15')
    expect(brew.water).toBe('220')
    expect(brew.methodId).toBe(standardMethodId)
  })

  it('rejects a non-aeropress brewing device', async () => {
    await expect(
      asA.aeropressBrew.create({
        ...baseBrew(),
        brewingDeviceId: espressoDeviceId,
      }),
    ).rejects.toThrow(/AeroPress/)
  })

  it('rejects an unknown brewing device', async () => {
    await expect(
      asA.aeropressBrew.create({
        ...baseBrew(),
        brewingDeviceId: UNKNOWN_UUID,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects an unknown method', async () => {
    await expect(
      asA.aeropressBrew.create({ ...baseBrew(), methodId: UNKNOWN_UUID }),
    ).rejects.toThrow(/method not found/i)
  })

  it('rejects another user’s method', async () => {
    await expect(
      asA.aeropressBrew.create({ ...baseBrew(), methodId: otherUserMethodId }),
    ).rejects.toThrow(/method not found/i)
  })
})

describe('aeropressBrew.getById', () => {
  it('returns the user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    const brew = await asA.aeropressBrew.getById(created.id)
    expect(brew.id).toBe(created.id)
    expect(brew.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.aeropressBrew.getById(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('does not return another user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    await expect(asB.aeropressBrew.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('aeropressBrew.update', () => {
  it('updates fields on the user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    const updated = await asA.aeropressBrew.update({
      ...baseBrew(),
      id: created.id,
      dose: '17',
      water: '250',
    })
    expect(updated.dose).toBe('17')
    expect(updated.water).toBe('250')
  })

  it('rejects a non-aeropress brewing device', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    await expect(
      asA.aeropressBrew.update({
        ...baseBrew(),
        id: created.id,
        brewingDeviceId: espressoDeviceId,
      }),
    ).rejects.toThrow(/AeroPress/)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.aeropressBrew.update({ ...baseBrew(), id: UNKNOWN_UUID }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    await expect(
      asB.aeropressBrew.update({ ...baseBrew(), id: created.id, dose: '99' }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('aeropressBrew.delete', () => {
  it('deletes the user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    const deleted = await asA.aeropressBrew.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.aeropressBrew.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.aeropressBrew.delete(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('will not delete another user’s brew', async () => {
    const created = await asA.aeropressBrew.create(baseBrew())
    await expect(asB.aeropressBrew.delete(created.id)).rejects.toThrow(
      /not found/i,
    )
    expect((await asA.aeropressBrew.getById(created.id)).id).toBe(created.id)
  })
})

describe('aeropressBrew.getAll / getRecent', () => {
  it('returns the user brews with relations', async () => {
    await asA.aeropressBrew.create(baseBrew())
    const brews = await asA.aeropressBrew.getAll()
    expect(brews.length).toBeGreaterThanOrEqual(1)
    expect(brews.every((b) => b.userId === USER_A)).toBe(true)
    expect(brews[0].coffee).toBeTruthy()
    expect(brews[0].method).toBeTruthy()
    expect(brews[0].brewingDevice.type).toBeTruthy()
  })

  it('paginates with getRecent', async () => {
    for (let i = 0; i < 3; i++) {
      await asA.aeropressBrew.create(baseBrew())
    }
    const page1 = await asA.aeropressBrew.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await asA.aeropressBrew.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('aeropressBrew.setDialedIn / getDialedIn', () => {
  it('dials in one brew per method for the same coffee, independently', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Two Methods') })

    const standardBrew = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    const invertedBrew = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: invertedMethodId,
    })

    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: standardBrew.id,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: invertedMethodId,
      brewId: invertedBrew.id,
    })

    // Both methods can be dialed in for the same coffee at once.
    const dialedIn = await asA.aeropressBrew.getDialedIn()
    const ids = dialedIn.map((b) => b.id)
    expect(ids).toContain(standardBrew.id)
    expect(ids).toContain(invertedBrew.id)
    expect(dialedIn.every((b) => b.isDialedIn)).toBe(true)
  })

  it('replacing a method’s dialed-in brew leaves the other method untouched', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Replace Standard') })
    const firstStandard = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    const inverted = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: invertedMethodId,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: firstStandard.id,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: invertedMethodId,
      brewId: inverted.id,
    })

    // Dial in a *second* Standard brew — the first Standard clears, Inverted stays.
    const secondStandard = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: secondStandard.id,
    })

    expect((await asA.aeropressBrew.getById(firstStandard.id)).isDialedIn).toBe(
      false,
    )
    expect((await asA.aeropressBrew.getById(secondStandard.id)).isDialedIn).toBe(
      true,
    )
    // The Inverted dialed-in brew is unaffected by changes to Standard.
    expect((await asA.aeropressBrew.getById(inverted.id)).isDialedIn).toBe(true)
  })

  it('clears a method’s dialed-in brew with a null brewId', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Clear Dialed') })
    const brew = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: brew.id,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: null,
    })
    expect((await asA.aeropressBrew.getById(brew.id)).isDialedIn).toBe(false)
  })

  it('rejects dialing in a brew from a different coffee without disturbing state', async () => {
    const coffeeX = await asA.coffee.create({ name: uniq('Guard X') })
    const coffeeY = await asA.coffee.create({ name: uniq('Guard Y') })
    const xDialed = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffeeX.id,
      methodId: standardMethodId,
    })
    const yDialed = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
    })
    const yOther = await asA.aeropressBrew.create({
      ...baseBrew(),
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffeeX.id,
      methodId: standardMethodId,
      brewId: xDialed.id,
    })
    await asA.aeropressBrew.setDialedIn({
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
      brewId: yDialed.id,
    })
    // Dialing coffeeY's *other* brew in under coffeeX would set a second
    // dialed-in brew for coffeeY (tripping the unique index) and wrongly clear
    // coffeeX's. Now it's a clean NOT_FOUND with the transaction rolled back.
    await expect(
      asA.aeropressBrew.setDialedIn({
        coffeeId: coffeeX.id,
        methodId: standardMethodId,
        brewId: yOther.id,
      }),
    ).rejects.toThrow(/not found/i)
    expect((await asA.aeropressBrew.getById(xDialed.id)).isDialedIn).toBe(true)
    expect((await asA.aeropressBrew.getById(yDialed.id)).isDialedIn).toBe(true)
    expect((await asA.aeropressBrew.getById(yOther.id)).isDialedIn).toBe(false)
  })

  it('does not return another user’s dialed-in brews', async () => {
    const dialedIn = await asB.aeropressBrew.getDialedIn()
    expect(dialedIn.every((b) => b.userId === USER_B)).toBe(true)
  })
})
