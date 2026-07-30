import { describe, expect, it } from 'vitest'
import { callerFor, grantPlan, seedUsers, uniqFor } from '../../test/trpc'

// Grants have no interface of their own — they are observed through what a Plan
// allows. The grinder limit is the cheapest observable, so these cases resolve a
// Plan by trying to own a second grinder.
const USER_NONE = 'grant-user-none'
const USER_EXPIRED = 'grant-user-expired'
const USER_LAYERED = 'grant-user-layered'
const USER_UNGRANTED = 'grant-user-ungranted'
const USER_NEIGHBOUR = 'grant-user-neighbour'

const asNone = callerFor(USER_NONE)
const asExpired = callerFor(USER_EXPIRED)
const asLayered = callerFor(USER_LAYERED)
const asUngranted = callerFor(USER_UNGRANTED)

seedUsers([
  USER_NONE,
  USER_EXPIRED,
  USER_LAYERED,
  USER_UNGRANTED,
  USER_NEIGHBOUR,
])

// Owning a second grinder is what Free refuses, so it stands in for "which Plan
// did this user resolve to".
async function ownsTwoGrinders(
  caller: ReturnType<typeof callerFor>,
  userId: string,
) {
  const uniq = uniqFor(userId)
  await caller.grinder.create({ name: uniq('First'), brand: 'Brand' })
  return caller.grinder.create({ name: uniq('Second'), brand: 'Brand' })
}

describe('plan grants', () => {
  it('leaves a user with no Grant on Free', async () => {
    await expect(ownsTwoGrinders(asNone, USER_NONE)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('ignores a Grant that has expired', async () => {
    await grantPlan(USER_EXPIRED, 'pro', {
      reason: 'lapsed beta tester',
      expiresAt: new Date(Date.now() - 60_000),
    })

    await expect(
      ownsTwoGrinders(asExpired, USER_EXPIRED),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('takes the most generous of several active Grants', async () => {
    await grantPlan(USER_LAYERED, 'free', { reason: 'no-op grant' })
    await grantPlan(USER_LAYERED, 'pro', { reason: 'comped partner' })

    const second = await ownsTwoGrinders(asLayered, USER_LAYERED)
    expect(second.userId).toBe(USER_LAYERED)
  })

  it('confers nothing on anyone else', async () => {
    await grantPlan(USER_NEIGHBOUR, 'proPlus', { reason: 'unrelated comp' })

    await expect(
      ownsTwoGrinders(asUngranted, USER_UNGRANTED),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('never limits what a user may log, only what they may own', async () => {
    const uniq = uniqFor(USER_NONE)
    // USER_NONE is on Free and already at the grinder limit from the first case.
    const roaster = await asNone.roaster.create({ name: uniq('Roaster') })

    for (const label of ['One', 'Two', 'Three']) {
      const coffee = await asNone.coffee.create({
        name: uniq(label),
        roasterId: roaster.id,
      })
      expect(coffee.userId).toBe(USER_NONE)
    }
  })
})
