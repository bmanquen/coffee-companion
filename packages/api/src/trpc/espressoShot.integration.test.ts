import { beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, espressoShots } from '../db/schema'
import {
  ESPRESSO_DEVICE_TYPE,
  encodeEspressoShotCursor,
} from '../lib/espresso'
import {
  UNKNOWN_UUID,
  callerFor,
  createCoffeeFor,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import {
  SHOT_IDEMPOTENCY_DELETED,
  TRPC_BAD_REQUEST,
  TRPC_CONFLICT,
} from './espressoShot'

const USER_A = 'espresso-user-a'
const USER_B = 'espresso-user-b'
const USER_REPLAY_STAMP = 'espresso-user-replay-stamp'
const asA = callerFor(USER_A)
const asB = callerFor(USER_B)
const uniq = uniqFor(USER_A)
const createCoffee = createCoffeeFor(asA, uniq)

let espressoDeviceId: string
let pourOverDeviceId: string
let grinderId: string
let coffeeAId: string

// Device types are globally unique; reuse existing rows or create-and-track new
// ones so cleanup never deletes seeded data on a shared database.
const createdTypeIds: Array<string> = []
async function findOrCreateDeviceType(name: string): Promise<string> {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, name))
  if (existing[0]) return existing[0].id
  const [row] = await db.insert(brewingDeviceTypes).values({ name }).returning()
  createdTypeIds.push(row.id)
  return row.id
}

seedUsers([USER_A, USER_B, USER_REPLAY_STAMP], async () => {
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
    const second = await asA.espressoShot.create(input)
    expect(second.id).toBe(first.id)
    expect(second.dose).toBe('18')
    const page = await asA.espressoShot.getRecent({ limit: 50 })
    expect(page.items.filter((shot) => shot.id === first.id)).toHaveLength(1)
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
    expect(
      stampsAfter.map((row) => ({
        id: row.id,
        sealedAt: row.sealedAt?.getTime() ?? null,
      })),
    ).toEqual(
      stampsBefore.map((row) => ({
        id: row.id,
        sealedAt: row.sealedAt?.getTime() ?? null,
      })),
    )
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
    const coffeeB = await createCoffeeFor(asB, uniqFor(USER_B))(
      uniqFor(USER_B)('Other Guji'),
    )
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
    await expect(asB.espressoShot.getById(forA.id)).rejects.toThrow(/not found/i)
  })
})

describe('espressoShot.getRecent', () => {
  it('returns the user shots with relations', async () => {
    const shots = (await asA.espressoShot.getRecent({ limit: 50 })).items
    expect(shots.length).toBeGreaterThanOrEqual(1)
    expect(shots.every((s) => s.userId === USER_A)).toBe(true)
    expect(shots[0].coffee).toBeTruthy()
    expect(shots[0].brewingDevice?.type).toBeTruthy()
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
    expect(byText.items.every((shot) => shot.grindSetting !== 'guji-grind')).toBe(
      true,
    )
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
    expect(page1.items.map((shot) => shot.id)).toEqual([
      created[2],
      created[1],
    ])
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
    const shots = (await asA.espressoShot.getRecent({ limit: 50 }))
      .items
    expect(shots[0]?.coffee.roaster).toEqual(
      expect.objectContaining({ name: expect.any(String) }),
    )
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

    const collected = [...page1.items]
    let cursor = page1.nextCursor
    while (cursor) {
      const page = await asA.espressoShot.getRecent({
        limit: 2,
        coffeeId: coffee.id,
        cursor,
      })
      collected.push(...page.items)
      cursor = page.nextCursor
    }
    const collectedIds = collected.map((shot) => shot.id)
    expect(new Set(collectedIds).size).toBe(collectedIds.length)
    expect(collectedIds).toEqual(expect.arrayContaining(created))
    expect(collectedIds).not.toContain(inserted.id)
    expect(collectedIds).toHaveLength(created.length)

    const refreshed: Array<string> = []
    let next = undefined as typeof page1.nextCursor | undefined
    for (;;) {
      const page = await asA.espressoShot.getRecent({
        limit: 2,
        coffeeId: coffee.id,
        cursor: next ?? undefined,
      })
      refreshed.push(...page.items.map((shot) => shot.id))
      if (!page.nextCursor) break
      next = page.nextCursor
    }
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

    const collected: Array<string> = []
    let cursor: string | undefined
    for (;;) {
      const page = await asA.espressoShot.getRecent({
        limit: 2,
        coffeeId: coffee.id,
        cursor,
      })
      collected.push(...page.items.map((shot) => shot.id))
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }

    expect(collected).toHaveLength(rows.length)
    expect(new Set(collected).size).toBe(rows.length)
    expect([...collected].sort()).toEqual([...rows.map((row) => row.id)].sort())
  })

  it('rejects a malformed cursor', async () => {
    await expect(
      asA.espressoShot.getRecent({ limit: 2, cursor: 'not-a-cursor' }),
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

    await db
      .update(espressoShots)
      .set({ dose: null })
      .where(eq(espressoShots.id, first.id))
    await expect(
      asA.espressoShot.create({
        ...input,
        dose: '16',
        yield: '32',
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
    const found = await asB.espressoShot.getLatestUnsealed({
      coffeeId: coffeeAId,
    })
    expect(found).toBeNull()
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
    const dialedIn = await asA.espressoShot.getDialedIn()
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
    const dialedIn = await asB.espressoShot.getDialedIn()
    expect(dialedIn.every((s) => s.userId === USER_B)).toBe(true)
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
    const lookupText = lookupPlan.rows.map((row) => row['QUERY PLAN']).join('\n')
    expect(lookupText).toMatch(/Index Scan|Index Only Scan|Bitmap Index Scan/)
    expect(lookupText).toMatch(/shot_id/)
  })
})
