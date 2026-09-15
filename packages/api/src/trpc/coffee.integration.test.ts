import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, countries } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  UNKNOWN_UUID,
  callerFor,
  createCoffeeFor,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

const USER_A = 'coffee-user-a'
const USER_B = 'coffee-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)
const createCoffee = createCoffeeFor(asA, uniq)

// An espresso device + grinder are needed to create the reference shot that
// coffee.setDialedIn points at. Device types are globally unique, so reuse an
// existing "Espresso" row or create one and remember to drop it.
let espressoDeviceId: string
let grinderId: string
let createdDeviceTypeId: string | null = null
let coffeeAId: string

seedUsers([USER_A, USER_B], async () => {
  if (createdDeviceTypeId) {
    await db
      .delete(brewingDeviceTypes)
      .where(eq(brewingDeviceTypes.id, createdDeviceTypeId))
  }
})

beforeAll(async () => {
  const existingType = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, ESPRESSO_DEVICE_TYPE))
  if (!existingType[0]) {
    const [row] = await db
      .insert(brewingDeviceTypes)
      .values({ name: ESPRESSO_DEVICE_TYPE })
      .returning()
    createdDeviceTypeId = row.id
  }
  const typeId = existingType[0]?.id ?? createdDeviceTypeId!

  const device = await asA.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  espressoDeviceId = device.id

  const grinder = await asA.grinder.create({ name: uniq('Niche'), brand: 'Niche' })
  grinderId = grinder.id

  const coffee = await createCoffee(uniq('Owned by A'))
  coffeeAId = coffee.id
})

describe('coffee.getById', () => {
  it('returns the user’s coffee', async () => {
    const created = await createCoffee(uniq('GetById'))
    const found = await asA.coffee.getById(created.id)
    expect(found.id).toBe(created.id)
    expect(found.userId).toBe(USER_A)
    expect(found.origins).toEqual([])
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.coffee.getById(UNKNOWN_UUID)).rejects.toThrow(/not found/i)
  })

  it('does not return another user’s coffee', async () => {
    await expect(asB.coffee.getById(coffeeAId)).rejects.toThrow(/not found/i)
  })
})

describe('coffee.create', () => {
  it('stores multiple origin countries on a blend, one region each', async () => {
    const ethiopia = await asA.country.create({ name: uniq('Ethiopia') })
    const colombia = await asA.country.create({ name: uniq('Colombia') })
    const guji = await asA.region.create({
      name: uniq('Guji'),
      countryId: ethiopia.id,
    })
    const huila = await asA.region.create({
      name: uniq('Huila'),
      countryId: colombia.id,
    })
    const created = await createCoffee(uniq('House Blend'), {
      origins: [
        { countryId: ethiopia.id, regionId: guji.id },
        { countryId: colombia.id, regionId: huila.id },
      ],
    })
    const found = await asA.coffee.getById(created.id)
    expect(found.origins).toHaveLength(2)
    const byCountry = new Map(
      found.origins.map((origin) => [origin.countryId, origin.regionId]),
    )
    expect(byCountry.get(ethiopia.id)).toBe(guji.id)
    expect(byCountry.get(colombia.id)).toBe(huila.id)
  })

  it('stores a single origin country on a coffee that is not a blend', async () => {
    const country = await asA.country.create({ name: uniq('Ethiopia') })
    const created = await createCoffee(uniq('Ethiopia Guji'), {
      origins: [{ countryId: country.id }],
    })
    const found = await asA.coffee.getById(created.id)
    expect(found.origins).toEqual([
      expect.objectContaining({ countryId: country.id, regionId: null }),
    ])
  })

  it('rejects listing the same country twice', async () => {
    const country = await asA.country.create({ name: uniq('Ethiopia') })
    await expect(
      createCoffee(uniq('Twice'), {
        origins: [{ countryId: country.id }, { countryId: country.id }],
      }),
    ).rejects.toThrow(/country only once/i)
  })

  it('creates a coffee with no origin countries', async () => {
    const created = await createCoffee(uniq('Ethiopia Guji'))
    const found = await asA.coffee.getById(created.id)
    expect(found.origins).toEqual([])
  })

  it('rejects another user’s private country', async () => {
    const hidden = await asB.country.create({ name: uniq('Hidden Land') })
    await expect(
      createCoffee(uniq('Stolen origin'), {
        origins: [{ countryId: hidden.id }],
      }),
    ).rejects.toThrow(/country not found/i)
  })

  it('rejects another user’s private region', async () => {
    const country = await asA.country.create({ name: uniq('Ethiopia') })
    const otherCountry = await asB.country.create({ name: uniq('Colombia') })
    const hiddenRegion = await asB.region.create({
      name: uniq('Secret'),
      countryId: otherCountry.id,
    })
    await expect(
      createCoffee(uniq('Stolen region'), {
        origins: [{ countryId: country.id, regionId: hiddenRegion.id }],
      }),
    ).rejects.toThrow(/region not found/i)
  })

  it('rejects a region that belongs to a different country', async () => {
    const ethiopia = await asA.country.create({ name: uniq('Ethiopia') })
    const colombia = await asA.country.create({ name: uniq('Colombia') })
    const huila = await asA.region.create({
      name: uniq('Huila'),
      countryId: colombia.id,
    })
    await expect(
      createCoffee(uniq('Mismatched region'), {
        origins: [{ countryId: ethiopia.id, regionId: huila.id }],
      }),
    ).rejects.toThrow(/belong to its origin country/i)
  })

  it('accepts a shared country', async () => {
    const [shared] = await db
      .insert(countries)
      .values({ name: uniq('Shared Land') })
      .returning()
    try {
      const created = await createCoffee(uniq('Shared origin'), {
        origins: [{ countryId: shared.id }],
      })
      const found = await asA.coffee.getById(created.id)
      expect(found.origins).toEqual([
        expect.objectContaining({ countryId: shared.id, regionId: null }),
      ])
    } finally {
      await db.delete(countries).where(eq(countries.id, shared.id))
    }
  })

  it('rejects a second coffee with the same roaster and name', async () => {
    const name = uniq('House Blend')
    const first = await createCoffee(name)
    await expect(
      asA.coffee.create({
        name,
        roasterId: first.roasterId!,
        roastLevelId: first.roastLevelId!,
      }),
    ).rejects.toThrow(/already exists/i)
  })

  it('allows the same name from a different roaster', async () => {
    const name = uniq('House Blend')
    const first = await createCoffee(name)
    const otherRoaster = await asA.roaster.create({ name: uniq('Other') })
    const second = await asA.coffee.create({
      name,
      roasterId: otherRoaster.id,
      roastLevelId: first.roastLevelId!,
    })
    expect(second.id).not.toBe(first.id)
    expect(second.name).toBe(name)
  })

  it('returns CONFLICT when two creates race on the same roaster and name', async () => {
    const seed = await createCoffee(uniq('Race seed'))
    const name = uniq('Raced Blend')
    const payload = {
      name,
      roasterId: seed.roasterId!,
      roastLevelId: seed.roastLevelId!,
    }
    const results = await Promise.allSettled([
      asA.coffee.create(payload),
      asA.coffee.create(payload),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/already exists/i),
    })
  })
})

describe('coffee.update', () => {
  it('updates fields and never moves updatedAt before createdAt', async () => {
    const created = await createCoffee(uniq('Before'))
    // On creation updatedAt defaults to the creation time.
    expect(new Date(created.updatedAt).getTime()).toBe(
      new Date(created.createdAt).getTime(),
    )

    const newName = uniq('After')
    const updated = await asA.coffee.update({
      id: created.id,
      name: newName,
      roasterId: created.roasterId!,
      roastLevelId: created.roastLevelId!,
    })
    expect(updated.name).toBe(newName)
    // A JS Date truncates to milliseconds, which a fast update shares with createdAt.
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(updated.createdAt).getTime(),
    )
  })

  it('keeps stored origins when origins are omitted', async () => {
    const ethiopia = await asA.country.create({ name: uniq('Ethiopia') })
    const colombia = await asA.country.create({ name: uniq('Colombia') })
    const created = await createCoffee(uniq('Stay Origins'), {
      origins: [{ countryId: ethiopia.id }, { countryId: colombia.id }],
    })

    await asA.coffee.update({
      id: created.id,
      name: uniq('Renamed Origins'),
      roasterId: created.roasterId!,
      roastLevelId: created.roastLevelId!,
    })
    const found = await asA.coffee.getById(created.id)
    expect(found.origins.map((origin) => origin.countryId).sort()).toEqual(
      [ethiopia.id, colombia.id].sort(),
    )
  })

  it('replaces origins when they are provided', async () => {
    const ethiopia = await asA.country.create({ name: uniq('Ethiopia') })
    const colombia = await asA.country.create({ name: uniq('Colombia') })
    const created = await createCoffee(uniq('Swap Origins'), {
      origins: [{ countryId: ethiopia.id }],
    })

    await asA.coffee.update({
      id: created.id,
      name: created.name,
      roasterId: created.roasterId!,
      roastLevelId: created.roastLevelId!,
      origins: [{ countryId: colombia.id }],
    })
    const found = await asA.coffee.getById(created.id)
    expect(found.origins).toEqual([
      expect.objectContaining({ countryId: colombia.id, regionId: null }),
    ])
  })

  it('rejects renaming onto another coffee of the same roaster', async () => {
    const taken = await createCoffee(uniq('Taken'))
    const other = await createCoffee(uniq('Other'))
    await expect(
      asA.coffee.update({
        id: other.id,
        name: taken.name,
        roasterId: taken.roasterId!,
        roastLevelId: other.roastLevelId!,
      }),
    ).rejects.toThrow(/already exists/i)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.coffee.update({
        id: UNKNOWN_UUID,
        name: uniq('Nope'),
        roasterId: UNKNOWN_UUID,
        roastLevelId: UNKNOWN_UUID,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s coffee', async () => {
    await expect(
      asB.coffee.update({
        id: coffeeAId,
        name: uniq('Hijack'),
        roasterId: UNKNOWN_UUID,
        roastLevelId: UNKNOWN_UUID,
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('coffee.delete', () => {
  it('deletes the user’s coffee', async () => {
    const created = await createCoffee(uniq('ToDelete'))
    const deleted = await asA.coffee.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.coffee.getById(created.id)).rejects.toThrow(/not found/i)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.coffee.delete(UNKNOWN_UUID)).rejects.toThrow(/not found/i)
  })

  it('will not delete another user’s coffee', async () => {
    await expect(asB.coffee.delete(coffeeAId)).rejects.toThrow(/not found/i)
    // The owner can still retrieve it afterward.
    expect((await asA.coffee.getById(coffeeAId)).id).toBe(coffeeAId)
  })
})

describe('coffee.getAll', () => {
  it('orders coffees by updatedAt, most recently updated first', async () => {
    const first = await createCoffee(uniq('Order First'))
    const second = await createCoffee(uniq('Order Second'))
    // Touch `first` so it becomes the most recently updated of the pair.
    await asA.coffee.update({
      id: first.id,
      name: uniq('Order First Updated'),
      roasterId: first.roasterId!,
      roastLevelId: first.roastLevelId!,
    })

    const all = await asA.coffee.getAll()
    const firstIdx = all.findIndex((c) => c.id === first.id)
    const secondIdx = all.findIndex((c) => c.id === second.id)
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(secondIdx).toBeGreaterThanOrEqual(0)
    expect(firstIdx).toBeLessThan(secondIdx)

    // The whole list is non-increasing by updatedAt.
    const times = all.map((c) => new Date(c.updatedAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('scopes results to the requesting user', async () => {
    const all = await asB.coffee.getAll()
    expect(all.every((c) => c.userId === USER_B)).toBe(true)
    expect(all.some((c) => c.id === coffeeAId)).toBe(false)
  })
})

describe('coffee.getRecent', () => {
  it('paginates the user’s coffees', async () => {
    for (let i = 0; i < 3; i++) {
      await createCoffee(uniq(`Recent ${i}`))
    }
    const page1 = await asA.coffee.getRecent({ limit: 2, offset: 0 })
    expect(page1.items.length).toBe(2)
    expect(page1.total).toBeGreaterThanOrEqual(3)

    const page2 = await asA.coffee.getRecent({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)
  })
})

describe('coffee.setDialedIn', () => {
  it('sets and clears the dialed-in shot', async () => {
    const coffee = await createCoffee(uniq('Dial-in'))
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
    })

    await asA.coffee.setDialedIn({ coffeeId: coffee.id, shotId: shot.id })
    const afterSet = await asA.coffee.getAll()
    expect(afterSet.find((c) => c.id === coffee.id)?.dialedInShot?.id).toBe(
      shot.id,
    )

    await asA.coffee.setDialedIn({ coffeeId: coffee.id, shotId: null })
    const afterClear = await asA.coffee.getAll()
    expect(
      afterClear.find((c) => c.id === coffee.id)?.dialedInShot,
    ).toBeNull()
  })

  it('will not dial in a coffee owned by another user', async () => {
    // coffeeAId belongs to USER_A; as USER_B the scoped update matches nothing.
    const result = await asB.coffee.setDialedIn({
      coffeeId: coffeeAId,
      shotId: null,
    })
    expect(result).toBeUndefined()
  })
})
