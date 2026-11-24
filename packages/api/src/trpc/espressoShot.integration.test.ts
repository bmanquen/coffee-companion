import { beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { daysAgo } from '../db/seed-e2e'
import {
  brewingDeviceTypes,
  brewingDevices,
  coffees,
  espressoShotIdempotencyKeys,
  espressoShots,
} from '../db/schema'
import { ESPRESSO_DEVICE_TYPE, encodeEspressoShotCursor } from '../lib/espresso'
import {
  UNKNOWN_UUID,
  callerFor,
  createCoffeeFor,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import {
  SHOT_IDEMPOTENCY_DELETED,
  SHOT_REPLAY_CONFLICT,
  TRPC_BAD_REQUEST,
  TRPC_CONFLICT,
} from './espressoShot'
import type { PoolClient } from 'pg'

const USER_A = 'espresso-user-a'
const USER_B = 'espresso-user-b'
const USER_REPLAY_STAMP = 'espresso-user-replay-stamp'
const USER_GEAR_OWNER = 'espresso-user-gear-owner'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)
const createCoffee = createCoffeeFor(asA, uniq)

let espressoDeviceId: string
let pourOverDeviceId: string
let grinderId: string
let coffeeAId: string
let foreignCoffeeId: string
let foreignGrinderId: string

// Device types are globally unique; reuse existing rows or create-and-track new
// ones so cleanup never deletes seeded data on a shared database.
const createdTypeIds: Array<string> = []
// Follows getRecent's cursors from `cursor`, failing as soon as one repeats or
// the pages outnumber what the fixture allows, so a cursor that never
// advances fails the test instead of spinning past its timeout.
async function walkCursors(
  maxPages: number,
  cursor: string | null | undefined,
  load: (
    cursor: string | undefined,
  ) => Promise<{ items: Array<{ id: string }>; nextCursor: string | null }>,
) {
  const ids: Array<string> = []
  const seen = new Set<string>()
  if (cursor) seen.add(cursor)
  for (let pages = 0; ; pages += 1) {
    if (pages === maxPages) {
      throw new Error(`getRecent did not finish within ${maxPages} pages`)
    }
    const page = await load(cursor ?? undefined)
    ids.push(...page.items.map((shot) => shot.id))
    // Only null ends the list; clients would send '' back as a cursor.
    if (page.nextCursor === '') {
      throw new Error('getRecent returned an empty cursor')
    }
    if (page.nextCursor === null) return ids
    if (seen.has(page.nextCursor)) {
      throw new Error(`getRecent repeated cursor ${page.nextCursor}`)
    }
    seen.add(page.nextCursor)
    cursor = page.nextCursor
  }
}

async function findOrCreateDeviceType(name: string): Promise<string> {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    // A shared type only: another user's private one fails the visibility check.
    .where(
      and(eq(brewingDeviceTypes.name, name), isNull(brewingDeviceTypes.userId)),
    )
  if (existing[0]) return existing[0].id
  const [row] = await db.insert(brewingDeviceTypes).values({ name }).returning()
  createdTypeIds.push(row.id)
  return row.id
}

// Node in this suite is America/Chicago. A session west of that is the
// JS-Date vs defaultNow() split that UTC CI Postgres does not show.
// Warm every pool slot (and await SET) so create() cannot check out a
// fresh connection that still has the cluster TimeZone — pg does not
// wait for 'connect' listeners.
async function withPoolTimeZone<T>(
  tz: string,
  run: () => Promise<T>,
): Promise<T> {
  const pool = db.$client
  const original = (await pool.query<{ TimeZone: string }>('SHOW timezone'))
    .rows[0]?.TimeZone
  if (!original) {
    throw new Error('SHOW timezone returned no TimeZone')
  }
  try {
    await applyPoolTimeZone(pool, tz)
    return await run()
  } finally {
    await applyPoolTimeZone(pool, original)
  }
}

async function applyPoolTimeZone(pool: typeof db.$client, tz: string) {
  const max = pool.options.max
  const held: Array<PoolClient> = []
  try {
    for (let i = 0; i < max; i++) {
      const client = await pool.connect()
      held.push(client)
      await client.query('SELECT set_config($1, $2, false)', ['TimeZone', tz])
    }
  } finally {
    for (const client of held) client.release()
  }
}

seedUsers([USER_A, USER_B, USER_REPLAY_STAMP, USER_GEAR_OWNER], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

beforeAll(async () => {
  const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const pourOverTypeId = await findOrCreateDeviceType('Pour Over')

  const espressoDevice = await asA.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId: espressoTypeId,
  })
  espressoDeviceId = espressoDevice.id

  const pourOverDevice = await asA.brewingDevice.create({
    name: uniq('V60'),
    brand: 'Hario',
    typeId: pourOverTypeId,
  })
  pourOverDeviceId = pourOverDevice.id

  const grinder = await asA.grinder.create({
    name: uniq('Niche'),
    brand: 'Niche',
  })
  grinderId = grinder.id

  const coffee = await createCoffee(uniq('Ethiopia Guji'))
  coffeeAId = coffee.id

  const asOwner = callerFor(USER_GEAR_OWNER)
  const uniqOwner = uniqFor(USER_GEAR_OWNER)
  const [foreignCoffee, foreignGrinder] = await Promise.all([
    createCoffeeFor(asOwner, uniqOwner)(uniqOwner('Kenya')),
    asOwner.grinder.create({
      name: uniqOwner('Comandante'),
      brand: 'Comandante',
    }),
  ])
  foreignCoffeeId = foreignCoffee.id
  foreignGrinderId = foreignGrinder.id
})

describe('espressoShot.create', () => {
  it('creates a shot on an espresso device', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(shot.userId).toBe(USER_A)
    expect(shot.dose).toBe('18')
    expect(shot.yield).toBe('36')
  })

  it('keeps roast date as the same YYYY-MM-DD calendar day', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      roastDate: '2026-05-01',
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(shot.roastDate).toBe('2026-05-01')
    expect(typeof shot.roastDate).toBe('string')

    const fetched = await asA.espressoShot.getById(shot.id)
    expect(fetched.roastDate).toBe('2026-05-01')
    expect(typeof fetched.roastDate).toBe('string')
  })

  it('rejects a non-espresso brewing device', async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: pourOverDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/Espresso/)
  })

  it('rejects an unknown brewing device', async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: UNKNOWN_UUID,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/not found/i)
  })

  it("rejects another user's coffee", async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: foreignCoffeeId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/Coffee not found/)
  })

  it("rejects another user's grinder", async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId: foreignGrinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/Grinder not found/)
  })

  it('rejects a device the user cannot list', async () => {
    // A device written with another user's private type before the type
    // check; without the visibility filter its name check would refuse it
    // as not Espresso instead.
    const [type] = await db
      .insert(brewingDeviceTypes)
      .values({ name: uniq('Private type'), userId: USER_B })
      .returning({ id: brewingDeviceTypes.id })
    const [device] = await db
      .insert(brewingDevices)
      .values({
        userId: USER_A,
        name: uniq('Legacy machine'),
        brand: 'Legacy',
        typeId: type.id,
      })
      .returning({ id: brewingDevices.id })
    try {
      await expect(
        asA.espressoShot.create({
          coffeeId: coffeeAId,
          grinderId,
          brewingDeviceId: device.id,
          dose: '18',
          yield: '36',
          time: 30,
          grindSetting: '1.5',
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(/Brewing device not found/)
    } finally {
      await db.delete(brewingDevices).where(eq(brewingDevices.id, device.id))
      await db
        .delete(brewingDeviceTypes)
        .where(eq(brewingDeviceTypes.id, type.id))
    }
  })
})

describe('espressoShot.getById', () => {
  it('returns the user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const shot = await asA.espressoShot.getById(created.id)
    expect(shot.id).toBe(created.id)
    expect(shot.userId).toBe(USER_A)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.espressoShot.getById(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('does not return another user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(asB.espressoShot.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('espressoShot.update', () => {
  it('updates fields on the user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const updated = await asA.espressoShot.update({
      id: created.id,
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '20',
      yield: '40',
      time: 30,
      grindSetting: '1.5',
    })
    expect(updated.dose).toBe('20')
    expect(updated.yield).toBe('40')
  })

  it('keeps roast date as the same YYYY-MM-DD calendar day', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      roastDate: '2026-05-01',
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const updated = await asA.espressoShot.update({
      id: created.id,
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      roastDate: '2026-04-15',
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
    })
    expect(updated.roastDate).toBe('2026-04-15')
    expect(typeof updated.roastDate).toBe('string')

    const fetched = await asA.espressoShot.getById(created.id)
    expect(fetched.roastDate).toBe('2026-04-15')
  })

  it('keeps timestamps server-owned so a create or edit cannot move the shot', async () => {
    const backdated = new Date('2020-01-01T00:00:00Z')
    const timestamps = {
      createdAt: backdated,
      updatedAt: backdated,
      sealedAt: backdated,
    } as object
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
      ...timestamps,
    })
    expect(created.createdAt.getTime()).toBeGreaterThan(backdated.getTime())
    expect(created.updatedAt.getTime()).toBeGreaterThan(backdated.getTime())
    expect(created.sealed).toBe(false)

    await asA.espressoShot.update({
      id: created.id,
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '19',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      ...timestamps,
    })
    const stored = await db.query.espressoShots.findFirst({
      where: { id: created.id },
    })
    expect(stored?.dose).toBe('19')
    expect(stored?.createdAt).toEqual(created.createdAt)
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(backdated.getTime())
    expect(stored?.sealedAt).toBeNull()
  })

  it('rejects a roast date in year zero before it reaches Postgres', async () => {
    await expect(
      asA.espressoShot.create({
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        roastDate: '0000-01-01',
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('rejects a fractional page limit as bad input', async () => {
    await expect(
      asA.espressoShot.getRecent({ limit: 1.5 }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
    await expect(
      asA.espressoShot.getDialedIn({ limit: 1.5 }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('rejects a non-espresso brewing device', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(
      asA.espressoShot.update({
        id: created.id,
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: pourOverDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
      }),
    ).rejects.toThrow(/Espresso/)
  })

  it("rejects another user's coffee", async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(
      asA.espressoShot.update({
        id: created.id,
        coffeeId: foreignCoffeeId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
      }),
    ).rejects.toThrow(/Coffee not found/)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(
      asA.espressoShot.update({
        id: UNKNOWN_UUID,
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('will not update another user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(
      asB.espressoShot.update({
        id: created.id,
        coffeeId: coffeeAId,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '99',
        yield: '99',
        time: 30,
        grindSetting: '1.5',
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('espressoShot.delete', () => {
  it('deletes the user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const deleted = await asA.espressoShot.delete(created.id)
    expect(deleted.id).toBe(created.id)
    await expect(asA.espressoShot.getById(created.id)).rejects.toThrow(
      /not found/i,
    )
  })

  it('clears the dialed-in reference when its shot is deleted', async () => {
    const coffee = await createCoffee(uniq('Dialed To Delete'))
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceId,
      brewId: shot.id,
    })

    await asA.espressoShot.delete(shot.id)

    const coffees = await asA.coffee.getAll()
    expect(coffees.find((c) => c.id === coffee.id)?.isDialedIn).toBe(false)
  })

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(asA.espressoShot.delete(UNKNOWN_UUID)).rejects.toThrow(
      /not found/i,
    )
  })

  it('will not delete another user’s shot', async () => {
    const created = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(asB.espressoShot.delete(created.id)).rejects.toThrow(
      /not found/i,
    )
    expect((await asA.espressoShot.getById(created.id)).id).toBe(created.id)
  })
})

describe('espressoShot.create idempotency', () => {
  it('returns the existing row when the same key and fields are reused', async () => {
    const idempotencyKey = crypto.randomUUID()
    const grindSetting = `replay-${idempotencyKey}`
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting,
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    const second = await asA.espressoShot.create(input)
    expect(second.id).toBe(first.id)
    expect(second.dose).toBe('18')
    // Every stored shot from this request, so a second row under another id
    // fails too.
    const stored = await db
      .select({ id: espressoShots.id })
      .from(espressoShots)
      .where(
        and(
          eq(espressoShots.userId, USER_A),
          eq(espressoShots.grindSetting, grindSetting),
        ),
      )
    expect(stored).toEqual([{ id: first.id }])
  })

  it.each([
    ['identical creates overlap', '18'],
    ['creates with different doses overlap under one key', '19'],
  ])('returns one shot when two %s', async (_, secondDose) => {
    const idempotencyKey = crypto.randomUUID()
    const grindSetting = `overlap-${idempotencyKey}`
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting,
      idempotencyKey,
    }
    // Holding the coffee makes the first shot insert wait on its foreign key,
    // and the second create waits behind it for the user's Shelf lock, so
    // both creates have missed the key before either can claim it.
    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: (pid: number) => void = () => {}
    const coffeeLocked = new Promise<number>((resolve) => {
      locked = resolve
    })
    const holder = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM coffees WHERE id = ${coffeeAId} FOR UPDATE`,
      )
      const backend = await tx.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid() AS pid`,
      )
      locked(backend.rows[0].pid)
      await released
    })
    let creates: Promise<Array<PromiseSettledResult<{ id: string }>>> =
      Promise.resolve([])
    try {
      const blockerPid = await Promise.race([coffeeLocked, holder])
      creates = Promise.allSettled([
        asA.espressoShot.create(input),
        asA.espressoShot.create({ ...input, dose: secondDose }),
      ])
      let blocked = 0
      for (let i = 0; i < 200 && blocked < 2; i++) {
        const waiting = await db.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE (${blockerPid} = ANY(pg_blocking_pids(pid))
                  AND query ILIKE 'insert into "espresso_shots"%')
                 OR (wait_event_type = 'Lock'
                  AND query ILIKE 'select pg_advisory_lock%')`,
        )
        blocked = waiting.rows[0].n
        if (blocked < 2) await new Promise((resolve) => setTimeout(resolve, 25))
      }
      expect(blocked).toBe(2)
    } finally {
      release()
      await Promise.allSettled([holder, creates])
    }
    const results = await creates
    const won = results.filter((result) => result.status === 'fulfilled')
    const shots = await db
      .select({ id: espressoShots.id, dose: espressoShots.dose })
      .from(espressoShots)
      .where(
        and(
          eq(espressoShots.userId, USER_A),
          eq(espressoShots.grindSetting, grindSetting),
        ),
      )
    expect(shots).toHaveLength(1)
    if (secondDose === input.dose) {
      // The loser replays the winner's shot.
      expect(won).toHaveLength(2)
      for (const result of won) expect(result.value.id).toBe(shots[0].id)
    } else {
      // The loser lost the claim with a different request: a conflict, not
      // the winner's shot.
      expect(won).toHaveLength(1)
      expect(won[0].value.id).toBe(shots[0].id)
      const lost = results.find((result) => result.status === 'rejected')
      expect(lost?.reason).toMatchObject({
        code: TRPC_CONFLICT,
        message: SHOT_REPLAY_CONFLICT,
      })
      const winnerDose =
        results[0].status === 'fulfilled' ? input.dose : secondDose
      expect(Number(shots[0].dose)).toBe(Number(winnerDose))
    }
    const keys = await db
      .select({
        shotId: espressoShotIdempotencyKeys.shotId,
      })
      .from(espressoShotIdempotencyKeys)
      .where(
        and(
          eq(espressoShotIdempotencyKeys.userId, USER_A),
          eq(espressoShotIdempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
    expect(keys).toHaveLength(1)
    expect(keys[0].shotId).toBe(shots[0].id)
  })

  it('does not stamp again when a displacing shot is replayed', async () => {
    const as = callerFor(USER_REPLAY_STAMP)
    const uniqReplay = uniqFor(USER_REPLAY_STAMP)
    const createReplayCoffee = createCoffeeFor(as, uniqReplay)
    const typeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
    const device = await as.brewingDevice.create({
      name: uniqReplay('Linea Mini'),
      brand: 'La Marzocco',
      typeId,
    })
    const grinder = await as.grinder.create({
      name: uniqReplay('Niche'),
      brand: 'Niche',
    })

    const coffees: Array<string> = []
    for (let index = 0; index < 5; index += 1) {
      coffees.push((await createReplayCoffee(uniqReplay(`Shelf ${index}`))).id)
    }

    const logOn = (coffeeId: string, idempotencyKey = crypto.randomUUID()) =>
      as.espressoShot.create({
        coffeeId,
        grinderId: grinder.id,
        brewingDeviceId: device.id,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey,
      })

    const firstWave: Array<string> = []
    for (const coffeeId of coffees) {
      firstWave.push((await logOn(coffeeId)).id)
    }
    await createReplayCoffee(uniqReplay('Shelf 5'))

    const replayKey = crypto.randomUUID()
    const lifted = await logOn(coffees[0], replayKey)

    const stampsBefore = await db
      .select({
        id: espressoShots.id,
        sealedAt: espressoShots.sealedAt,
      })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER_REPLAY_STAMP))

    const replayed = await as.espressoShot.create({
      coffeeId: coffees[0],
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: replayKey,
    })
    expect(replayed.id).toBe(lifted.id)

    const stampsAfter = await db
      .select({
        id: espressoShots.id,
        sealedAt: espressoShots.sealedAt,
      })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER_REPLAY_STAMP))

    const displaced = stampsBefore.find((row) => row.id === firstWave[1])
    expect(displaced?.sealedAt).toBeNull()
    const byId = (rows: typeof stampsBefore) =>
      rows
        .map((row) => ({
          id: row.id,
          sealedAt: row.sealedAt?.getTime() ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(stampsAfter)).toEqual(byId(stampsBefore))
  })

  it('does not recreate a shot when the same key is retried after delete', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const created = await asA.espressoShot.create(input)
    await asA.espressoShot.delete(created.id)
    const afterDelete = await asA.espressoShot.getRecent({ limit: 50 })

    await expect(asA.espressoShot.create(input)).rejects.toMatchObject({
      code: TRPC_CONFLICT,
      message: SHOT_IDEMPOTENCY_DELETED,
    })

    const afterRetry = await asA.espressoShot.getRecent({ limit: 50 })
    expect(afterRetry.items.map((shot) => shot.id)).toEqual(
      afterDelete.items.map((shot) => shot.id),
    )
    expect(afterRetry.items.some((shot) => shot.id === created.id)).toBe(false)
  })

  it('returns the recorded shot when the device type changes before retry', async () => {
    const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
    const pourOverTypeId = await findOrCreateDeviceType('Pour Over')
    const device = await asA.brewingDevice.getById(espressoDeviceId)
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    try {
      await asA.brewingDevice.update({
        id: espressoDeviceId,
        name: device.name,
        brand: device.brand,
        typeId: pourOverTypeId,
      })
      const replayed = await asA.espressoShot.create(input)
      expect(replayed.id).toBe(first.id)
    } finally {
      await asA.brewingDevice.update({
        id: espressoDeviceId,
        name: device.name,
        brand: device.brand,
        typeId: espressoTypeId,
      })
    }
  })

  it('returns the deleted-key conflict when the device is gone before retry', async () => {
    const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
    const device = await asA.brewingDevice.create({
      name: uniq('Gone Linea'),
      brand: 'La Marzocco',
      typeId: espressoTypeId,
    })
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    await asA.espressoShot.create(input)
    await asA.brewingDevice.delete(device.id)
    await expect(asA.espressoShot.create(input)).rejects.toMatchObject({
      code: TRPC_CONFLICT,
      message: SHOT_IDEMPOTENCY_DELETED,
    })
  })

  it('returns the deleted-key conflict when an overlapping save claims the key and its coffee is deleted mid-insert', async () => {
    const coffee = await createCoffee(uniq('Deleted Mid Insert'))
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: (pid: number) => void = () => {}
    const coffeeLocked = new Promise<number>((resolve) => {
      locked = resolve
    })
    // Another request: holds the coffee so this create's insert waits on its
    // foreign key, then claims the key, loses its shot to the coffee's
    // deletion, and commits.
    const overlapping = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM coffees WHERE id = ${coffee.id} FOR UPDATE`,
      )
      const backend = await tx.execute<{ pid: number }>(
        sql`SELECT pg_backend_pid() AS pid`,
      )
      locked(backend.rows[0].pid)
      await released
      await tx.insert(espressoShotIdempotencyKeys).values({
        userId: USER_A,
        idempotencyKey,
        shotId: null,
      })
      await tx.delete(coffees).where(eq(coffees.id, coffee.id))
    })
    let outcome: Promise<unknown> = Promise.resolve(null)
    try {
      // Fails here, not by hanging, if the lock is never taken.
      const blockerPid = await Promise.race([coffeeLocked, overlapping])
      outcome = asA.espressoShot.create(input).then(
        () => null,
        (error: unknown) => error,
      )
      // Only the shot insert waiting on this transaction proves the create
      // got past its key lookup to the foreign-key check.
      let insertBlocked = false
      for (let i = 0; i < 200 && !insertBlocked; i++) {
        const waiting = await db.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))
                AND query ILIKE 'insert into "espresso_shots"%'`,
        )
        insertBlocked = waiting.rows[0].n > 0
        if (!insertBlocked)
          await new Promise((resolve) => setTimeout(resolve, 25))
      }
      expect(insertBlocked).toBe(true)
    } finally {
      release()
      // The create too, so a failed check never leaves it running into the
      // next test.
      await Promise.allSettled([overlapping, outcome])
    }
    await overlapping

    expect(await outcome).toMatchObject({
      code: TRPC_CONFLICT,
      message: SHOT_IDEMPOTENCY_DELETED,
    })
  })

  it('replays a key claimed while gear validation ran instead of reporting the gear missing', async () => {
    const espressoTypeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
    const device = await asA.brewingDevice.create({
      name: uniq('Validated Linea'),
      brand: 'La Marzocco',
      typeId: espressoTypeId,
    })
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    // This retry read no key; while it checks the gear, the first request
    // saves under the key and the device (with its shot) is deleted.
    const spy = vi
      .spyOn(db.query.brewingDevices, 'findFirst')
      .mockImplementationOnce(async () => {
        await db.insert(espressoShotIdempotencyKeys).values({
          userId: USER_A,
          idempotencyKey,
          shotId: null,
        })
        await asA.brewingDevice.delete(device.id)
        return undefined
      })
    try {
      await expect(asA.espressoShot.create(input)).rejects.toMatchObject({
        code: TRPC_CONFLICT,
        message: SHOT_IDEMPOTENCY_DELETED,
      })
    } finally {
      spy.mockRestore()
    }
    // Without a claimed key, the missing gear is still reported.
    await expect(
      asA.espressoShot.create({
        ...input,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Brewing device not found',
    })
  })

  it('rejects a reused key when the shot fields differ', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    await asA.espressoShot.create(input)
    await expect(
      asA.espressoShot.create({
        ...input,
        dose: '22',
      }),
    ).rejects.toMatchObject({
      code: TRPC_CONFLICT,
      message: 'This shot was already saved with different settings.',
    })
  })

  it('returns the edited shot when the original create is retried', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    const { idempotencyKey: _, ...fields } = input
    await asA.espressoShot.update({ ...fields, id: first.id, dose: '22' })

    const replayed = await asA.espressoShot.create(input)
    expect(replayed.id).toBe(first.id)
    expect(replayed.dose).toBe('22')
    const page = await asA.espressoShot.getRecent({ limit: 50 })
    expect(page.items.filter((shot) => shot.id === first.id)).toHaveLength(1)

    await expect(
      asA.espressoShot.create({ ...input, dose: '22' }),
    ).rejects.toMatchObject({ code: TRPC_CONFLICT })
  })

  it('withholds settings when a sealed shot is replayed', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    await db
      .update(espressoShots)
      .set({ sealedAt: new Date() })
      .where(eq(espressoShots.id, first.id))
    const replayed = await asA.espressoShot.create(input)
    expect(replayed.id).toBe(first.id)
    expect(replayed.sealed).toBe(true)
    expect(replayed.dose).toBeNull()
    expect(replayed.grindSetting).toBeNull()
  })

  it('does not return another user’s row for the same key', async () => {
    const idempotencyKey = crypto.randomUUID()
    const shared = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const forA = await asA.espressoShot.create(shared)
    const coffeeB = await createCoffeeFor(
      asB,
      uniqFor(USER_B),
    )(uniqFor(USER_B)('Other Guji'))
    const grinderB = await asB.grinder.create({
      name: uniqFor(USER_B)('Niche'),
      brand: 'Niche',
    })
    const deviceB = await asB.brewingDevice.create({
      name: uniqFor(USER_B)('Linea Mini'),
      brand: 'La Marzocco',
      typeId: await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE),
    })
    const forB = await asB.espressoShot.create({
      ...shared,
      coffeeId: coffeeB.id,
      grinderId: grinderB.id,
      brewingDeviceId: deviceB.id,
    })
    expect(forB.id).not.toBe(forA.id)
    expect(forB.userId).toBe(USER_B)
    expect((await asA.espressoShot.getById(forA.id)).id).toBe(forA.id)
    await expect(asB.espressoShot.getById(forA.id)).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('espressoShot.getRecent', () => {
  it('returns a later API create ahead of a daysAgo(0) seed row', async () => {
    const coffee = await createCoffee(uniq('Js Clock Seed Coffee'))
    // East of UTC, the database-clock seed sorts ahead of a shot stamped
    // with a JS Date, so a create that went back to the JS clock fails here.
    await withPoolTimeZone('Asia/Tokyo', async () => {
      await db.insert(espressoShots).values({
        userId: USER_A,
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        createdAt: daysAgo(0),
      })
      const created = await asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '7',
        idempotencyKey: crypto.randomUUID(),
      })
      const page = await asA.espressoShot.getRecent({
        limit: 1,
        coffeeId: coffee.id,
      })
      expect(page.items[0]?.id).toBe(created.id)
    })
  })

  it('returns the user shots with relations', async () => {
    // Its own shot, so the test passes when run by itself.
    const coffee = await createCoffee(uniq('Relations Coffee'))
    const seeded = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const shots = (await asA.espressoShot.getRecent({ limit: 50 })).items
    expect(shots.every((s) => s.userId === USER_A)).toBe(true)
    const shot = shots.find((s) => s.id === seeded.id)
    expect(shot?.coffee.id).toBe(coffee.id)
    expect(shot?.brewingDevice?.type).toBeTruthy()
  })

  it('filters getRecent by coffee and text without loading every page', async () => {
    const other = await createCoffee(uniq('Colombia Huila'))
    await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'guji-grind',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.espressoShot.create({
      coffeeId: other.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '19',
      yield: '38',
      time: 32,
      grindSetting: 'huila-grind',
      idempotencyKey: crypto.randomUUID(),
    })
    const byCoffee = await asA.espressoShot.getRecent({
      limit: 50,
      coffeeId: other.id,
    })
    expect(byCoffee.items.every((shot) => shot.coffeeId === other.id)).toBe(
      true,
    )
    expect(byCoffee.items.length).toBeGreaterThanOrEqual(1)
    const byText = await asA.espressoShot.getRecent({
      limit: 50,
      q: 'huila-grind',
    })
    expect(byText.items.map((shot) => shot.grindSetting)).toContain(
      'huila-grind',
    )
    expect(
      byText.items.every((shot) => shot.grindSetting !== 'guji-grind'),
    ).toBe(true)
  })

  it('finds getRecent shots by the ratio the log shows', async () => {
    const coffee = await createCoffee(uniq('Ratio Search'))
    const log = (dose: string, yieldGrams: string) =>
      asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose,
        yield: yieldGrams,
        time: 30,
        grindSetting: '12',
        idempotencyKey: crypto.randomUUID(),
      })
    const even = await log('18', '45')
    const rounded = await log('18', '41')
    const half = await log('20', '53.5')
    const belowHalf = await log('20', '53.49999999999998')
    const tiny = await log('20', '0.05')
    const tinier = await log('20', '0.000001')
    const search = async (q: string) =>
      (
        await asA.espressoShot.getRecent({ limit: 50, coffeeId: coffee.id, q })
      ).items.map((shot) => shot.id)

    // 45/18 shows as 1:2.5, 41/18 (2.2777…) as 1:2.28, and 53.5/20 as 1:2.68.
    expect(await search('1:2.5')).toEqual([even.id])
    expect(await search('1:2.28')).toEqual([rounded.id])
    expect(await search('1:2.50')).toEqual([])
    expect(await search('1:2.277')).toEqual([])
    // An exact half-hundredth rounds up, as formatBrewRatio shows it.
    expect(await search('1:2.68')).toEqual([half.id])
    // Just below the half (2.674999999999999) rounds down, as it shows.
    expect(await search('1:2.67')).toEqual([belowHalf.id])
    // 0.05/20 would round to 1:0, so it shows (and is found) as 1:0.003.
    expect(await search('1:0.003')).toEqual([tiny.id])
    expect(await search('1:0.0025')).toEqual([])
    // Past six decimals too, as the log shows it: 0.000001/20 (0.00000005)
    // rounds up to 1:0.0000001.
    expect(await search('1:0.0000001')).toEqual([tinier.id])
    expect(await search('1:0.00000005')).toEqual([])

    // A quotient past numeric's range is no ratio, not a failed search.
    const huge = await log(`0.${'0'.repeat(16000)}1`, '9'.repeat(130000))
    expect(await search('1:2.5')).toEqual([even.id])
    expect(await search('Ratio Search')).toContain(huge.id)
  })

  it('filters getRecent to dialed-in shots', async () => {
    const coffee = await createCoffee(uniq('Dialed Recent'))
    const dialed = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'dialed-recent',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '19',
      yield: '38',
      time: 32,
      grindSetting: 'not-dialed',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceId,
      brewId: dialed.id,
    })
    const page = await asA.espressoShot.getRecent({
      limit: 50,
      coffeeId: coffee.id,
      dialedIn: true,
    })
    expect(page.items.map((shot) => shot.id)).toEqual([dialed.id])
    expect(page.total).toBe(1)
  })

  it('pages dialed-in shots beyond the first page', async () => {
    const token = uniq('dialed-page')
    const created: Array<string> = []
    for (let index = 0; index < 3; index++) {
      const coffee = await createCoffee(uniq(`Dialed Page ${index}`))
      const shot = await asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: `${token}-${index}`,
        idempotencyKey: crypto.randomUUID(),
      })
      await asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceId,
        brewId: shot.id,
      })
      created.push(shot.id)
    }
    const page1 = await asA.espressoShot.getRecent({
      limit: 2,
      q: token,
      dialedIn: true,
    })
    expect(page1.items.map((shot) => shot.id)).toEqual([created[2], created[1]])
    expect(page1.items.every((shot) => shot.isDialedIn)).toBe(true)
    expect(page1.total).toBe(3)
    expect(page1.nextCursor).toBeTruthy()

    const page2 = await asA.espressoShot.getRecent({
      limit: 2,
      q: token,
      dialedIn: true,
      cursor: page1.nextCursor!,
    })
    expect(page2.items.map((shot) => shot.id)).toEqual([created[0]])
    expect(page2.items[0]?.isDialedIn).toBe(true)
    expect(page2.nextCursor).toBeNull()
  })

  it('includes the roaster on getRecent coffee relations', async () => {
    const coffee = await createCoffee(uniq('Roaster Relation Coffee'))
    await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const shots = (
      await asA.espressoShot.getRecent({ limit: 1, coffeeId: coffee.id })
    ).items
    expect(shots[0]?.coffee.roaster).toEqual(
      expect.objectContaining({ name: expect.any(String) }),
    )
  })

  it('searches the Coffee column’s combined coffee and roaster label', async () => {
    // coffeeOptionLabel trims these, so the label shows `Coffee · Sey`.
    const roaster = await asA.roaster.create({
      name: `\t\u00a0${uniq('Sey')}\u3000`,
    })
    const coffee = await createCoffee(uniq('Ethiopia Guji'), {
      roasterId: roaster.id,
    })
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const search = async (q: string) =>
      (await asA.espressoShot.getRecent({ limit: 50, q })).items.map(
        (item) => item.id,
      )

    // As coffeeOptionLabel shows it, and in another case.
    const label = `${coffee.name} · ${roaster.name.trim()}`
    expect(await search(label)).toEqual([shot.id])
    expect(await search(label.toUpperCase())).toEqual([shot.id])
    expect(await search(`${coffee.name} · ${uniq('Other')}`)).toEqual([])
  })

  it('adds no separator to the combined label for a blank roaster', async () => {
    // coffeeOptionLabel shows only the coffee name for this roaster.
    const roaster = await asA.roaster.create({ name: ' \t ' })
    const coffee = await createCoffee(uniq('Blank roaster coffee'), {
      roasterId: roaster.id,
    })
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    const search = async (q: string) =>
      (await asA.espressoShot.getRecent({ limit: 50, q })).items.map(
        (item) => item.id,
      )

    expect(await search(coffee.name)).toEqual([shot.id])
    expect(await search(`${coffee.name} ·`)).toEqual([])
  })

  it('hides and does not search another user’s private roaster', async () => {
    const coffee = await createCoffee(uniq('Leaky roaster coffee'))
    const secret = uniq('Secret roaster')
    const hidden = await asB.roaster.create({ name: secret })
    // Only a row written before the coffee router checked roasters can do this.
    await db
      .update(coffees)
      .set({ roasterId: hidden.id })
      .where(eq(coffees.id, coffee.id))
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })

    const recent = await asA.espressoShot.getRecent({
      limit: 50,
      coffeeId: coffee.id,
    })
    expect(recent.items.map((item) => item.id)).toEqual([shot.id])
    expect(recent.items[0]?.coffee.roaster).toBeNull()

    const latest = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    expect(latest?.coffee.roaster).toBeNull()

    const search = await asA.espressoShot.getRecent({ limit: 50, q: secret })
    expect(search.items).toEqual([])
    expect(search.total).toBe(0)
    const label = await asA.espressoShot.getRecent({
      limit: 50,
      // Only a combined label holds the separator.
      q: `· ${secret}`,
    })
    expect(label.items).toEqual([])
  })

  it('hides another user’s grinder on a legacy shot', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // Only a row written before writes checked gear ownership can do this.
    await db
      .update(espressoShots)
      .set({ grinderId: foreignGrinderId })
      .where(eq(espressoShots.id, shot.id))

    const recent = await asA.espressoShot.getRecent({
      limit: 50,
      coffeeId: coffeeAId,
    })
    const legacy = recent.items.find((item) => item.id === shot.id)
    expect(legacy).toBeDefined()
    expect(legacy?.grinder).toBeNull()
  })

  it('paginates with a cursor and stays stable when a shot is inserted', async () => {
    const coffee = await createCoffee(uniq('Cursor Coffee'))
    const created: Array<string> = []
    for (let i = 0; i < 5; i++) {
      const shot = await asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      })
      created.push(shot.id)
    }
    const page1 = await asA.espressoShot.getRecent({
      limit: 2,
      coffeeId: coffee.id,
    })
    expect(page1.items).toHaveLength(2)
    expect(typeof page1.nextCursor).toBe('string')
    expect(page1.nextCursor).toBeTruthy()

    const inserted = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })

    // Three older shots remain after page one: two pages, the last with no
    // cursor.
    const collectedIds = [
      ...page1.items.map((shot) => shot.id),
      ...(await walkCursors(2, page1.nextCursor, (cursor) =>
        asA.espressoShot.getRecent({ limit: 2, coffeeId: coffee.id, cursor }),
      )),
    ]
    expect(new Set(collectedIds).size).toBe(collectedIds.length)
    expect(collectedIds).toEqual(expect.arrayContaining(created))
    expect(collectedIds).not.toContain(inserted.id)
    expect(collectedIds).toHaveLength(created.length)

    // Six shots at two a page: the third page must end the list.
    const refreshed = await walkCursors(3, undefined, (cursor) =>
      asA.espressoShot.getRecent({ limit: 2, coffeeId: coffee.id, cursor }),
    )
    expect(refreshed).toHaveLength(page1.total + 1)
    expect(new Set(refreshed).size).toBe(refreshed.length)
    expect(refreshed[0]).toBe(inserted.id)
    expect(refreshed).toEqual(expect.arrayContaining([...created, inserted.id]))
  })

  it('pages every shot that shares a millisecond', async () => {
    const coffee = await createCoffee(uniq('Same Millisecond Coffee'))
    const sameMs = '2026-06-01 12:00:00.123456'
    const laterMicro = '2026-06-01 12:00:00.123457'
    const earlierMicro = '2026-06-01 12:00:00.123455'
    const nextMs = '2026-06-01 12:00:00.124000'
    const rows = [
      { id: crypto.randomUUID(), createdAt: sameMs },
      { id: crypto.randomUUID(), createdAt: sameMs },
      { id: crypto.randomUUID(), createdAt: sameMs },
      { id: crypto.randomUUID(), createdAt: laterMicro },
      { id: crypto.randomUUID(), createdAt: earlierMicro },
      { id: crypto.randomUUID(), createdAt: nextMs },
    ]
    await db.insert(espressoShots).values(
      rows.map((row) => ({
        id: row.id,
        userId: USER_A,
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        createdAt: sql`${row.createdAt}::timestamp`,
      })),
    )

    // Six rows at two a page: the third page must end the list.
    const collected = await walkCursors(3, undefined, (cursor) =>
      asA.espressoShot.getRecent({ limit: 2, coffeeId: coffee.id, cursor }),
    )

    expect(collected).toHaveLength(rows.length)
    expect(new Set(collected).size).toBe(rows.length)
    // Newest first, then the higher id among equal timestamps (uuid order is
    // the order of their lowercase hex text).
    const newestFirst = [...rows].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || (b.id < a.id ? -1 : 1),
    )
    expect(collected).toEqual(newestFirst.map((row) => row.id))
  })

  it('rejects a malformed cursor', async () => {
    await expect(
      asA.espressoShot.getRecent({ limit: 2, cursor: 'not-a-cursor' }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('rejects an offset from a client that predates cursors', async () => {
    await expect(
      asA.espressoShot.getRecent({ limit: 2, offset: 20 } as never),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('rejects a search containing NUL as a bad request', async () => {
    await expect(
      asA.espressoShot.getRecent({ limit: 2, q: 'huila\0grind' }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('rejects a cursor with an out-of-range timestamp', async () => {
    const cursor = encodeEspressoShotCursor({
      createdAt: '2026-99-99 12:00:00.123456',
      id: '00000000-0000-4000-8000-000000000001',
    })
    await expect(
      asA.espressoShot.getRecent({ limit: 2, cursor }),
    ).rejects.toMatchObject({ code: TRPC_BAD_REQUEST })
  })

  it('does not match Sealed settings in search', async () => {
    const coffee = await createCoffee(uniq('Sealed Search Coffee'))
    const grindSetting = uniq('sealed-grind')
    const shot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting,
      idempotencyKey: crypto.randomUUID(),
    })
    const before = await asA.espressoShot.getRecent({
      limit: 50,
      q: grindSetting,
    })
    expect(before.items.map((item) => item.id)).toContain(shot.id)

    await db
      .update(espressoShots)
      .set({ sealedAt: new Date() })
      .where(eq(espressoShots.id, shot.id))

    const after = await asA.espressoShot.getRecent({
      limit: 50,
      q: grindSetting,
    })
    expect(after.items.map((item) => item.id)).not.toContain(shot.id)
    expect(after.total).toBe(before.total - 1)

    const byCoffee = await asA.espressoShot.getRecent({
      limit: 50,
      q: coffee.name,
    })
    const sealed = byCoffee.items.find((item) => item.id === shot.id)
    expect(sealed?.sealed).toBe(true)
    expect(sealed?.grindSetting).toBeNull()
  })

  it('treats 16 and 16.0 as the same dose on replay', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '16.0',
      yield: '32.00',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    const replayed = await asA.espressoShot.create({
      ...input,
      dose: '16',
      yield: '32',
    })
    expect(replayed.id).toBe(first.id)

    await expect(
      asA.espressoShot.create({
        ...input,
        dose: '16.1',
      }),
    ).rejects.toMatchObject({ code: TRPC_CONFLICT })
  })

  it('returns the same row when a retry uppercases the relation ids', async () => {
    const idempotencyKey = crypto.randomUUID()
    const input = {
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey,
    }
    const first = await asA.espressoShot.create(input)
    const replayed = await asA.espressoShot.create({
      ...input,
      coffeeId: coffeeAId.toUpperCase(),
      grinderId: grinderId.toUpperCase(),
      brewingDeviceId: espressoDeviceId.toUpperCase(),
      idempotencyKey: idempotencyKey.toUpperCase(),
    })
    expect(replayed.id).toBe(first.id)
  })
})

describe('espressoShot.getLatestUnsealed', () => {
  it('returns the newest unsealed shot for that coffee', async () => {
    const coffee = await createCoffee(uniq('Prefill Coffee'))
    await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '16',
      yield: '32',
      time: 28,
      grindSetting: 'old',
      idempotencyKey: crypto.randomUUID(),
    })
    const latest = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'new',
      idempotencyKey: crypto.randomUUID(),
    })
    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    expect(found?.id).toBe(latest.id)
    expect(found?.grindSetting).toBe('new')
  })

  it('returns null when that coffee has no shot', async () => {
    const coffee = await createCoffee(uniq('No Shots'))
    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    expect(found).toBeNull()
  })

  it('does not return another user’s shot', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // A finds it, so B's null is the user scope, not a missing shot.
    expect(
      (await asA.espressoShot.getLatestUnsealed({ coffeeId: coffeeAId }))?.id,
    ).toBe(shot.id)
    const found = await asB.espressoShot.getLatestUnsealed({
      coffeeId: coffeeAId,
    })
    expect(found).toBeNull()
  })

  it('skips a newer legacy shot of another user on the caller’s coffee', async () => {
    // B's coffee, so only the shot's owner, not the coffee's, can tell the
    // two shots apart.
    const coffee = await createCoffeeFor(
      asB,
      uniqFor(USER_B),
    )(uniqFor(USER_B)('Shared Legacy Coffee'))
    const [own] = await db
      .insert(espressoShots)
      .values({
        userId: USER_B,
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        createdAt: daysAgo(2),
      })
      .returning()
    await db.insert(espressoShots).values({
      userId: USER_A,
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '19',
      yield: '38',
      createdAt: daysAgo(1),
    })
    const found = await asB.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    expect(found?.id).toBe(own.id)
  })

  it('returns the latest readable shot even behind newer sealed shots', async () => {
    const coffee = await createCoffee(uniq('Sealed Prefill Coffee'))
    const readable = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '16',
      yield: '32',
      time: 28,
      grindSetting: 'readable',
      idempotencyKey: crypto.randomUUID(),
    })
    const sealedIds: Array<string> = []
    for (let i = 0; i < 25; i++) {
      const shot = await asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: `sealed-${i}`,
        idempotencyKey: crypto.randomUUID(),
      })
      sealedIds.push(shot.id)
    }
    await db
      .update(espressoShots)
      .set({ sealedAt: new Date() })
      .where(inArray(espressoShots.id, sealedIds))

    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    expect(found?.id).toBe(readable.id)
    expect(found?.grindSetting).toBe('readable')
  })

  it('follows a shot reassigned to another coffee without a sealed stamp', async () => {
    const source = await createCoffee(uniq('Reassign Source'))
    const destination = await createCoffee(uniq('Reassign Dest'))
    const older = await asA.espressoShot.create({
      coffeeId: destination.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '16',
      yield: '32',
      time: 28,
      grindSetting: 'older',
      idempotencyKey: crypto.randomUUID(),
    })
    const moved = await asA.espressoShot.create({
      coffeeId: source.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'moved',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.espressoShot.update({
      id: moved.id,
      coffeeId: destination.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'moved',
    })

    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: destination.id,
    })
    expect(found?.id).toBe(moved.id)
    expect(found?.id).not.toBe(older.id)
    const fromSource = await asA.espressoShot.getLatestUnsealed({
      coffeeId: source.id,
    })
    expect(fromSource).toBeNull()
  })

  it('breaks a createdAt tie the same way getRecent does', async () => {
    const coffee = await createCoffee(uniq('Tied Prefill Coffee'))
    const first = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '16',
      yield: '32',
      time: 28,
      grindSetting: 'tied-a',
      idempotencyKey: crypto.randomUUID(),
    })
    const second = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'tied-b',
      idempotencyKey: crypto.randomUUID(),
    })
    const [row] = await db
      .select({ createdAt: espressoShots.createdAt })
      .from(espressoShots)
      .where(eq(espressoShots.id, second.id))
    await db
      .update(espressoShots)
      .set({ createdAt: row.createdAt })
      .where(inArray(espressoShots.id, [first.id, second.id]))

    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id,
    })
    const page = await asA.espressoShot.getRecent({
      limit: 1,
      coffeeId: coffee.id,
    })
    expect(found?.id).toBe(page.items[0]?.id)
    expect(found?.id).toBe(first.id > second.id ? first.id : second.id)
  })

  it('finds the latest unsealed shot when coffeeId is uppercase', async () => {
    const coffee = await createCoffee(uniq('Uppercase Prefill Coffee'))
    const latest = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: 'upper',
      idempotencyKey: crypto.randomUUID(),
    })
    const found = await asA.espressoShot.getLatestUnsealed({
      coffeeId: coffee.id.toUpperCase(),
    })
    expect(found?.id).toBe(latest.id)
    expect(found?.grindSetting).toBe('upper')
  })
})

describe('espressoShot.getDialedIn', () => {
  it('returns only each coffee’s dialed-in reference shot, with relations', async () => {
    const coffee = await createCoffee(uniq('Dialed Coffee'))
    const dialedShot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // A second, non-dialed shot for the same coffee must be excluded.
    const otherShot = await asA.espressoShot.create({
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '20',
      yield: '40',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceId,
      brewId: dialedShot.id,
    })

    const dialedIn = await asA.espressoShot.getDialedIn()

    const entry = dialedIn.find((s) => s.id === dialedShot.id)
    expect(entry).toBeTruthy()
    expect(entry!.coffee.name).toBe(coffee.name)
    expect(entry!.grinder?.name).toBeTruthy()
    expect(entry!.brewingDevice?.type).toBeTruthy()

    expect(dialedIn.some((s) => s.id === otherShot.id)).toBe(false)
    // Every returned shot is flagged as a dialed-in reference.
    expect(dialedIn.every((s) => s.isDialedIn)).toBe(true)
  })

  it('returns shots ordered most recent first', async () => {
    // Two of its own, one after the other, so the order is checked even when
    // this test runs alone.
    const seeded: Array<string> = []
    for (const label of ['Older Dialed', 'Newer Dialed']) {
      const coffee = await createCoffee(uniq(label))
      const shot = await asA.espressoShot.create({
        coffeeId: coffee.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      })
      await asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceId,
        brewId: shot.id,
      })
      seeded.push(shot.id)
    }
    const dialedIn = await asA.espressoShot.getDialedIn()
    expect(
      dialedIn.map((s) => s.id).filter((id) => seeded.includes(id)),
    ).toEqual([seeded[1], seeded[0]])
    const times = dialedIn.map((s) => new Date(s.createdAt).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('caps the result to the requested limit', async () => {
    // Ensure at least two dialed-in coffees exist for this user.
    for (let i = 0; i < 2; i++) {
      const c = await createCoffee(uniq('Capped Coffee'))
      const s = await asA.espressoShot.create({
        coffeeId: c.id,
        grinderId,
        brewingDeviceId: espressoDeviceId,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      })
      await asA.dialedInBrew.set({
        brewingMethod: 'espresso',
        brewingDeviceId: espressoDeviceId,
        brewId: s.id,
      })
    }
    const all = await asA.espressoShot.getDialedIn()
    expect(all.length).toBeGreaterThanOrEqual(2)
    const limited = await asA.espressoShot.getDialedIn({ limit: 1 })
    expect(limited.length).toBe(1)
  })

  it('does not return another user’s dialed-in shots', async () => {
    // Each user has a Dialed-in shot of their own, so an unscoped query and
    // one that drops B's shot both fail.
    const uniqB = uniqFor(USER_B)
    // Room for a second set of gear when other tests already gave B one.
    await grantPlan(USER_B, 'pro')
    const coffeeB = await createCoffeeFor(asB, uniqB)(uniqB('Dialed Guji'))
    const grinderB = await asB.grinder.create({
      name: uniqB('Dialed Niche'),
      brand: 'Niche',
    })
    const deviceB = await asB.brewingDevice.create({
      name: uniqB('Dialed Linea'),
      brand: 'La Marzocco',
      typeId: await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE),
    })
    const shotB = await asB.espressoShot.create({
      coffeeId: coffeeB.id,
      grinderId: grinderB.id,
      brewingDeviceId: deviceB.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await asB.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: deviceB.id,
      brewId: shotB.id,
    })
    const shotA = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    await asA.dialedInBrew.set({
      brewingMethod: 'espresso',
      brewingDeviceId: espressoDeviceId,
      brewId: shotA.id,
    })
    expect((await asA.espressoShot.getDialedIn()).map((s) => s.id)).toContain(
      shotA.id,
    )

    const dialedIn = await asB.espressoShot.getDialedIn()
    expect(dialedIn.map((s) => s.id)).toEqual([shotB.id])
  })
})

describe('espresso_shot_idempotency_keys shot_id lookup', () => {
  it('uses an index for ON DELETE SET NULL and losing-request cleanup', async () => {
    const shot = await asA.espressoShot.create({
      coffeeId: coffeeAId,
      grinderId,
      brewingDeviceId: espressoDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })

    const lookupPlan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`)
      return tx.execute<{ 'QUERY PLAN': string }>(sql`
        EXPLAIN SELECT 1
        FROM espresso_shot_idempotency_keys
        WHERE shot_id = ${shot.id}
      `)
    })
    const lookupText = lookupPlan.rows
      .map((row) => row['QUERY PLAN'])
      .join('\n')
    expect(lookupText).toMatch(/Index Scan|Index Only Scan|Bitmap Index Scan/)
    // The table name contains "shot_id" too, so match the scan's index
    // condition rather than any mention of the column.
    expect(lookupText).toMatch(/Index Cond: \(shot_id = /)
  })
})
