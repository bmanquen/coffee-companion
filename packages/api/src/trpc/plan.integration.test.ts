import { describe, expect, it } from 'vitest'
import { anonCaller, callerFor, grantPlan, seedUsers } from '../../test/trpc'

const USER_FREE = 'plan-user-free'
const USER_PAID = 'plan-user-paid'
const asFree = callerFor(USER_FREE)
const asPaid = callerFor(USER_PAID)

seedUsers([USER_FREE, USER_PAID])

describe('plan.current', () => {
  it('reports Free and its equipment limits when no Grant applies', async () => {
    expect(await asFree.plan.current()).toEqual({
      plan: 'free',
      limits: { grinders: 1, brewingDevices: 3 },
    })
  })

  it('reports the granted Plan and its unlimited equipment', async () => {
    await grantPlan(USER_PAID, 'pro')

    expect(await asPaid.plan.current()).toEqual({
      plan: 'pro',
      limits: { grinders: null, brewingDevices: null },
    })
  })

  it('is not readable without a session', async () => {
    await expect(anonCaller.plan.current()).rejects.toThrow(/unauthorized/i)
  })
})
