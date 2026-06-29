import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'roast-level-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('roastLevel', () => {
  it('creates then lists', async () => {
    const created = await asA.roastLevel.create({ name: uniq('Roast') })
    const list = await asA.roastLevel.list()
    expect(list.some((r) => r.id === created.id)).toBe(true)
  })
})
