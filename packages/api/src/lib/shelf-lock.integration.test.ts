import { beforeAll, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import {
  callerFor,
  createCoffeeFor,
  deviceTypes,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import { ESPRESSO_DEVICE_TYPE } from './espresso'
import { SHELF_BUSY } from './shelf'

// Writes that change one user's Shelf take turns on a per-user lock. While
// they wait for it they must not hold a database connection, or one user's
// burst of writes could fill the pool and stall everyone else's requests.
const BURST = 'shelf-lock-burst'
const OTHER = 'shelf-lock-other'
const asBurst = callerFor(BURST)
const asOther = callerFor(OTHER)
const uniq = uniqFor(BURST)

const types = deviceTypes()
seedUsers([BURST, OTHER], types.cleanup)

// A connection outside the app's pool, so holding the lock takes none of it.
async function holdShelfLock(userId: string) {
  const pool = new Pool({ max: 1 })
  const client = await pool.connect()
  await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [
    userId,
  ])
  return async () => {
    await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [
      userId,
    ])
    client.release()
    await pool.end()
  }
}

const within = <T>(ms: number, promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`still waiting after ${ms}ms`)), ms),
    ),
  ])

let shot: () => Promise<{ id: string }>

beforeAll(async () => {
  // Pro, so the writes stamp nothing and only the lock is in play.
  await grantPlan(BURST, 'pro', { reason: 'shelf lock fixture' })
  const coffee = await createCoffeeFor(asBurst, uniq)(uniq('Coffee'))
  const grinder = await asBurst.grinder.create({
    name: uniq('Grinder'),
    brand: 'x',
  })
  const device = await asBurst.brewingDevice.create({
    name: uniq('Device'),
    brand: 'x',
    typeId: await types.findOrCreate(ESPRESSO_DEVICE_TYPE),
  })
  shot = () =>
    asBurst.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      grindSetting: '1.5',
      dose: '18',
      yield: '36',
      time: 28,
      idempotencyKey: crypto.randomUUID(),
    })
})

describe('the Shelf lock', () => {
  it('holds no connection while a write waits, so other users are not stalled', async () => {
    // More queued writes than the pool has connections.
    const queued = db.$client.options.max + 2

    const release = await holdShelfLock(BURST)
    let writes: Promise<Array<PromiseSettledResult<unknown>>> =
      Promise.resolve([])
    try {
      writes = Promise.allSettled(Array.from({ length: queued }, shot))
      // Long enough for every write to reach the lock.
      await new Promise((resolve) => setTimeout(resolve, 500))
      await expect(within(5_000, asOther.coffee.getAll())).resolves.toEqual([])
    } finally {
      await release()
    }

    const settled = await writes
    expect(settled.filter((r) => r.status === 'rejected')).toEqual([])
    const [{ saved }] = await db
      .select({ saved: count() })
      .from(espressoShots)
      .where(eq(espressoShots.userId, BURST))
    expect(saved).toBe(queued)
  })

  it('refuses a write that waits too long, and saves nothing', async () => {
    const [{ before }] = await db
      .select({ before: count() })
      .from(espressoShots)
      .where(eq(espressoShots.userId, BURST))
    const release = await holdShelfLock(BURST)
    try {
      await expect(shot()).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: SHELF_BUSY,
      })
    } finally {
      await release()
    }
    const [{ after }] = await db
      .select({ after: count() })
      .from(espressoShots)
      .where(eq(espressoShots.userId, BURST))
    expect(after).toBe(before)
  })
})
