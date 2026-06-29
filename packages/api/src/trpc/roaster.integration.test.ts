import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'roaster-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('roaster', () => {
  it('creates then lists, scoped to the user', async () => {
    const created = await asA.roaster.create({ name: uniq('Roaster') })
    expect(created.userId).toBe(USER_A)
    const list = await asA.roaster.list()
    expect(list.some((r) => r.id === created.id)).toBe(true)
  })
})
