import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { brewingDevices } from '../db/schema'
import {
  UNKNOWN_UUID,
  callerFor,
  grantPlan,
  seedUsers,
  subscribePlan,
  uniqFor,
  writeLegacy,
} from '../../test/trpc'

const USER_A = 'device-user-a'
const USER_B = 'device-user-b'
// A user with no Grant, so on Free — the equipment limits apply to them alone.
const USER_FREE = 'device-user-free'
const USER_PAID = 'device-user-paid'
// Hits the Free cap, then a Subscription — the upgrade path a paying user takes.
const USER_UPGRADED = 'device-user-upgraded'
// On Free, with devices hidden by another user's private type.
const USER_LEGACY = 'device-user-legacy'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const asFree = callerFor(USER_FREE)
const asPaid = callerFor(USER_PAID)
const asUpgraded = callerFor(USER_UPGRADED)
const asLegacy = callerFor(USER_LEGACY)
const uniqLegacy = uniqFor(USER_LEGACY)
const uniq = uniqFor(USER_A)
const uniqFree = uniqFor(USER_FREE)

seedUsers([USER_A, USER_B, USER_FREE, USER_PAID, USER_UPGRADED, USER_LEGACY])

let typeId: string
let deviceAId: string

beforeAll(async () => {
  // The CRUD cases below own more devices than Free allows.
  await grantPlan(USER_A, 'pro')
  await grantPlan(USER_B, 'pro')

  const type = await asA.brewingDeviceType.create({ name: uniq('Type') })
  typeId = type.id

  const device = await asA.brewingDevice.create({
    name: uniq('Owned by A'),
    brand: 'Brand',
    typeId,
  })
  deviceAId = device.id
})

describe('brewingDevice uniqueness', () => {
  it('returns CONFLICT when the same user reuses a name', async () => {
    const name = uniq('Same device')
    await asA.brewingDevice.create({ name, brand: 'Brand', typeId })
    await expect(
      asA.brewingDevice.create({ name, brand: 'Other', typeId }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/already exists/i),
    })
  })
})

describe('brewingDevice', () => {
  it('creates then lists, scoped to the user', async () => {
    const device = await asA.brewingDevice.create({
      name: uniq('Device'),
      brand: 'Brand',
      typeId,
    })
    expect(device.userId).toBe(USER_A)
    const list = await asA.brewingDevice.list()
    expect(list.some((d) => d.id === device.id)).toBe(true)
  })
})

describe('brewingDevice type visibility', () => {
  it('refuses another user’s private type on create and update', async () => {
    const theirType = await asB.brewingDeviceType.create({
      name: uniqFor(USER_B)('Private type'),
    })
    await expect(
      asA.brewingDevice.create({
        name: uniq('With their type'),
        brand: 'Brand',
        typeId: theirType.id,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Brewing device type not found',
    })
    await expect(
      asA.brewingDevice.update({
        id: deviceAId,
        name: uniq('Owned by A'),
        brand: 'Brand',
        typeId: theirType.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await asA.brewingDevice.getById(deviceAId)).typeId).toBe(typeId)
  })
})

describe('brewingDevice.getById', () => {
  it('returns the user’s device', async () => {
    const found = await asA.brewingDevice.getById(deviceAId)
    expect(found.id).toBe(deviceAId)
    expect(found.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.brewingDevice.getById(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('does not return another user’s device', async () => {
    await expect(asB.brewingDevice.getById(deviceAId)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('brewingDevice.update', () => {
  it('updates fields and never moves updatedAt before createdAt', async () => {
    const created = await asA.brewingDevice.create({
      name: uniq('Before'),
      brand: 'Brand',
      typeId,
    })
    // On creation updatedAt defaults to the creation time.
    expect(new Date(created.updatedAt).getTime()).toBe(
      new Date(created.createdAt).getTime(),
    )

    const newName = uniq('After')
    const updated = await asA.brewingDevice.update({
      id: created.id,
      name: newName,
      brand: 'New Brand',
      typeId,
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
      asA.brewingDevice.update({
        id: UNKNOWN_UUID,
        name: uniq('Nope'),
        brand: 'Brand',
        typeId,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s device', async () => {
    await expect(
      asB.brewingDevice.update({
        id: deviceAId,
        name: uniq('Hijack'),
        brand: 'Brand',
        typeId,
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('brewingDevice.delete', () => {
  it('deletes the user’s device', async () => {
    const created = await asA.brewingDevice.create({
      name: uniq('ToDelete'),
      brand: 'Brand',
      typeId,
    })
    const deleted = await asA.brewingDevice.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.brewingDevice.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.brewingDevice.delete(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('will not delete another user’s device', async () => {
    await expect(asB.brewingDevice.delete(deviceAId)).rejects.toThrow(
      /not found/i,
    )
    // The owner can still retrieve it afterward.
    expect((await asA.brewingDevice.getById(deviceAId)).id).toBe(deviceAId)
  })
})

describe('brewingDevice plan limits', () => {
  it('allows three brewing devices on Free and refuses the fourth', async () => {
    // A type of their own: another user's private type is refused.
    const typeId = (
      await asFree.brewingDeviceType.create({ name: uniqFree('Type') })
    ).id
    const first = await asFree.brewingDevice.create({
      name: uniqFree('One'),
      brand: 'Brand',
      typeId,
    })
    await asFree.brewingDevice.create({
      name: uniqFree('Two'),
      brand: 'Brand',
      typeId,
    })
    await asFree.brewingDevice.create({
      name: uniqFree('Three'),
      brand: 'Brand',
      typeId,
    })

    await expect(
      asFree.brewingDevice.create({
        name: uniqFree('Fourth'),
        brand: 'Brand',
        typeId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // The three they own are untouched, and update is not an addition.
    expect((await asFree.brewingDevice.list()).length).toBe(3)
    const renamed = await asFree.brewingDevice.update({
      id: first.id,
      name: uniqFree('Renamed'),
      brand: 'Brand',
      typeId,
    })
    expect(renamed.id).toBe(first.id)
  })

  it('does not count devices hidden by another user’s private type', async () => {
    const own = (
      await asLegacy.brewingDeviceType.create({ name: uniqLegacy('Type') })
    ).id
    const devices = await Promise.all(
      ['One', 'Two', 'Three'].map((name) =>
        asLegacy.brewingDevice.create({
          name: uniqLegacy(name),
          brand: 'Brand',
          typeId: own,
        }),
      ),
    )
    // Only rows written before writes checked the type can carry B's.
    await writeLegacy((tx) =>
      tx
        .update(brewingDevices)
        .set({ typeId })
        .where(eq(brewingDevices.id, devices[0].id)),
    )
    expect(await asLegacy.brewingDevice.list()).toHaveLength(2)

    // The hidden one cannot be removed from the list, so it takes no slot.
    await asLegacy.brewingDevice.create({
      name: uniqLegacy('Fourth'),
      brand: 'Brand',
      typeId: own,
    })
    await expect(
      asLegacy.brewingDevice.create({
        name: uniqLegacy('Fifth'),
        brand: 'Brand',
        typeId: own,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Giving the hidden one a visible type adds a slot, so at the cap it is
    // refused, while an ordinary edit at the cap still saves.
    const repair = {
      id: devices[0].id,
      name: devices[0].name,
      brand: 'Brand',
      typeId: own,
    }
    await expect(asLegacy.brewingDevice.update(repair)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await asLegacy.brewingDevice.update({
      id: devices[1].id,
      name: uniqLegacy('Renamed'),
      brand: 'Brand',
      typeId: own,
    })
    // Below the cap the repair goes through.
    await asLegacy.brewingDevice.delete(devices[2].id)
    await asLegacy.brewingDevice.update(repair)
    expect(await asLegacy.brewingDevice.list()).toHaveLength(3)
  })

  it('lets a granted paid Plan add devices past the Free limit', async () => {
    const uniqPaid = uniqFor(USER_PAID)
    await grantPlan(USER_PAID, 'pro')
    const typeId = (
      await asPaid.brewingDeviceType.create({ name: uniqPaid('Type') })
    ).id

    for (const label of ['One', 'Two', 'Three', 'Four']) {
      await asPaid.brewingDevice.create({
        name: uniqPaid(label),
        brand: 'Brand',
        typeId,
      })
    }

    expect((await asPaid.brewingDevice.list()).length).toBe(4)
  })

  it('lets a Subscription add devices after Free had already hit the cap', async () => {
    const uniqUpgraded = uniqFor(USER_UPGRADED)
    const typeId = (
      await asUpgraded.brewingDeviceType.create({ name: uniqUpgraded('Type') })
    ).id
    for (const label of ['One', 'Two', 'Three']) {
      await asUpgraded.brewingDevice.create({
        name: uniqUpgraded(label),
        brand: 'Brand',
        typeId,
      })
    }
    await expect(
      asUpgraded.brewingDevice.create({
        name: uniqUpgraded('Blocked'),
        brand: 'Brand',
        typeId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await subscribePlan(USER_UPGRADED, 'pro')

    const fourth = await asUpgraded.brewingDevice.create({
      name: uniqUpgraded('Now allowed'),
      brand: 'Brand',
      typeId,
    })
    expect(fourth.userId).toBe(USER_UPGRADED)
    expect((await asUpgraded.brewingDevice.list()).length).toBe(4)
  })
})
