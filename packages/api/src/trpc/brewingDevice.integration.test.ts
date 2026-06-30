import { beforeAll, describe, expect, it } from 'vitest'
import { UNKNOWN_UUID, callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'device-user-a'
const USER_B = 'device-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

seedUsers([USER_A, USER_B])

let typeId: string
let deviceAId: string

beforeAll(async () => {
  const type = await asA.brewingDeviceType.create({ name: uniq('Type') })
  typeId = type.id

  const device = await asA.brewingDevice.create({
    name: uniq('Owned by A'),
    brand: 'Brand',
    typeId,
  })
  deviceAId = device.id
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
  it('updates fields and bumps updatedAt past createdAt', async () => {
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
    // $onUpdate moves updatedAt forward on every update.
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
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
