import { beforeAll, describe, expect, it } from 'vitest'
import {
  UNKNOWN_UUID,
  callerFor,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

const USER_A = 'grinder-user-a'
const USER_B = 'grinder-user-b'
// A user with no Grant, so on Free — the equipment limits apply to them alone.
const USER_FREE = 'grinder-user-free'
const USER_PAID = 'grinder-user-paid'
const USER_LAPSED = 'grinder-user-lapsed'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const asFree = callerFor(USER_FREE)
const asPaid = callerFor(USER_PAID)
const asLapsed = callerFor(USER_LAPSED)
const uniq = uniqFor(USER_A)
const uniqFree = uniqFor(USER_FREE)

seedUsers([USER_A, USER_B, USER_FREE, USER_PAID, USER_LAPSED])

let grinderAId: string

beforeAll(async () => {
  // The CRUD cases below own several grinders, which only a paid Plan allows.
  await grantPlan(USER_A, 'pro')
  await grantPlan(USER_B, 'pro')

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
  it('updates fields and never moves updatedAt before createdAt', async () => {
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
    // A JS Date truncates to milliseconds, which a fast update shares with createdAt.
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
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

describe('grinder plan limits', () => {
  it('refuses a second grinder on Free', async () => {
    await asFree.grinder.create({ name: uniqFree('Only one'), brand: 'Brand' })

    await expect(
      asFree.grinder.create({ name: uniqFree('Second'), brand: 'Brand' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lets a granted paid Plan add grinders past the Free limit', async () => {
    const uniqPaid = uniqFor(USER_PAID)
    await grantPlan(USER_PAID, 'pro')

    for (const label of ['One', 'Two', 'Three']) {
      await asPaid.grinder.create({ name: uniqPaid(label), brand: 'Brand' })
    }

    expect((await asPaid.grinder.list()).length).toBe(3)
  })

  it('keeps the grinders a user already owns when their Plan lapses', async () => {
    const uniqLapsed = uniqFor(USER_LAPSED)
    await grantPlan(USER_LAPSED, 'pro')
    const kept = await asLapsed.grinder.create({
      name: uniqLapsed('Kept'),
      brand: 'Brand',
    })
    await asLapsed.grinder.create({ name: uniqLapsed('Also kept'), brand: 'B' })

    await expireGrants(USER_LAPSED)

    // Nothing owned is hidden, and it all stays editable.
    expect((await asLapsed.grinder.list()).length).toBe(2)
    expect((await asLapsed.grinder.getById(kept.id)).id).toBe(kept.id)
    const renamed = await asLapsed.grinder.update({
      id: kept.id,
      name: uniqLapsed('Renamed'),
      brand: 'Brand',
    })
    expect(renamed.id).toBe(kept.id)

    // Only the next addition is refused.
    await expect(
      asLapsed.grinder.create({ name: uniqLapsed('New'), brand: 'Brand' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
