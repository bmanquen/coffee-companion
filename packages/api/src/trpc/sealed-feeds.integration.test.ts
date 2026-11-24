import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, espressoShots } from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { FRENCH_PRESS_DEVICE_TYPE } from '../lib/frenchpress'
import { POUR_OVER_DEVICE_TYPE } from '../lib/pourover'
import {
  callerFor,
  createCoffeeFor,
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
const createCoffee = createCoffeeFor(asUser, uniq)

const createdTypeIds: Array<string> = []
async function findOrCreateDeviceType(name: string): Promise<string> {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    // A shared type only: another user's private one fails the visibility check.
    .where(
      and(eq(brewingDeviceTypes.name, name), isNull(brewingDeviceTypes.userId)),
    )
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
  const fallen = await createCoffee(uniq('Falls off'), {
    roasterId: roaster.id,
  })
  const base = { coffeeId: fallen.id, grinderId: grinder.id, grindSetting: '18' }

  sealedBrewIds.espressoShot = (
    await asUser.espressoShot.create({
      ...base,
      brewingDeviceId: espressoDevice,
      dose: '18',
      yield: '36',
      time: 30,
      idempotencyKey: crypto.randomUUID(),
    })
  ).id
  sealedBrewIds.aeropressBrew = (
    await asUser.aeropressBrew.create({
      ...base,
      brewingDeviceId: aeropressDevice,
      methodId: aeroMethod.id,
      dose: '18',
      water: '250',
      steepTime: 90,
    })
  ).id
  sealedBrewIds.pouroverBrew = (
    await asUser.pouroverBrew.create({
      ...base,
      brewingDeviceId: pouroverDevice,
      methodId: pourMethod.id,
      dose: '18',
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
      water: '250',
      steepTime: 240,
      waterTemp: 95,
    })
  ).id
  sealedBrewIds.coldBrewBrew = (
    await asUser.coldBrewBrew.create({
      ...base,
      brewingDeviceId: coldBrewDevice,
      dose: '18',
      water: '250',
      steepTime: 1080,
      brewEnvironment: 'Fridge',
    })
  ).id

  // Dial each one in. Membership is not settable on create — it has its own
  // mutation — and setting it matters here: an unmarked fixture would make the
  // dial-in assertions below pass for the wrong reason.
  await asUser.dialedInBrew.set({
    brewingMethod: 'espresso',
    brewingDeviceId: espressoDevice,
    brewId: sealedBrewIds.espressoShot,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'aeropress',
    brewingDeviceId: aeropressDevice,
    brewId: sealedBrewIds.aeropressBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'pourover',
    brewingDeviceId: pouroverDevice,
    brewId: sealedBrewIds.pouroverBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'frenchpress',
    brewingDeviceId: frenchpressDevice,
    brewId: sealedBrewIds.frenchpressBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'coldBrew',
    brewingDeviceId: coldBrewDevice,
    brewId: sealedBrewIds.coldBrewBrew,
  })

  // Five more Coffees, each brewed after it, so the one above falls off a
  // five-Coffee Shelf.
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
      idempotencyKey: crypto.randomUUID(),
    })
  }

  // One Coffee that stays on the Shelf, brewed and dialed in with every method.
  const kept = await createCoffee(uniq('Stays on the shelf'), {
    roasterId: roaster.id,
  })
  const keptBase = {
    coffeeId: kept.id,
    grinderId: grinder.id,
    dose: '21',
    grindSetting: '21',
  }

  readableBrewIds.espressoShot = (
    await asUser.espressoShot.create({
      ...keptBase,
      brewingDeviceId: espressoDevice,
      yield: '42',
      time: 28,
      idempotencyKey: crypto.randomUUID(),
    })
  ).id
  readableBrewIds.aeropressBrew = (
    await asUser.aeropressBrew.create({
      ...keptBase,
      brewingDeviceId: aeropressDevice,
      methodId: aeroMethod.id,
      water: '280',
      steepTime: 90,
    })
  ).id
  readableBrewIds.pouroverBrew = (
    await asUser.pouroverBrew.create({
      ...keptBase,
      brewingDeviceId: pouroverDevice,
      methodId: pourMethod.id,
      water: '350',
      brewTime: 165,
      waterTemp: 94,
    })
  ).id
  readableBrewIds.frenchpressBrew = (
    await asUser.frenchpressBrew.create({
      ...keptBase,
      brewingDeviceId: frenchpressDevice,
      methodId: frenchMethod.id,
      water: '350',
      steepTime: 240,
      waterTemp: 95,
    })
  ).id
  readableBrewIds.coldBrewBrew = (
    await asUser.coldBrewBrew.create({
      ...keptBase,
      brewingDeviceId: coldBrewDevice,
      water: '350',
      steepTime: 1080,
      brewEnvironment: 'Fridge',
    })
  ).id

  await asUser.dialedInBrew.set({
    brewingMethod: 'espresso',
    brewingDeviceId: espressoDevice,
    brewId: readableBrewIds.espressoShot,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'aeropress',
    brewingDeviceId: aeropressDevice,
    brewId: readableBrewIds.aeropressBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'pourover',
    brewingDeviceId: pouroverDevice,
    brewId: readableBrewIds.pouroverBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'frenchpress',
    brewingDeviceId: frenchpressDevice,
    brewId: readableBrewIds.frenchpressBrew,
  })
  await asUser.dialedInBrew.set({
    brewingMethod: 'coldBrew',
    brewingDeviceId: coldBrewDevice,
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

async function historyItems(method: MethodKey) {
  switch (method) {
    case 'espressoShot':
      return (await asUser.espressoShot.getRecent({ limit: 50 }))
        .items
    case 'aeropressBrew':
      return asUser.aeropressBrew.getAll()
    case 'pouroverBrew':
      return asUser.pouroverBrew.getAll()
    case 'frenchpressBrew':
      return asUser.frenchpressBrew.getAll()
    case 'coldBrewBrew':
      return asUser.coldBrewBrew.getAll()
  }
}

describe.each(methods)('%s feeds', (method) => {
  const feedFor = () => asUser[method]

  // Espresso's history is getRecent, checked below; the others still have getAll.
  it.skipIf(method === 'espressoShot')(
    'withholds a Sealed brew from the history feed',
    async () => {
      const all = await historyItems(method)
      const brew = all.find((row) => row.id === sealedId(method))

      expect(brew?.sealed).toBe(true)
      expect(brew?.dose).toBe(null)
    },
  )

  it('withholds a Sealed brew from getRecent', async () => {
    const { items } =
      method === 'espressoShot'
        ? await asUser.espressoShot.getRecent({ limit: 50 })
        : await asUser[method].getRecent({ limit: 50, offset: 0 })
    const brew = items.find((row) => row.id === sealedId(method))

    expect(brew?.sealed).toBe(true)
    expect(brew?.dose).toBe(null)
  })

  it('withholds a Sealed brew from getById', async () => {
    const brew = await feedFor().getById(sealedId(method))

    expect(brew.sealed).toBe(true)
    expect(brew.dose).toBe(null)
  })

  it('withholds a Sealed brew from the dial-ins without dropping it', async () => {
    const dialedIn = await feedFor().getDialedIn()
    const sealed = dialedIn.find((row) => row.id === sealedId(method))

    // Still the coffee's reference brew, just not a readable one.
    expect(sealed?.sealed).toBe(true)
    expect(sealed?.dose).toBe(null)

    // The control: without this, a blanket-blanking bug would satisfy the above.
    const readable = dialedIn.find((row) => row.id === readableId(method))
    expect(readable?.sealed).toBe(false)
    expect(readable?.dose).toBe('21')
  })
})

describe('espressoShot.getLatestUnsealed', () => {
  it('does not return a Sealed shot', async () => {
    const sealed = await asUser.espressoShot.getById(sealedId('espressoShot'))
    const found = await asUser.espressoShot.getLatestUnsealed({
      coffeeId: sealed.coffeeId,
    })
    expect(found).toBeNull()
  })

  it('skips a newer stamped shot on a Coffee still on the Shelf', async () => {
    // Off the Shelf, the Shelf guard alone returns null, so this needs a
    // Coffee on it to show the sealedAt filter at work.
    const readable = await asUser.espressoShot.getById(
      readableId('espressoShot'),
    )
    const [stamped] = await db
      .insert(espressoShots)
      .values({
        userId: USER,
        coffeeId: readable.coffeeId,
        grinderId: readable.grinderId!,
        brewingDeviceId: readable.brewingDeviceId!,
        grindSetting: 'stamped',
        dose: '19',
        yield: '38',
        time: 31,
        sealedAt: new Date(),
        // From the database's own clock, so the app clock cannot skew it
        // behind the readable shot.
        createdAt: sql`(SELECT ${espressoShots.createdAt} FROM ${espressoShots} WHERE ${espressoShots.id} = ${readable.id}) + interval '1 minute'`,
      })
      .returning({ id: espressoShots.id })
    try {
      const found = await asUser.espressoShot.getLatestUnsealed({
        coffeeId: readable.coffeeId,
      })
      expect(found?.id).toBe(readable.id)
      expect(found?.sealed).toBe(false)
    } finally {
      await db.delete(espressoShots).where(eq(espressoShots.id, stamped.id))
    }
  })
})

describe('the enumeration itself', () => {
  const procedures = trpcRouter._def.procedures as unknown as Record<
    string,
    { _def: { type: string } }
  >
  const paths = Object.keys(procedures)

  it('covers every router that owns Brews', () => {
    const owners = new Set(
      paths
        .filter((path) => path.endsWith('.getDialedIn'))
        .map((path) => path.split('.')[0]),
    )

    expect([...owners].sort()).toEqual([...methods].sort())
  })

  it('covers every read each of those routers exposes', () => {
    // Reads with Sealing tests on every Brew router, and reads tested on one
    // router only, named in full so another router's copy still fails.
    const assertedEverywhere = new Set(['getRecent', 'getById', 'getDialedIn'])
    const assertedOn = new Set([
      'espressoShot.getLatestUnsealed',
      'aeropressBrew.getAll',
      'pouroverBrew.getAll',
      'frenchpressBrew.getAll',
      'coldBrewBrew.getAll',
    ])

    for (const method of methods) {
      // Every query, whatever its name; mutations are checked elsewhere.
      const reads = paths
        .filter((path) => path.startsWith(`${method}.`))
        .filter((path) => procedures[path]._def.type === 'query')

      expect(
        reads.filter(
          (path) =>
            !assertedEverywhere.has(path.slice(method.length + 1)) &&
            !assertedOn.has(path),
        ),
      ).toEqual([])
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

  // createdAt ranks the Shelf and sealedAt Seals a Brew, so a client must
  // not be able to set either.
  it('ignores client-sent timestamps', async () => {
    const before = await asUser[method].getById(readableId(method))
    const forged = new Date('2099-01-01T00:00:00Z')

    await asUser[method].update({
      ...before,
      createdAt: forged,
      updatedAt: forged,
      sealedAt: forged,
    } as never)

    const after = await asUser[method].getById(readableId(method))
    expect(after.createdAt).toEqual(before.createdAt)
    expect(after.updatedAt.getTime()).toBeLessThan(forged.getTime())
    expect(after.sealedAt).toBeNull()
    expect(after.sealed).toBe(false)
  })
})
