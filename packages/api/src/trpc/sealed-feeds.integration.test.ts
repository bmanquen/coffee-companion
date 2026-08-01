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
  callerFor,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import { trpcRouter } from './router'

// The anti-forgetting test. Sealing is applied per procedure, so a Brew feed
// can leak simply by nobody remembering it. This enumerates every
// Brew-returning feed of every method and asserts each one withholds a Sealed
// Brew — add a method or a feed without sealing it and this fails.
const USER = 'sealed-feeds-user'
const asUser = callerFor(USER)
const uniq = uniqFor(USER)

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

seedUsers([USER], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

// Every Brew-returning feed in the app, keyed by the router that owns it. The
// sealed Brew id is captured in beforeAll.
const methods = [
  'espressoShot',
  'aeropressBrew',
  'pouroverBrew',
  'frenchpressBrew',
  'coldBrewBrew',
] as const
type MethodKey = (typeof methods)[number]

const sealedBrewIds: Partial<Record<MethodKey, string>> = {}
// A readable dial-in on a Coffee still on the Shelf, so the dial-in assertions
// below cannot pass simply because the feed came back empty.
const readableBrewIds: Partial<Record<MethodKey, string>> = {}

beforeAll(async () => {
  // A paid Plan first: five devices is more than Free holds, and the point is a
  // subscriber whose Plan later lapses.
  await grantPlan(USER, 'pro', { reason: 'sealed feeds fixture' })

  const grinder = await asUser.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  const roaster = await asUser.roaster.create({ name: uniq('Sey') })

  const device = async (typeName: string) => {
    const typeId = await findOrCreateDeviceType(typeName)
    const row = await asUser.brewingDevice.create({
      name: uniq(typeName),
      brand: 'Brand',
      typeId,
    })
    return row.id
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

  // The Coffee that will fall off the Shelf, brewed once with every method.
  const fallen = await asUser.coffee.create({
    name: uniq('Falls off'),
    roasterId: roaster.id,
  })
  const base = { coffeeId: fallen.id, grinderId: grinder.id }

  sealedBrewIds.espressoShot = (
    await asUser.espressoShot.create({
      ...base,
      brewingDeviceId: espressoDevice,
      dose: '18',
    })
  ).id
  sealedBrewIds.aeropressBrew = (
    await asUser.aeropressBrew.create({
      ...base,
      brewingDeviceId: aeropressDevice,
      methodId: aeroMethod.id,
      dose: '18',
    })
  ).id
  sealedBrewIds.pouroverBrew = (
    await asUser.pouroverBrew.create({
      ...base,
      brewingDeviceId: pouroverDevice,
      methodId: pourMethod.id,
      dose: '18',
    })
  ).id
  sealedBrewIds.frenchpressBrew = (
    await asUser.frenchpressBrew.create({
      ...base,
      brewingDeviceId: frenchpressDevice,
      methodId: frenchMethod.id,
      dose: '18',
    })
  ).id
  sealedBrewIds.coldBrewBrew = (
    await asUser.coldBrewBrew.create({
      ...base,
      brewingDeviceId: coldBrewDevice,
      dose: '18',
    })
  ).id

  // Dial each one in. isDialedIn is not settable on create — it has its own
  // mutation per method — and setting it matters here: an undialed fixture
  // would make the dial-in assertions below pass for the wrong reason.
  await asUser.coffee.setDialedIn({
    coffeeId: fallen.id,
    shotId: sealedBrewIds.espressoShot,
  })
  await asUser.aeropressBrew.setDialedIn({
    coffeeId: fallen.id,
    methodId: aeroMethod.id,
    brewId: sealedBrewIds.aeropressBrew,
  })
  await asUser.pouroverBrew.setDialedIn({
    coffeeId: fallen.id,
    methodId: pourMethod.id,
    brewId: sealedBrewIds.pouroverBrew,
  })
  await asUser.frenchpressBrew.setDialedIn({
    coffeeId: fallen.id,
    methodId: frenchMethod.id,
    brewId: sealedBrewIds.frenchpressBrew,
  })
  await asUser.coldBrewBrew.setDialedIn({
    coffeeId: fallen.id,
    brewId: sealedBrewIds.coldBrewBrew,
  })

  // Five more Coffees, each brewed after it, so the one above falls off a
  // five-Coffee Shelf.
  for (let i = 0; i < 5; i++) {
    const coffee = await asUser.coffee.create({
      name: uniq(`On the shelf ${i}`),
      roasterId: roaster.id,
    })
    await asUser.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinder.id,
      brewingDeviceId: espressoDevice,
      dose: '18',
    })
  }

  // One Coffee that stays on the Shelf, brewed and dialed in with every method.
  const kept = await asUser.coffee.create({
    name: uniq('Stays on the shelf'),
    roasterId: roaster.id,
  })
  const keptBase = { coffeeId: kept.id, grinderId: grinder.id, dose: '21' }

  readableBrewIds.espressoShot = (
    await asUser.espressoShot.create({
      ...keptBase,
      brewingDeviceId: espressoDevice,
    })
  ).id
  readableBrewIds.aeropressBrew = (
    await asUser.aeropressBrew.create({
      ...keptBase,
      brewingDeviceId: aeropressDevice,
      methodId: aeroMethod.id,
    })
  ).id
  readableBrewIds.pouroverBrew = (
    await asUser.pouroverBrew.create({
      ...keptBase,
      brewingDeviceId: pouroverDevice,
      methodId: pourMethod.id,
    })
  ).id
  readableBrewIds.frenchpressBrew = (
    await asUser.frenchpressBrew.create({
      ...keptBase,
      brewingDeviceId: frenchpressDevice,
      methodId: frenchMethod.id,
    })
  ).id
  readableBrewIds.coldBrewBrew = (
    await asUser.coldBrewBrew.create({
      ...keptBase,
      brewingDeviceId: coldBrewDevice,
    })
  ).id

  await asUser.coffee.setDialedIn({
    coffeeId: kept.id,
    shotId: readableBrewIds.espressoShot,
  })
  await asUser.aeropressBrew.setDialedIn({
    coffeeId: kept.id,
    methodId: aeroMethod.id,
    brewId: readableBrewIds.aeropressBrew,
  })
  await asUser.pouroverBrew.setDialedIn({
    coffeeId: kept.id,
    methodId: pourMethod.id,
    brewId: readableBrewIds.pouroverBrew,
  })
  await asUser.frenchpressBrew.setDialedIn({
    coffeeId: kept.id,
    methodId: frenchMethod.id,
    brewId: readableBrewIds.frenchpressBrew,
  })
  await asUser.coldBrewBrew.setDialedIn({
    coffeeId: kept.id,
    brewId: readableBrewIds.coldBrewBrew,
  })

  // The Plan lapses: five devices are kept, and the Shelf shrinks to five.
  await expireGrants(USER)
})

// Reading through these rather than indexing directly means a fixture that
// failed to populate an id fails loudly instead of matching `undefined`.
const sealedId = (method: MethodKey) => {
  const id = sealedBrewIds[method]
  if (!id) throw new Error(`No Sealed ${method} in the fixture`)
  return id
}
const readableId = (method: MethodKey) => {
  const id = readableBrewIds[method]
  if (!id) throw new Error(`No readable ${method} in the fixture`)
  return id
}

describe.each(methods)('%s feeds', (method) => {
  const feedFor = () => asUser[method]

  it('withholds a Sealed brew from getAll', async () => {
    const all = await feedFor().getAll()
    const brew = all.find((row) => row.id === sealedId(method))

    expect(brew?.sealed).toBe(true)
    expect(brew?.dose).toBe(null)
  })

  it('withholds a Sealed brew from getRecent', async () => {
    const { items } = await feedFor().getRecent({ limit: 50, offset: 0 })
    const brew = items.find((row) => row.id === sealedId(method))

    expect(brew?.sealed).toBe(true)
    expect(brew?.dose).toBe(null)
  })

  it('withholds a Sealed brew from getById', async () => {
    const brew = await feedFor().getById(sealedId(method))

    expect(brew.sealed).toBe(true)
    expect(brew.dose).toBe(null)
  })

  it('drops a Sealed brew from the dial-ins, keeping the readable one', async () => {
    const dialedIn = await feedFor().getDialedIn()

    expect(dialedIn.some((row) => row.id === sealedId(method))).toBe(false)
    // The control: without this, an empty feed would satisfy the line above.
    expect(dialedIn.some((row) => row.id === readableId(method))).toBe(true)
  })
})

describe('the enumeration itself', () => {
  const paths = Object.keys(trpcRouter._def.procedures)

  it('covers every router that owns Brews', () => {
    // A Brew router is one that can dial a Brew in. Espresso's dial-in lives on
    // the coffee router, so it is named directly.
    const owners = new Set(
      paths
        .filter((path) => path.endsWith('.setDialedIn'))
        .map((path) => path.split('.')[0]),
    )
    owners.delete('coffee')
    owners.add('espressoShot')

    expect([...owners].sort()).toEqual([...methods].sort())
  })

  it('covers every read each of those routers exposes', () => {
    const asserted = new Set(['getAll', 'getRecent', 'getById', 'getDialedIn'])

    for (const method of methods) {
      const reads = paths
        .filter((path) => path.startsWith(`${method}.`))
        .map((path) => path.split('.')[1])
        .filter((name) => name.startsWith('get'))

      expect(reads.filter((name) => !asserted.has(name))).toEqual([])
    }
  })
})

describe.each(methods)('%s writes', (method) => {
  it('refuses to save over a Sealed brew', async () => {
    // A Sealed brew's own blanks fail validation, so this is the case that
    // matters: the user fills the form in and saves it over the Sealed one.
    const filledIn = await asUser[method].getById(readableId(method))

    await expect(
      asUser[method].update({ ...filledIn, id: sealedId(method) } as never),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
