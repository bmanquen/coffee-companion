import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'device-type-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('brewingDeviceType', () => {
  it('creates then lists', async () => {
    // create scopes the type to the user, so it cascades on teardown.
    const created = await asA.brewingDeviceType.create({ name: uniq('Type') })
    const list = await asA.brewingDeviceType.list()
    expect(list.some((t) => t.id === created.id)).toBe(true)
  })
})
