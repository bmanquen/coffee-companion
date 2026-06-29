import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'coffee-process-user-a'
const asA = callerFor(USER_A)
const uniq = uniqFor(USER_A)

seedUsers([USER_A])

describe('coffeeProcess', () => {
  it('creates then getAll', async () => {
    const created = await asA.coffeeProcess.create({ name: uniq('Process') })
    const all = await asA.coffeeProcess.getAll()
    expect(all.some((p) => p.id === created.id)).toBe(true)
  })
})
