import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { planInterests } from '../db/schema'
import { anonCaller, callerFor, seedUsers } from '../../test/trpc'

const USER_KEEN = 'interest-user-keen'
const USER_TWICE = 'interest-user-twice'

const asKeen = callerFor(USER_KEEN)
const asTwice = callerFor(USER_TWICE)

seedUsers([USER_KEEN, USER_TWICE])

const rowsFor = (userId: string) =>
  db.select().from(planInterests).where(eq(planInterests.userId, userId))

describe('planInterest.register', () => {
  it('records interest in a Plan for a signed-in visitor', async () => {
    const recorded = await asKeen.planInterest.register({ planId: 'proPlus' })

    expect(recorded).toMatchObject({ userId: USER_KEEN, planId: 'proPlus' })
    expect(await rowsFor(USER_KEEN)).toHaveLength(1)
  })

  it('records nothing new when the same visitor registers again', async () => {
    const first = await asTwice.planInterest.register({ planId: 'proPlus' })
    const second = await asTwice.planInterest.register({ planId: 'proPlus' })

    expect(second).toEqual(first)
    expect(await rowsFor(USER_TWICE)).toHaveLength(1)
  })

  it('confers no Plan on the visitor who registered', async () => {
    await asKeen.planInterest.register({ planId: 'proPlus' })

    expect(await asKeen.plan.current()).toMatchObject({ plan: 'free' })
  })

  it('is not recordable without a session', async () => {
    await expect(
      anonCaller.planInterest.register({ planId: 'proPlus' }),
    ).rejects.toThrow(/unauthorized/i)
  })
})
