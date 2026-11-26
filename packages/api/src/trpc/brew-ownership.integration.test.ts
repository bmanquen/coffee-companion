import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import {
  aeropressBrews,
  brewingDeviceTypes,
  brewingDevices,
  coldBrewBrews,
  espressoShots,
  frenchpressBrews,
  pouroverBrews,
} from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { FRENCH_PRESS_DEVICE_TYPE } from '../lib/frenchpress'
import { POUR_OVER_DEVICE_TYPE } from '../lib/pourover'
import {
  callerFor,
  createCoffeeFor,
  grantPlan,
  seedUsers,
  uniqFor,
  writeLegacy,
} from '../../test/trpc'

// A user only sees their own Coffees, grinders and devices on a Brew: writes
// refuse anyone else's, and reads hide what a legacy row still points at.
const OWNER = 'brew-ownership-owner'
const OTHER = 'brew-ownership-other'
const asOwner = callerFor(OWNER)
const asOther = callerFor(OTHER)
const uniq = uniqFor(OWNER)
const uniqOther = uniqFor(OTHER)

const createdTypeIds: Array<string> = []
async function deviceType(name: string) {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    // Shared only: another user's private type of that name is not one the
    // owner can put a device on.
    .where(
      and(eq(brewingDeviceTypes.name, name), isNull(brewingDeviceTypes.userId)),
    )
  if (existing[0]) return existing[0].id
  const [row] = await db.insert(brewingDeviceTypes).values({ name }).returning()
  createdTypeIds.push(row.id)
  return row.id
}

seedUsers([OWNER, OTHER], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

type Gear = { coffeeId: string; grinderId: string }
const own = {} as Gear
const foreign = {} as Gear & { brewingDeviceId: string }
const create: Record<string, (gear: Gear) => Promise<{ id: string }>> = {}

const methods = [
  { router: 'aeropressBrew', table: aeropressBrews },
  { router: 'pouroverBrew', table: pouroverBrews },
  { router: 'frenchpressBrew', table: frenchpressBrews },
  { router: 'coldBrewBrew', table: coldBrewBrews },
] as const

beforeAll(async () => {
  // Five devices is more than the Free Plan holds.
  await grantPlan(OWNER, 'pro', { reason: 'brew ownership fixture' })

  const device = async (typeName: string) =>
    (
      await asOwner.brewingDevice.create({
        name: uniq(typeName),
        brand: 'Brand',
        typeId: await deviceType(typeName),
      })
    ).id
  const [coffee, grinder, otherCoffee, otherGrinder, otherDevice] =
    await Promise.all([
      createCoffeeFor(asOwner, uniq)(uniq('Own coffee')),
      asOwner.grinder.create({ name: uniq('Own grinder'), brand: 'Niche' }),
      createCoffeeFor(asOther, uniqOther)(uniqOther('Their coffee')),
      asOther.grinder.create({ name: uniqOther('Their grinder'), brand: 'P' }),
      asOther.brewingDevice.create({
        name: uniqOther('Their device'),
        brand: 'Brand',
        typeId: await deviceType(AEROPRESS_DEVICE_TYPE),
      }),
    ])
  Object.assign(own, { coffeeId: coffee.id, grinderId: grinder.id })
  Object.assign(foreign, {
    coffeeId: otherCoffee.id,
    grinderId: otherGrinder.id,
    brewingDeviceId: otherDevice.id,
  })

  const [aeropress, pourover, frenchpress, coldBrew] = await Promise.all([
    device(AEROPRESS_DEVICE_TYPE),
    device(POUR_OVER_DEVICE_TYPE),
    device(FRENCH_PRESS_DEVICE_TYPE),
    device(COLD_BREW_DEVICE_TYPE),
  ])
  const [aeroMethod, pourMethod, frenchMethod] = await Promise.all([
    asOwner.aeropressMethod.create({ name: uniq('Std') }),
    asOwner.pouroverMethod.create({ name: uniq('Std') }),
    asOwner.frenchpressMethod.create({ name: uniq('Std') }),
  ])
  const shared = { grindSetting: '18', dose: '18', water: '250' }
  create.aeropressBrew = (gear) =>
    asOwner.aeropressBrew.create({
      ...shared,
      ...gear,
      brewingDeviceId: aeropress,
      methodId: aeroMethod.id,
      steepTime: 90,
    })
  create.pouroverBrew = (gear) =>
    asOwner.pouroverBrew.create({
      ...shared,
      ...gear,
      brewingDeviceId: pourover,
      methodId: pourMethod.id,
      brewTime: 165,
      waterTemp: 94,
    })
  create.frenchpressBrew = (gear) =>
    asOwner.frenchpressBrew.create({
      ...shared,
      ...gear,
      brewingDeviceId: frenchpress,
      methodId: frenchMethod.id,
      steepTime: 240,
      waterTemp: 95,
    })
  create.coldBrewBrew = (gear) =>
    asOwner.coldBrewBrew.create({
      ...shared,
      ...gear,
      brewingDeviceId: coldBrew,
      steepTime: 1080,
      brewEnvironment: 'Fridge',
    })
})

describe.each(methods)('$router', ({ router, table }) => {
  it('refuses another user’s Coffee or grinder on create', async () => {
    await expect(
      create[router]({ ...own, coffeeId: foreign.coffeeId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Coffee not found' })
    await expect(
      create[router]({ ...own, grinderId: foreign.grinderId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Grinder not found' })
  })

  it('hides another user’s grinder and device on a legacy Brew', async () => {
    const brew = await create[router](own)
    // Only a row written before writes checked ownership can do this.
    await writeLegacy((tx) =>
      tx
        .update(table)
        .set({
          grinderId: foreign.grinderId,
          brewingDeviceId: foreign.brewingDeviceId,
        })
        .where(eq(table.id, brew.id)),
    )

    const listed = (await asOwner[router].getAll()).find(
      (row) => row.id === brew.id,
    )
    expect(listed).toBeDefined()
    expect(listed?.grinder).toBeNull()
    expect(listed?.brewingDevice).toBeNull()
  })

  it('leaves out a legacy Brew on another user’s Coffee', async () => {
    const brew = await create[router](own)
    // On the owner's Coffee, so an empty result cannot pass for filtering.
    const control = await create[router](own)
    await writeLegacy((tx) =>
      tx
        .update(table)
        .set({ coffeeId: foreign.coffeeId })
        .where(eq(table.id, brew.id)),
    )

    const all = await asOwner[router].getAll()
    expect(all.map((row) => row.id)).not.toContain(brew.id)
    expect(all.map((row) => row.id)).toContain(control.id)
    const recent = await asOwner[router].getRecent({ limit: 50, offset: 0 })
    expect(recent.items.map((row) => row.id)).not.toContain(brew.id)
    expect(recent.items.map((row) => row.id)).toContain(control.id)
    expect(recent.total).toBe(recent.items.length)
    await expect(asOwner[router].getById(brew.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('espressoShot', () => {
  it('leaves out a legacy shot on another user’s Coffee', async () => {
    const device = await asOwner.brewingDevice.create({
      name: uniq('Espresso'),
      brand: 'Brand',
      typeId: await deviceType(ESPRESSO_DEVICE_TYPE),
    })
    const logShot = () =>
      asOwner.espressoShot.create({
        ...own,
        brewingDeviceId: device.id,
        grindSetting: '1.5',
        dose: '18',
        yield: '36',
        time: 30,
        idempotencyKey: crypto.randomUUID(),
      })
    const shot = await logShot()
    // On the owner's Coffee, so an empty page cannot pass for filtering.
    const control = await logShot()
    await writeLegacy((tx) =>
      tx
        .update(espressoShots)
        .set({ coffeeId: foreign.coffeeId })
        .where(eq(espressoShots.id, shot.id)),
    )

    const recent = await asOwner.espressoShot.getRecent({ limit: 50 })
    expect(recent.items.map((row) => row.id)).not.toContain(shot.id)
    expect(recent.items.map((row) => row.id)).toContain(control.id)
    expect(recent.total).toBe(recent.items.length)
    await expect(asOwner.espressoShot.getById(shot.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      await asOwner.espressoShot.getLatestUnsealed({
        coffeeId: foreign.coffeeId,
      }),
    ).toBeNull()
  })

  it('hides a legacy device that carries another user’s private type', async () => {
    const espressoType = await deviceType(ESPRESSO_DEVICE_TYPE)
    const theirType = await asOther.brewingDeviceType.create({
      name: uniqOther('Their private type'),
    })
    const [legacy, control] = await Promise.all(
      ['Legacy espresso', 'Control espresso'].map((name) =>
        asOwner.brewingDevice.create({
          name: uniq(name),
          brand: 'Brand',
          typeId: espressoType,
        }),
      ),
    )
    const logShot = (brewingDeviceId: string) =>
      asOwner.espressoShot.create({
        ...own,
        brewingDeviceId,
        grindSetting: '1.5',
        dose: '18',
        yield: '36',
        time: 30,
        idempotencyKey: crypto.randomUUID(),
      })
    const shot = await logShot(legacy.id)
    const controlShot = await logShot(control.id)
    // Only a device written before writes checked the type can do this.
    await writeLegacy((tx) =>
      tx
        .update(brewingDevices)
        .set({ typeId: theirType.id })
        .where(eq(brewingDevices.id, legacy.id)),
    )

    const { items } = await asOwner.espressoShot.getRecent({ limit: 50 })
    const deviceOf = (id: string) =>
      items.find((row) => row.id === id)?.brewingDevice
    expect(deviceOf(shot.id)).toBeNull()
    expect(deviceOf(controlShot.id)?.type.name).toBe(ESPRESSO_DEVICE_TYPE)
    const listed = (await asOwner.brewingDevice.list()).map((d) => d.id)
    expect(listed).not.toContain(legacy.id)
    expect(listed).toContain(control.id)
  })

  it('leaves a legacy device with another user’s private type out of Dialed In', async () => {
    const espressoType = await deviceType(ESPRESSO_DEVICE_TYPE)
    const theirType = await asOther.brewingDeviceType.create({
      name: uniqOther('Their dialed type'),
    })
    const legacy = await asOwner.brewingDevice.create({
      name: uniq('Legacy dialed espresso'),
      brand: 'Brand',
      typeId: espressoType,
    })
    const shot = await asOwner.espressoShot.create({
      ...own,
      brewingDeviceId: legacy.id,
      grindSetting: '1.5',
      dose: '18',
      yield: '36',
      time: 30,
      idempotencyKey: crypto.randomUUID(),
    })
    await asOwner.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: legacy.id,
      brewId: shot.id,
    })
    // Only a device written before writes checked the type can do this.
    await writeLegacy((tx) =>
      tx
        .update(brewingDevices)
        .set({ typeId: theirType.id })
        .where(eq(brewingDevices.id, legacy.id)),
    )

    const key = {
      coffeeId: own.coffeeId,
      brewingMethod: 'espresso' as const,
      brewingDeviceId: legacy.id,
    }
    const views = await asOwner.dialedInBrew.get(key)
    expect(views.map((view) => view.deviceName)).not.toContain(legacy.name)

    // Hidden, not gone: once the owner gives it a visible type again, the
    // mark is still there.
    await db
      .update(brewingDevices)
      .set({ typeId: espressoType })
      .where(eq(brewingDevices.id, legacy.id))
    const repaired = await asOwner.dialedInBrew.get(key)
    expect(repaired.map((view) => view.brewId)).toEqual([shot.id])
  })
})
