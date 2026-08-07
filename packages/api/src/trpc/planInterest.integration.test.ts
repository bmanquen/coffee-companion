import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { planInterests } from '../db/schema'
import { sendInterestConfirmation } from '../lib/email'
import { anonCaller, callerFor, seedUsers } from '../../test/trpc'

vi.mock('../lib/email', () => ({ sendInterestConfirmation: vi.fn() }))
const confirmations = vi.mocked(sendInterestConfirmation)

const USER = 'interest-user'
const USER_NEIGHBOUR = 'interest-user-neighbour'

const asUser = callerFor(USER)
const asNeighbour = callerFor(USER_NEIGHBOUR)

seedUsers([USER, USER_NEIGHBOUR])

// Every test starts with nobody having registered anything, so each sets up
// exactly the interest it is about and none can be read out of order.
beforeEach(async () => {
  await db
    .delete(planInterests)
    .where(inArray(planInterests.userId, [USER, USER_NEIGHBOUR]))
  confirmations.mockReset()
})

const rowsFor = (userId: string) =>
  db.select().from(planInterests).where(eq(planInterests.userId, userId))

describe('planInterest.register', () => {
  it('records interest in a Plan for a signed-in visitor', async () => {
    const recorded = await asUser.planInterest.register({ planId: 'proPlus' })

    expect(recorded).toMatchObject({ userId: USER, planId: 'proPlus' })
    expect(await rowsFor(USER)).toHaveLength(1)
  })

  // Name and address both come off the session rather than the row, so the
  // confirmation greets whoever signed in — here, the bypass's stand-in.
  it('confirms the new record by email, to the identity they signed in with', async () => {
    await asUser.planInterest.register({ planId: 'proPlus' })

    expect(confirmations).toHaveBeenCalledWith({
      to: `${USER}@example.com`,
      name: 'E2E Tester',
    })
  })

  it('records nothing new when the same visitor registers again', async () => {
    const first = await asUser.planInterest.register({ planId: 'proPlus' })
    confirmations.mockClear()
    const second = await asUser.planInterest.register({ planId: 'proPlus' })

    expect(second).toEqual(first)
    expect(await rowsFor(USER)).toHaveLength(1)
    expect(confirmations).not.toHaveBeenCalled()
  })

  it('still records the interest when the confirmation cannot be sent', async () => {
    confirmations.mockRejectedValueOnce(new Error('mail is down'))

    const recorded = await asUser.planInterest.register({ planId: 'proPlus' })

    expect(recorded).toMatchObject({ userId: USER })
    expect(await rowsFor(USER)).toHaveLength(1)
  })

  it('confers no Plan on the visitor who registered', async () => {
    await asUser.planInterest.register({ planId: 'proPlus' })

    expect(await asUser.plan.current()).toMatchObject({ plan: 'free' })
  })

  // Interest is for a Plan you cannot buy. The way to have one that is on sale
  // is to subscribe to it.
  it.each(['free', 'pro'] as const)(
    'refuses a sellable Plan (%s)',
    async (planId) => {
      await expect(
        asUser.planInterest.register({ planId }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(await rowsFor(USER)).toHaveLength(0)
      expect(confirmations).not.toHaveBeenCalled()
    },
  )

  it('is not recordable without a session', async () => {
    await expect(
      anonCaller.planInterest.register({ planId: 'proPlus' }),
    ).rejects.toThrow(/unauthorized/i)
  })
})

describe('planInterest.list', () => {
  it('lists what this visitor registered, and nobody else', async () => {
    await asUser.planInterest.register({ planId: 'proPlus' })
    await asNeighbour.planInterest.register({ planId: 'proPlus' })

    expect(await asUser.planInterest.list()).toMatchObject([
      { userId: USER, planId: 'proPlus' },
    ])
  })

  it('is empty for a visitor who has registered nothing', async () => {
    expect(await asUser.planInterest.list()).toEqual([])
  })

  it('is not readable without a session', async () => {
    await expect(anonCaller.planInterest.list()).rejects.toThrow(
      /unauthorized/i,
    )
  })
})
