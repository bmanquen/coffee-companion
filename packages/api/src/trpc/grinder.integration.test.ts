import { describe, expect, it } from 'vitest'
import { callerFor, seedUsers, uniqFor } from '../../test/trpc'

const USER_A = 'grinder-user-a'
const USER_B = 'grinder-user-b'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)

seedUsers([USER_A, USER_B])

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
