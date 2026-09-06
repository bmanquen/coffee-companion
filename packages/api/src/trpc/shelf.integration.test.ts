import { beforeAll, describe, expect, it, vi } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  batchedCallerFor,
  callerFor,
  createCoffeeFor,
  deviceTypes,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

// The Shelf and Sealing, observed through the espresso feeds. A Free user reads
// the Brews of their five most-recently-brewed Coffees; what falls off is
// Sealed — still returned, without its settings.
const USER = 'shelf-user'
const asUser = callerFor(USER)
const uniq = uniqFor(USER)
const createCoffee = createCoffeeFor(asUser, uniq)

// A second user for the promotion tests at the foot of this file, so they build
// their own Shelf instead of inheriting the one the tests above have churned.
const PROMOTED = 'shelf-promoted-user'
const asPromoted = callerFor(PROMOTED)
const uniqPromoted = uniqFor(PROMOTED)
const createPromotedCoffee = createCoffeeFor(asPromoted, uniqPromoted)

const types = deviceTypes()

seedUsers([USER, PROMOTED], types.cleanup)

let grinderId: string
let deviceId: string
let roasterId: string
// The six Coffees, oldest-brewed first. coffees[0] is the one that falls off.
const coffees: Array<{ id: string; name: string; shotId: string }> = []

// Counted rather than hard-coded, so an earlier failure doesn't fail this too.
let shotsLogged = 0

async function logShot(coffeeId: string) {
  const shot = await asUser.espressoShot.create({
    coffeeId,
    grinderId,
    brewingDeviceId: deviceId,
    dose: '18',
    yield: '36',
    time: 28,
    grindSetting: '1.5',
  })
  shotsLogged++
  return shot.id
}

beforeAll(async () => {
  const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
  const device = await asUser.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  deviceId = device.id
  const grinder = await asUser.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  grinderId = grinder.id
  const roaster = await asUser.roaster.create({ name: uniq('Sey') })
  roasterId = roaster.id

  // Six Coffees, each brewed once, oldest first — so the Shelf holds the last
  // five and coffees[0] falls off it.
  for (let i = 0; i < 6; i++) {
    const name = uniq(`Coffee ${i}`)
    const coffee = await createCoffee(name, { roasterId })
    const shotId = await logShot(coffee.id)
    coffees.push({ id: coffee.id, name, shotId })
  }

  // Dial in the shot that will later Seal. It has to happen now: once Sealed, a
  // Brew can no longer be made the reference to reproduce.
  await asUser.coffee.setDialedIn({
    coffeeId: coffees[1].id,
    shotId: coffees[1].shotId,
  })
})

const shotById = async (id: string) => {
  const all = await asUser.espressoShot.getAll()
  const found = all.find((shot) => shot.id === id)
  if (!found) throw new Error(`Shot ${id} missing from the feed entirely`)
  return found
}

describe('the Shelf on Free', () => {
  it('reads the shots of the five most-recently-brewed coffees', async () => {
    for (const coffee of coffees.slice(1)) {
      const shot = await shotById(coffee.shotId)
      expect(shot.sealed).toBe(false)
      expect(shot.dose).toBe('18')
    }
  })

  it('Seals the shots of a coffee that has fallen off, without dropping them', async () => {
    const shot = await shotById(coffees[0].shotId)

    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)
    expect(shot.time).toBe(null)
    // Still identifiable: the user can see the shot exists, and on which coffee.
    expect(shot.coffee.name).toBe(coffees[0].name)
  })
})

describe('a Coffee off the Shelf', () => {
  it('is still fully usable, and a new shot on it reads straight away', async () => {
    const fallen = coffees[0]
    const freshShotId = await logShot(fallen.id)

    const fresh = await shotById(freshShotId)
    expect(fresh.sealed).toBe(false)
    expect(fresh.dose).toBe('18')
  })

  it('keeps the shots Sealed earlier Sealed — brewing again never reopens them', async () => {
    const original = await shotById(coffees[0].shotId)
    expect(original.sealed).toBe(true)
    expect(original.dose).toBe(null)
  })

  it('never Seals a coffee on arrival', async () => {
    const coffee = await createCoffee(uniq('Just added'), { roasterId })
    const shotId = await logShot(coffee.id)

    expect((await shotById(shotId)).sealed).toBe(false)
  })
})

describe('Sealing and the Plan', () => {
  it('withholds a Sealed shot from the dial-ins without dropping it', async () => {
    const dialedIn = await asUser.espressoShot.getDialedIn()
    const shot = dialedIn.find((row) => row.id === coffees[1].shotId)

    // Still the coffee's reference shot, just not a readable one.
    expect(shot?.sealed).toBe(true)
    expect(shot?.dose).toBe(null)
  })

  it('reopens every Sealed shot the moment the Plan is paid, with no writes', async () => {
    const before = await db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))

    await grantPlan(USER, 'pro')

    const all = await asUser.espressoShot.getAll()
    expect(all.every((shot) => shot.sealed === false)).toBe(true)
    expect(all.every((shot) => shot.dose === '18')).toBe(true)

    // Reopening is a matter of the Plan, not of unstamping: the stamps are
    // untouched, so nothing was written to reopen them.
    const after = await db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))
    expect(after).toEqual(before)
  })

  it('re-Seals what falls off when the Grant expires, with no event to react to', async () => {
    await expireGrants(USER)

    expect((await shotById(coffees[1].shotId)).sealed).toBe(true)
  })

  it('never re-stamps a Brew it has already Sealed', async () => {
    const stampOf = async (id: string) =>
      (
        await db
          .select({ sealedAt: espressoShots.sealedAt })
          .from(espressoShots)
          .where(eq(espressoShots.id, id))
      )[0].sealedAt

    const first = await stampOf(coffees[1].shotId)
    await asUser.espressoShot.getAll()
    await asUser.espressoShot.getAll()

    expect(await stampOf(coffees[1].shotId)).toEqual(first)
  })

  it('deletes nothing, whatever the Plan', async () => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))
    expect(Number(total)).toBe(shotsLogged)
  })

  it('still lets a Free user log and edit whatever they like', async () => {
    const coffee = await createCoffee(uniq('Logging is free'), { roasterId })
    const shotId = await logShot(coffee.id)

    const updated = await asUser.espressoShot.update({
      id: shotId,
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: deviceId,
      dose: '20',
      yield: '40',
      time: 30,
      grindSetting: '1.5',
    })
    expect(updated.dose).toBe('20')
  })
})

describe('every espresso read path', () => {
  it('withholds a Sealed dial-in from the coffee list too', async () => {
    const list = await asUser.coffee.getAll()
    const sealedCoffee = list.find((coffee) => coffee.id === coffees[1].id)

    // Reported, not omitted: a coffee whose dial-in is Sealed must not read as
    // one that was never dialed in.
    expect(sealedCoffee?.dialedInShot?.sealed).toBe(true)
    expect(sealedCoffee?.dialedInShot?.dose).toBe(null)
  })

  it('withholds a Sealed shot fetched on its own', async () => {
    const shot = await asUser.espressoShot.getById(coffees[1].shotId)

    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)
  })
})

// Reading is the Shelf compared against, not a repair pass that has to have run
// first. These run last: the first one clears every stamp, which is a state no
// earlier test should inherit.
describe('reading needs no prior write', () => {
  const stamps = async () =>
    db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))

  it('withholds a shot off the Shelf that carries no stamp, and stamps nothing to do it', async () => {
    await db
      .update(espressoShots)
      .set({ sealedAt: null })
      .where(eq(espressoShots.userId, USER))

    const shot = await shotById(coffees[1].shotId)
    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)

    expect((await stamps()).every((row) => row.sealedAt === null)).toBe(true)
  })

  it('stamps when a shot is logged, so a coffee returning to the Shelf reopens nothing', async () => {
    // Logging is the only way a coffee comes back onto the Shelf, so it is the
    // one place Sealing has to be made permanent.
    await logShot(coffees[1].id)

    const original = await shotById(coffees[1].shotId)
    expect(original.sealed).toBe(true)
    expect(original.dose).toBe(null)
  })

  it('computes the Shelf once for a request that reads several feeds', async () => {
    // What a dashboard load looks like: tRPC batches its feeds into one HTTP
    // request, so they share one context. The Shelf query is the only
    // db.execute in the API — drizzle's relational queries run through the
    // session instead — so counting them counts Shelf computations.
    const inOneRequest = batchedCallerFor(USER)
    const execute = vi.spyOn(db, 'execute')
    try {
      await Promise.all([
        inOneRequest.espressoShot.getAll(),
        inOneRequest.espressoShot.getDialedIn(),
        inOneRequest.espressoShot.getRecent({ limit: 10, offset: 0 }),
        inOneRequest.coffee.getAll(),
      ])
      expect(execute).toHaveBeenCalledTimes(1)
    } finally {
      execute.mockRestore()
    }
  })
})

describe('a Sealed shot', () => {
  it('cannot be saved over, so the withheld settings survive', async () => {
    await expect(
      asUser.espressoShot.update({
        id: coffees[1].shotId,
        coffeeId: coffees[1].id,
        grinderId,
        brewingDeviceId: deviceId,
        dose: '99',
        yield: '99',
        time: 99,
        grindSetting: 'hacked',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const [stored] = await db
      .select({ dose: espressoShots.dose })
      .from(espressoShots)
      .where(eq(espressoShots.id, coffees[1].shotId))
    expect(stored.dose).toBe('18')
  })
})

// Sealing is one-way, so anything that can promote a Coffee back onto the Shelf
// has to Seal what is already off it first. Logging a Brew is the obvious one.
// The ones easy to miss are the deletions: removing whatever displaced a Coffee
// hands it back its old slot, and with it every Brew it was withheld for.
describe('a Coffee promoted back onto the Shelf', () => {
  let promotedGrinder: string
  let promotedDevice: string
  let promotedRoaster: string

  const logPromotedShot = async (coffeeId: string) =>
    (
      await asPromoted.espressoShot.create({
        coffeeId,
        grinderId: promotedGrinder,
        brewingDeviceId: promotedDevice,
        dose: '18',
        yield: '36',
        time: 28,
        grindSetting: '1.5',
      })
    ).id

  const addCoffee = async (label: string) =>
    (
      await createPromotedCoffee(uniqPromoted(label), {
        roasterId: promotedRoaster,
      })
    ).id

  const promotedShotById = async (id: string) => {
    const all = await asPromoted.espressoShot.getAll()
    const found = all.find((shot) => shot.id === id)
    if (!found) throw new Error(`Shot ${id} missing from the feed entirely`)
    return found
  }

  beforeAll(async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    promotedDevice = (
      await asPromoted.brewingDevice.create({
        name: uniqPromoted('Linea Mini'),
        brand: 'La Marzocco',
        typeId,
      })
    ).id
    promotedGrinder = (
      await asPromoted.grinder.create({
        name: uniqPromoted('Niche Zero'),
        brand: 'Niche',
      })
    ).id
    promotedRoaster = (await asPromoted.roaster.create({ name: uniqPromoted('Sey') })).id
  })

  it('stays Sealed when the Coffee that displaced it is deleted', async () => {
    const displaced = await addCoffee('Displaced')
    const displacedShot = await logPromotedShot(displaced)

    // Coffees with no Brews, which rank by when they were added — so these
    // displace it without a Brew ever being logged, and nothing stamps.
    const displacers: Array<string> = []
    for (let i = 0; i < 5; i++) displacers.push(await addCoffee(`Displacer ${i}`))
    expect((await promotedShotById(displacedShot)).sealed).toBe(true)

    // Deleting one hands the displaced Coffee its slot back.
    await asPromoted.coffee.delete(displacers[0])

    expect((await promotedShotById(displacedShot)).sealed).toBe(true)
  })

  it('stays Sealed when the Brew that displaced it is deleted', async () => {
    // A Coffee outranks another by its last Brew, so deleting that Brew drops it
    // back to when it was added — and promotes whatever was sitting beneath it.
    const jumper = await addCoffee('Jumper')
    const displaced = await addCoffee('Displaced by a brew')
    const displacedShot = await logPromotedShot(displaced)
    // Brewed after it was added, so the jumper now outranks the displaced Coffee.
    const jumperShot = await logPromotedShot(jumper)

    // Four more Coffees with no Brews push the displaced one off the Shelf,
    // again with no Brew logged to stamp it.
    for (let i = 0; i < 4; i++) await addCoffee(`Filler ${i}`)
    expect((await promotedShotById(displacedShot)).sealed).toBe(true)

    // The jumper falls back below it, handing its slot to the displaced Coffee.
    await asPromoted.espressoShot.delete(jumperShot)

    expect((await promotedShotById(displacedShot)).sealed).toBe(true)
  })
})
