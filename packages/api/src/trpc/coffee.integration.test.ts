import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'coffee-user-a'
const USER_B = 'coffee-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

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

  const coffee = await asA.coffee.create({ name: uniq('Owned by A') })
  coffeeAId = coffee.id
})

describe('coffee.getById', () => {
  it('returns the user’s coffee', async () => {
    const created = await asA.coffee.create({ name: uniq('GetById') })
    const found = await asA.coffee.getById(created.id)
    expect(found.id).toBe(created.id)
    expect(found.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.coffee.getById(UNKNOWN_UUID)).rejects.toThrow(/not found/i)
  })

  it('does not return another user’s coffee', async () => {
    await expect(asB.coffee.getById(coffeeAId)).rejects.toThrow(/not found/i)
  })
})

describe('coffee.update', () => {
  it('updates fields and bumps updatedAt past createdAt', async () => {
    const created = await asA.coffee.create({ name: uniq('Before') })
    // On creation updatedAt defaults to the creation time.
    expect(new Date(created.updatedAt).getTime()).toBe(
      new Date(created.createdAt).getTime(),
    )

    const newName = uniq('After')
    const updated = await asA.coffee.update({ id: created.id, name: newName })
    expect(updated.name).toBe(newName)
    // $onUpdate moves updatedAt forward on every update.
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(updated.createdAt).getTime(),
    )
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.coffee.update({ id: UNKNOWN_UUID, name: uniq('Nope') }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s coffee', async () => {
    await expect(
      asB.coffee.update({ id: coffeeAId, name: uniq('Hijack') }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('coffee.delete', () => {
  it('deletes the user’s coffee', async () => {
    const created = await asA.coffee.create({ name: uniq('ToDelete') })
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
    const first = await asA.coffee.create({ name: uniq('Order First') })
    const second = await asA.coffee.create({ name: uniq('Order Second') })
    // Touch `first` so it becomes the most recently updated of the pair.
    await asA.coffee.update({ id: first.id, name: uniq('Order First Updated') })

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
      await asA.coffee.create({ name: uniq(`Recent ${i}`) })
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
    const coffee = await asA.coffee.create({ name: uniq('Dial-in') })
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
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
