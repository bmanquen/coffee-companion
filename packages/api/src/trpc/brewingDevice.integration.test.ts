import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'device-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('brewingDevice', () => {
  it('creates then lists, scoped to the user', async () => {
    const type = await asA.brewingDeviceType.create({ name: uniq('Type') })
    const device = await asA.brewingDevice.create({
      name: uniq('Device'),
      brand: 'Brand',
      typeId: type.id,
    })
    expect(device.userId).toBe(USER_A)
    const list = await asA.brewingDevice.list()
    expect(list.some((d) => d.id === device.id)).toBe(true)
  })
})
