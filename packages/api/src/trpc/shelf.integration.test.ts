import { beforeAll, describe, expect, it } from 'vitest'
import { count, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, espressoShots } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  callerFor,
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

let grinderId: string
let deviceId: string
let roasterId: string
// The six Coffees, oldest-brewed first. coffees[0] is the one that falls off.
const coffees: Array<{ id: string; name: string; shotId: string }> = []

async function logShot(coffeeId: string) {
  const shot = await asUser.espressoShot.create({
    coffeeId,
    grinderId,
    brewingDeviceId: deviceId,
    dose: '18',
    yield: '36',
    time: 28,
  })
  return shot.id
}

beforeAll(async () => {
  const typeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
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
    const coffee = await asUser.coffee.create({ name, roasterId })
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
    const coffee = await asUser.coffee.create({
      name: uniq('Just added'),
      roasterId,
    })
    const shotId = await logShot(coffee.id)

    expect((await shotById(shotId)).sealed).toBe(false)
  })
})

describe('Sealing and the Plan', () => {
  it('withholds a Sealed shot from the dial-ins', async () => {
    const sealedShot = await shotById(coffees[1].shotId)
    expect(sealedShot.sealed).toBe(true)

    const dialedIn = await asUser.espressoShot.getDialedIn()
    expect(dialedIn.some((shot) => shot.id === coffees[1].shotId)).toBe(false)
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
    // Six coffees seeded with one shot each, plus the two logged above.
    expect(Number(total)).toBe(8)
  })

  it('still lets a Free user log and edit whatever they like', async () => {
    const coffee = await asUser.coffee.create({
      name: uniq('Logging is free'),
      roasterId,
    })
    const shotId = await logShot(coffee.id)

    const updated = await asUser.espressoShot.update({
      id: shotId,
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: deviceId,
      dose: '20',
      yield: '40',
      time: 30,
    })
    expect(updated.dose).toBe('20')
  })
})

describe('every espresso read path', () => {
  it('withholds a Sealed dial-in from the coffee list too', async () => {
    const list = await asUser.coffee.getAll()
    const sealedCoffee = list.find((coffee) => coffee.id === coffees[1].id)

    expect(sealedCoffee?.dialedInShot ?? null).toBe(null)
  })

  it('withholds a Sealed shot fetched on its own', async () => {
    const shot = await asUser.espressoShot.getById(coffees[1].shotId)

    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)
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
        dose: null,
        yield: null,
        time: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const [stored] = await db
      .select({ dose: espressoShots.dose })
      .from(espressoShots)
      .where(eq(espressoShots.id, coffees[1].shotId))
    expect(stored.dose).toBe('18')
  })
})
