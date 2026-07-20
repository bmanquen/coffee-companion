import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { POUR_OVER_DEVICE_TYPE } from '../lib/pourover'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'pourover-user-a'
const USER_B = 'pourover-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

let pouroverDeviceId: string
let espressoDeviceId: string
let grinderId: string
let coffeeAId: string
let standardMethodId: string
let pulseMethodId: string
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
  const pouroverTypeId = await findOrCreateDeviceType(POUR_OVER_DEVICE_TYPE)
  const espressoTypeId = await findOrCreateDeviceType('Espresso')

  const pouroverDevice = await asA.brewingDevice.create({
    name: uniq('V60'),
    brand: 'Hario',
    typeId: pouroverTypeId,
  })
  pouroverDeviceId = pouroverDevice.id

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
  const standard = await asA.pouroverMethod.create({ name: uniq('Standard') })
  standardMethodId = standard.id
  const pulse = await asA.pouroverMethod.create({ name: uniq('Pulse') })
  pulseMethodId = pulse.id
  const otherMethod = await asB.pouroverMethod.create({
    name: `Pulse ${USER_B} ${Math.random()}`,
  })
  otherUserMethodId = otherMethod.id
})

const baseBrew = () => ({
  coffeeId: coffeeAId,
  grinderId,
  brewingDeviceId: pouroverDeviceId,
  methodId: standardMethodId,
  dose: '18',
  water: '300',
  brewTime: 165,
  waterTemp: 94,
})

describe('pouroverBrew.create', () => {
  it('creates a brew on a pour over device', async () => {
    const brew = await asA.pouroverBrew.create(baseBrew())
    expect(brew.userId).toBe(USER_A)
    expect(brew.dose).toBe('18')
    expect(brew.water).toBe('300')
    expect(brew.brewTime).toBe(165)
    expect(brew.waterTemp).toBe(94)
    expect(brew.methodId).toBe(standardMethodId)
  })

  it('rejects a non-pour over brewing device', async () => {
    await expect(
      asA.pouroverBrew.create({
        ...baseBrew(),
        brewingDeviceId: espressoDeviceId,
      }),
    ).rejects.toThrow(/Pour Over/)
  })

  it('rejects an unknown brewing device', async () => {
    await expect(
      asA.pouroverBrew.create({
        ...baseBrew(),
        brewingDeviceId: UNKNOWN_UUID,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects an unknown method', async () => {
    await expect(
      asA.pouroverBrew.create({ ...baseBrew(), methodId: UNKNOWN_UUID }),
    ).rejects.toThrow(/method not found/i)
  })

  it('rejects another user’s method', async () => {
    await expect(
      asA.pouroverBrew.create({ ...baseBrew(), methodId: otherUserMethodId }),
    ).rejects.toThrow(/method not found/i)
  })
})

describe('pouroverBrew.getById', () => {
  it('returns the user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    const brew = await asA.pouroverBrew.getById(created.id)
    expect(brew.id).toBe(created.id)
    expect(brew.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.pouroverBrew.getById(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('does not return another user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    await expect(asB.pouroverBrew.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('pouroverBrew.update', () => {
  it('updates fields on the user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    const updated = await asA.pouroverBrew.update({
      ...baseBrew(),
      id: created.id,
      dose: '20',
      water: '340',
      waterTemp: 96,
    })
    expect(updated.dose).toBe('20')
    expect(updated.water).toBe('340')
    expect(updated.waterTemp).toBe(96)
  })

  it('rejects a non-pour over brewing device', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    await expect(
      asA.pouroverBrew.update({
        ...baseBrew(),
        id: created.id,
        brewingDeviceId: espressoDeviceId,
      }),
    ).rejects.toThrow(/Pour Over/)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.pouroverBrew.update({ ...baseBrew(), id: UNKNOWN_UUID }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    await expect(
      asB.pouroverBrew.update({ ...baseBrew(), id: created.id, dose: '99' }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('pouroverBrew.delete', () => {
  it('deletes the user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    const deleted = await asA.pouroverBrew.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.pouroverBrew.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.pouroverBrew.delete(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('will not delete another user’s brew', async () => {
    const created = await asA.pouroverBrew.create(baseBrew())
    await expect(asB.pouroverBrew.delete(created.id)).rejects.toThrow(
      /not found/i,
    )
    expect((await asA.pouroverBrew.getById(created.id)).id).toBe(created.id)
  })
})

describe('pouroverBrew.getAll / getRecent', () => {
  it('returns the user brews with relations', async () => {
    await asA.pouroverBrew.create(baseBrew())
    const brews = await asA.pouroverBrew.getAll()
    expect(brews.length).toBeGreaterThanOrEqual(1)
    expect(brews.every((b) => b.userId === USER_A)).toBe(true)
    expect(brews[0].coffee).toBeTruthy()
    expect(brews[0].method).toBeTruthy()
    expect(brews[0].brewingDevice.type).toBeTruthy()
  })

  it('paginates with getRecent', async () => {
    for (let i = 0; i < 3; i++) {
      await asA.pouroverBrew.create(baseBrew())
    }
    const page1 = await asA.pouroverBrew.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await asA.pouroverBrew.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('pouroverBrew.setDialedIn / getDialedIn', () => {
  it('dials in one brew per method for the same coffee, independently', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Two Methods') })

    const standardBrew = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    const pulseBrew = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: pulseMethodId,
    })

    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: standardBrew.id,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: pulseMethodId,
      brewId: pulseBrew.id,
    })

    // Both methods can be dialed in for the same coffee at once.
    const dialedIn = await asA.pouroverBrew.getDialedIn()
    const ids = dialedIn.map((b) => b.id)
    expect(ids).toContain(standardBrew.id)
    expect(ids).toContain(pulseBrew.id)
    expect(dialedIn.every((b) => b.isDialedIn)).toBe(true)
  })

  it('replacing a method’s dialed-in brew leaves the other method untouched', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Replace Standard') })
    const firstStandard = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    const pulse = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: pulseMethodId,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: firstStandard.id,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: pulseMethodId,
      brewId: pulse.id,
    })

    // Dial in a *second* Standard brew — the first Standard clears, Pulse stays.
    const secondStandard = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: secondStandard.id,
    })

    expect((await asA.pouroverBrew.getById(firstStandard.id)).isDialedIn).toBe(
      false,
    )
    expect((await asA.pouroverBrew.getById(secondStandard.id)).isDialedIn).toBe(
      true,
    )
    // The Pulse dialed-in brew is unaffected by changes to Standard.
    expect((await asA.pouroverBrew.getById(pulse.id)).isDialedIn).toBe(true)
  })

  it('clears a method’s dialed-in brew with a null brewId', async () => {
    const coffee = await asA.coffee.create({ name: uniq('Clear Dialed') })
    const brew = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffee.id,
      methodId: standardMethodId,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: brew.id,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffee.id,
      methodId: standardMethodId,
      brewId: null,
    })
    expect((await asA.pouroverBrew.getById(brew.id)).isDialedIn).toBe(false)
  })

  it('rejects dialing in a brew from a different coffee without disturbing state', async () => {
    const coffeeX = await asA.coffee.create({ name: uniq('Guard X') })
    const coffeeY = await asA.coffee.create({ name: uniq('Guard Y') })
    const xDialed = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffeeX.id,
      methodId: standardMethodId,
    })
    const yDialed = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
    })
    const yOther = await asA.pouroverBrew.create({
      ...baseBrew(),
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffeeX.id,
      methodId: standardMethodId,
      brewId: xDialed.id,
    })
    await asA.pouroverBrew.setDialedIn({
      coffeeId: coffeeY.id,
      methodId: standardMethodId,
      brewId: yDialed.id,
    })
    // Dialing coffeeY's *other* brew in under coffeeX would set a second
    // dialed-in brew for coffeeY (tripping the unique index) and wrongly clear
    // coffeeX's. Now it's a clean NOT_FOUND with the transaction rolled back.
    await expect(
      asA.pouroverBrew.setDialedIn({
        coffeeId: coffeeX.id,
        methodId: standardMethodId,
        brewId: yOther.id,
      }),
    ).rejects.toThrow(/not found/i)
    expect((await asA.pouroverBrew.getById(xDialed.id)).isDialedIn).toBe(true)
    expect((await asA.pouroverBrew.getById(yDialed.id)).isDialedIn).toBe(true)
    expect((await asA.pouroverBrew.getById(yOther.id)).isDialedIn).toBe(false)
  })

  it('does not return another user’s dialed-in brews', async () => {
    const dialedIn = await asB.pouroverBrew.getDialedIn()
    expect(dialedIn.every((b) => b.userId === USER_B)).toBe(true)
  })
})
