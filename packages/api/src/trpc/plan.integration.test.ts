import { describe, expect, it } from 'vitest'
import {
  anonCaller,
  callerFor,
  grantPlan,
  seedUsers,
  subscribePlan,
} from '../../test/trpc'

const USER_FREE = 'plan-user-free'
const USER_PAID = 'plan-user-paid'
const asFree = callerFor(USER_FREE)
const asPaid = callerFor(USER_PAID)

// One user per two-source case, so no case inherits another's sources.
const USER_SUBSCRIBED = 'plan-user-subscribed'
const USER_LAPSED = 'plan-user-lapsed'
const USER_BOTH = 'plan-user-both'
const USER_RICHER_GRANT = 'plan-user-richer-grant'
const USER_LESSER_GRANT = 'plan-user-lesser-grant'

seedUsers([
  USER_FREE,
  USER_PAID,
  USER_SUBSCRIBED,
  USER_LAPSED,
  USER_BOTH,
  USER_RICHER_GRANT,
  USER_LESSER_GRANT,
])

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

// A Subscription is the resolver's second source beside a Grant, and the
// resolver returns the most generous of them — so neither source can pull a
// user down to what the other one says.
describe('plan.current with a Subscription', () => {
  const planOf = async (userId: string) =>
    (await callerFor(userId).plan.current()).plan

  it('reports the subscribed Plan with no Grant on record', async () => {
    await subscribePlan(USER_SUBSCRIBED, 'pro')

    expect(await planOf(USER_SUBSCRIBED)).toBe('pro')
  })

  it('ignores a Subscription that is not being paid for', async () => {
    await subscribePlan(USER_LAPSED, 'pro', { status: 'canceled' })

    expect(await planOf(USER_LAPSED)).toBe('free')
  })

  it('reports the Plan once when a Grant and a Subscription agree', async () => {
    await grantPlan(USER_BOTH, 'pro')
    await subscribePlan(USER_BOTH, 'pro')

    expect(await planOf(USER_BOTH)).toBe('pro')
  })

  it('keeps a more generous Grant when the Subscription is for less', async () => {
    await grantPlan(USER_RICHER_GRANT, 'proPlus')
    await subscribePlan(USER_RICHER_GRANT, 'pro')

    expect(await planOf(USER_RICHER_GRANT)).toBe('proPlus')
  })

  it('keeps the paid Subscription when the Grant is for less', async () => {
    await grantPlan(USER_LESSER_GRANT, 'free')
    await subscribePlan(USER_LESSER_GRANT, 'pro')

    expect(await planOf(USER_LESSER_GRANT)).toBe('pro')
  })
})
