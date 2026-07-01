import { beforeAll, describe, expect, it } from 'vitest'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'grinder-user-a'
const USER_B = 'grinder-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

seedUsers([USER_A, USER_B])

let grinderAId: string

beforeAll(async () => {
  const grinder = await asA.grinder.create({
    name: uniq('Owned by A'),
    brand: 'Brand',
  })
  grinderAId = grinder.id
})

describe('grinder', () => {
  it('creates and lists a grinder, scoped to the user', async () => {
    const grinder = await asA.grinder.create({
      name: uniq('Grinder'),
      brand: 'Brand',
    })
    expect(grinder.userId).toBe(USER_A)
    const list = await asA.grinder.list()
    expect(list.some((g) => g.id === grinder.id)).toBe(true)
  })

  it('does not list another user’s grinders', async () => {
    const grinder = await asA.grinder.create({
      name: uniq('Private'),
      brand: 'Brand',
    })
    const listForB = await asB.grinder.list()
    expect(listForB.some((g) => g.id === grinder.id)).toBe(false)
  })
})

describe('grinder.getById', () => {
  it('returns the user’s grinder', async () => {
    const found = await asA.grinder.getById(grinderAId)
    expect(found.id).toBe(grinderAId)
    expect(found.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.grinder.getById(UNKNOWN_UUID)).rejects.toThrow(/not found/i)
  })

  it('does not return another user’s grinder', async () => {
    await expect(asB.grinder.getById(grinderAId)).rejects.toThrow(/not found/i)
  })
})

describe('grinder.update', () => {
  it('updates fields and bumps updatedAt past createdAt', async () => {
    const created = await asA.grinder.create({
      name: uniq('Before'),
      brand: 'Brand',
    })
    // On creation updatedAt defaults to the creation time.
    expect(new Date(created.updatedAt).getTime()).toBe(
      new Date(created.createdAt).getTime(),
    )

    const newName = uniq('After')
    const updated = await asA.grinder.update({
      id: created.id,
      name: newName,
      brand: 'New Brand',
    })
    expect(updated.name).toBe(newName)
    expect(updated.brand).toBe('New Brand')
    // $onUpdate moves updatedAt forward on every update.
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(updated.createdAt).getTime(),
    )
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.grinder.update({
        id: UNKNOWN_UUID,
        name: uniq('Nope'),
        brand: 'Brand',
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s grinder', async () => {
    await expect(
      asB.grinder.update({
        id: grinderAId,
        name: uniq('Hijack'),
        brand: 'Brand',
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('grinder.delete', () => {
  it('deletes the user’s grinder', async () => {
    const created = await asA.grinder.create({
      name: uniq('ToDelete'),
      brand: 'Brand',
    })
    const deleted = await asA.grinder.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.grinder.getById(created.id)).rejects.toThrow(/not found/i)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.grinder.delete(UNKNOWN_UUID)).rejects.toThrow(/not found/i)
  })

  it('will not delete another user’s grinder', async () => {
    await expect(asB.grinder.delete(grinderAId)).rejects.toThrow(/not found/i)
    // The owner can still retrieve it afterward.
    expect((await asA.grinder.getById(grinderAId)).id).toBe(grinderAId)
  })
})
