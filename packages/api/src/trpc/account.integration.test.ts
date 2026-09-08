import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { FRENCH_PRESS_DEVICE_TYPE } from '../lib/frenchpress'
import { POUR_OVER_DEVICE_TYPE } from '../lib/pourover'
import {
  anonCaller,
  callerFor,
  createCoffeeFor,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

// A Free user whose oldest Coffee has fallen off the Shelf, so every Brew on
// it is Sealed on the read path — and a second user, so an export cannot be
// shown to leak someone else's rows.
const USER = 'export-user'
const OTHER = 'export-other-user'
const asUser = callerFor(USER)
const asOther = callerFor(OTHER)
const uniq = uniqFor(USER)
const uniqOther = uniqFor(OTHER)
const createCoffee = createCoffeeFor(asUser, uniq)
const createOtherCoffee = createCoffeeFor(asOther, uniqOther)

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

seedUsers([USER, OTHER], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

type MethodKey =
  | 'espressoShot'
  | 'aeropressBrew'
  | 'pouroverBrew'
  | 'frenchpressBrew'
  | 'coldBrewBrew'

const sealedBrewIds: Partial<Record<MethodKey, string>> = {}
let fallenCoffeeId: string
let otherCoffeeId: string
let otherShotId: string

beforeAll(async () => {
  // Five devices is more than Free holds; the Grant is only there to set the
  // fixture up, then it lapses so the export is observed on Free.
  await grantPlan(USER, 'pro', { reason: 'export fixture' })

  const grinder = await asUser.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  const roaster = await asUser.roaster.create({ name: uniq('Sey') })

  const device = async (typeName: string) => {
    const typeId = await findOrCreateDeviceType(typeName)
    return (
      await asUser.brewingDevice.create({
        name: uniq(typeName),
        brand: 'Brand',
        typeId,
      })
    ).id
  }
  const espressoDevice = await device(ESPRESSO_DEVICE_TYPE)
  const aeropressDevice = await device(AEROPRESS_DEVICE_TYPE)
  const pouroverDevice = await device(POUR_OVER_DEVICE_TYPE)
  const frenchpressDevice = await device(FRENCH_PRESS_DEVICE_TYPE)
  const coldBrewDevice = await device(COLD_BREW_DEVICE_TYPE)

  const aeroMethod = await asUser.aeropressMethod.create({ name: uniq('Std') })
  const pourMethod = await asUser.pouroverMethod.create({ name: uniq('Std') })
  const frenchMethod = await asUser.frenchpressMethod.create({
    name: uniq('Std'),
  })

  const fallen = await createCoffee(uniq('Falls off'), {
    roasterId: roaster.id,
  })
  fallenCoffeeId = fallen.id
  const base = {
    coffeeId: fallen.id,
    grinderId: grinder.id,
    grindSetting: 'sealed-grind',
  }

  sealedBrewIds.espressoShot = (
    await asUser.espressoShot.create({
      ...base,
      brewingDeviceId: espressoDevice,
      dose: '17',
      yield: '34',
      time: 30,
    })
  ).id
  sealedBrewIds.aeropressBrew = (
    await asUser.aeropressBrew.create({
      ...base,
      brewingDeviceId: aeropressDevice,
      methodId: aeroMethod.id,
      dose: '16',
      water: '240',
      steepTime: 90,
    })
  ).id
  sealedBrewIds.pouroverBrew = (
    await asUser.pouroverBrew.create({
      ...base,
      brewingDeviceId: pouroverDevice,
      methodId: pourMethod.id,
      dose: '15',
      water: '250',
      brewTime: 165,
      waterTemp: 94,
    })
  ).id
  sealedBrewIds.frenchpressBrew = (
    await asUser.frenchpressBrew.create({
      ...base,
      brewingDeviceId: frenchpressDevice,
      methodId: frenchMethod.id,
      dose: '18',
      water: '270',
      steepTime: 240,
      waterTemp: 95,
    })
  ).id
  sealedBrewIds.coldBrewBrew = (
    await asUser.coldBrewBrew.create({
      ...base,
      brewingDeviceId: coldBrewDevice,
      dose: '19',
      water: '300',
      steepTime: 1080,
      brewEnvironment: 'Fridge',
    })
  ).id

  for (let i = 0; i < 5; i++) {
    const coffee = await createCoffee(uniq(`On the shelf ${i}`), {
      roasterId: roaster.id,
    })
    await asUser.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinder.id,
      brewingDeviceId: espressoDevice,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '18',
    })
  }

  await expireGrants(USER)

  const otherGrinder = await asOther.grinder.create({
    name: uniqOther('Other grinder'),
    brand: 'Other',
  })
  const otherTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const otherDevice = await asOther.brewingDevice.create({
    name: uniqOther('Other device'),
    brand: 'Other',
    typeId: otherTypeId,
  })
  const otherCoffee = await createOtherCoffee(uniqOther('Other coffee'))
  otherCoffeeId = otherCoffee.id
  otherShotId = (
    await asOther.espressoShot.create({
      coffeeId: otherCoffee.id,
      grinderId: otherGrinder.id,
      brewingDeviceId: otherDevice.id,
      dose: '22',
      yield: '44',
      time: 28,
      grindSetting: 'other-grind',
    })
  ).id
})

const sealedId = (method: MethodKey) => {
  const id = sealedBrewIds[method]
  if (!id) throw new Error(`No Sealed ${method} in the fixture`)
  return id
}

describe('account.export', () => {
  it('is not readable without a session', async () => {
    await expect(anonCaller.account.export()).rejects.toThrow(/unauthorized/i)
  })

  it('includes a Free user’s Sealed Brews in full, for every method', async () => {
    const espressoFeed = await asUser.espressoShot.getAll()
    const sealedOnFeed = espressoFeed.find(
      (shot) => shot.id === sealedId('espressoShot'),
    )
    expect(sealedOnFeed?.sealed).toBe(true)
    expect(sealedOnFeed?.dose).toBe(null)

    const exported = await asUser.account.export()

    expect(exported.user.id).toBe(USER)
    expect(exported.user.email).toBe(`${USER}@example.com`)
    expect(exported.coffees.map((coffee) => coffee.id)).toContain(
      fallenCoffeeId,
    )

    const espresso = exported.brews.espresso.find(
      (brew) => brew.id === sealedId('espressoShot'),
    )
    expect(espresso?.dose).toBe('17')
    expect(espresso?.yield).toBe('34')
    expect(espresso?.grindSetting).toBe('sealed-grind')

    const aeropress = exported.brews.aeropress.find(
      (brew) => brew.id === sealedId('aeropressBrew'),
    )
    expect(aeropress?.dose).toBe('16')
    expect(aeropress?.water).toBe('240')

    const pourover = exported.brews.pourover.find(
      (brew) => brew.id === sealedId('pouroverBrew'),
    )
    expect(pourover?.dose).toBe('15')
    expect(pourover?.water).toBe('250')
    expect(pourover?.brewTime).toBe(165)

    const frenchPress = exported.brews.frenchPress.find(
      (brew) => brew.id === sealedId('frenchpressBrew'),
    )
    expect(frenchPress?.dose).toBe('18')
    expect(frenchPress?.water).toBe('270')
    expect(frenchPress?.steepTime).toBe(240)

    const coldBrew = exported.brews.coldBrew.find(
      (brew) => brew.id === sealedId('coldBrewBrew'),
    )
    expect(coldBrew?.dose).toBe('19')
    expect(coldBrew?.water).toBe('300')
    expect(coldBrew?.steepTime).toBe(1080)
  })

  it('does not include another user’s Coffees or Brews', async () => {
    const own = await asUser.account.export()
    const other = await asOther.account.export()

    expect(own.coffees.map((coffee) => coffee.id)).not.toContain(otherCoffeeId)
    expect(own.brews.espresso.map((brew) => brew.id)).not.toContain(otherShotId)
    expect(own.user.id).toBe(USER)

    expect(other.coffees.map((coffee) => coffee.id)).not.toContain(
      fallenCoffeeId,
    )
    expect(other.brews.espresso.map((brew) => brew.id)).not.toContain(
      sealedId('espressoShot'),
    )
    expect(other.coffees.map((coffee) => coffee.id)).toContain(otherCoffeeId)
    expect(other.user.id).toBe(OTHER)
  })
})
