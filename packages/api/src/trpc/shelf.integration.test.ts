import { beforeAll, describe, expect, it, vi } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  batchedCallerFor,
  callerFor,
  createCoffeeFor,
  deviceTypes,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

// The Shelf and Sealing, observed through the espresso feeds. A Free user reads
// the Brews of their five most-recently-brewed Coffees; what falls off is
// Sealed — still returned, without its settings.
const USER = 'shelf-user'
const asUser = callerFor(USER)
const uniq = uniqFor(USER)
const createCoffee = createCoffeeFor(asUser, uniq)

// A second user for the promotion tests at the foot of this file, so they build
// their own Shelf instead of inheriting the one the tests above have churned.
const PROMOTED = 'shelf-promoted-user'
const asPromoted = callerFor(PROMOTED)
const uniqPromoted = uniqFor(PROMOTED)
const createPromotedCoffee = createCoffeeFor(asPromoted, uniqPromoted)

const types = deviceTypes()

// A third user for the snapshot test, with a Shelf of its own.
const SNAPSHOT = 'shelf-snapshot-user'
const asSnapshot = callerFor(SNAPSHOT)
const uniqSnapshot = uniqFor(SNAPSHOT)
const createSnapshotCoffee = createCoffeeFor(asSnapshot, uniqSnapshot)

// A fourth for the batched create test.
const BATCH = 'shelf-batch-user'
const asBatch = callerFor(BATCH)
const uniqBatch = uniqFor(BATCH)
const createBatchCoffee = createCoffeeFor(asBatch, uniqBatch)

// A fifth for the stamp race test.
const RACE = 'shelf-race-user'
const asRace = callerFor(RACE)
const uniqRace = uniqFor(RACE)
const createRaceCoffee = createCoffeeFor(asRace, uniqRace)

// A sixth for the stamp-retry test.
const RETRY = 'shelf-retry-user'
const asRetry = callerFor(RETRY)
const uniqRetry = uniqFor(RETRY)
const createRetryCoffee = createCoffeeFor(asRetry, uniqRetry)

seedUsers([USER, PROMOTED, SNAPSHOT, BATCH, RACE, RETRY], types.cleanup)

let grinderId: string
let deviceId: string
let roasterId: string
// The six Coffees, oldest-brewed first. coffees[0] is the one that falls off.
const coffees: Array<{ id: string; name: string; shotId: string }> = []

// Counted rather than hard-coded, so an earlier failure doesn't fail this too.
let shotsLogged = 0

async function logShot(coffeeId: string) {
  const shot = await asUser.espressoShot.create({
    coffeeId,
    grinderId,
    brewingDeviceId: deviceId,
    dose: '18',
    yield: '36',
    time: 28,
    grindSetting: '1.5',
    idempotencyKey: crypto.randomUUID(),
  })
  shotsLogged++
  return shot.id
}

beforeAll(async () => {
  const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
  const device = await asUser.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  deviceId = device.id
  const grinder = await asUser.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  grinderId = grinder.id
  const roaster = await asUser.roaster.create({ name: uniq('Sey') })
  roasterId = roaster.id

  // Six Coffees, each brewed once, oldest first — so the Shelf holds the last
  // five and coffees[0] falls off it.
  for (let i = 0; i < 6; i++) {
    const name = uniq(`Coffee ${i}`)
    const coffee = await createCoffee(name, { roasterId })
    const shotId = await logShot(coffee.id)
    coffees.push({ id: coffee.id, name, shotId })
  }

  // Dial in the shot that will later Seal. It has to happen now: once Sealed, a
  // Brew can no longer be made the reference to reproduce.
  await asUser.dialedInBrew.set({
    brewingMethod: 'espresso',
    brewingDeviceId: deviceId,
    brewId: coffees[1].shotId,
  })
})

const shotById = async (id: string) => {
  const all = (await asUser.espressoShot.getRecent({ limit: 50 })).items
  const found = all.find((shot) => shot.id === id)
  if (!found) throw new Error(`Shot ${id} missing from the feed entirely`)
  return found
}

describe('the Shelf on Free', () => {
  it('reads the shots of the five most-recently-brewed coffees', async () => {
    for (const coffee of coffees.slice(1)) {
      const shot = await shotById(coffee.shotId)
      expect(shot.sealed).toBe(false)
      expect(shot.dose).toBe('18')
    }
  })

  it('Seals the shots of a coffee that has fallen off, without dropping them', async () => {
    const shot = await shotById(coffees[0].shotId)

    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)
    expect(shot.time).toBe(null)
    // Still identifiable: the user can see the shot exists, and on which coffee.
    expect(shot.coffee.name).toBe(coffees[0].name)
  })
})

describe('a Coffee off the Shelf', () => {
  it('is still fully usable, and a new shot on it reads straight away', async () => {
    const fallen = coffees[0]
    const freshShotId = await logShot(fallen.id)

    const fresh = await shotById(freshShotId)
    expect(fresh.sealed).toBe(false)
    expect(fresh.dose).toBe('18')
  })

  it('keeps the shots Sealed earlier Sealed — brewing again never reopens them', async () => {
    const original = await shotById(coffees[0].shotId)
    expect(original.sealed).toBe(true)
    expect(original.dose).toBe(null)
  })

  it('never Seals a coffee on arrival', async () => {
    const coffee = await createCoffee(uniq('Just added'), { roasterId })
    const shotId = await logShot(coffee.id)

    expect((await shotById(shotId)).sealed).toBe(false)
  })
})

describe('Sealing and the Plan', () => {
  it('withholds a Sealed shot from the dial-ins without dropping it', async () => {
    const dialedIn = await asUser.espressoShot.getDialedIn()
    const shot = dialedIn.find((row) => row.id === coffees[1].shotId)

    // Still the coffee's reference shot, just not a readable one.
    expect(shot?.sealed).toBe(true)
    expect(shot?.dose).toBe(null)
  })

  it('reopens every Sealed shot the moment the Plan is paid, with no writes', async () => {
    const before = await db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))

    await grantPlan(USER, 'pro')

    const all = (await asUser.espressoShot.getRecent({ limit: 50 })).items
    // An empty page would pass the checks below without reopening anything.
    expect(all.map((shot) => shot.id)).toEqual(
      expect.arrayContaining(coffees.map((coffee) => coffee.shotId)),
    )
    expect(all.every((shot) => shot.sealed === false)).toBe(true)
    expect(all.every((shot) => shot.dose === '18')).toBe(true)

    // Reopening is a matter of the Plan, not of unstamping: the stamps are
    // untouched, so nothing was written to reopen them.
    const after = await db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))
    expect(after).toEqual(before)
  })

  it('re-Seals what falls off when the Grant expires, with no event to react to', async () => {
    await expireGrants(USER)

    expect((await shotById(coffees[1].shotId)).sealed).toBe(true)
  })

  it('never re-stamps a Brew it has already Sealed', async () => {
    const stampOf = async (id: string) =>
      (
        await db
          .select({ sealedAt: espressoShots.sealedAt })
          .from(espressoShots)
          .where(eq(espressoShots.id, id))
      )[0].sealedAt

    const first = await stampOf(coffees[1].shotId)
    await asUser.espressoShot.getRecent({ limit: 50 })
    await asUser.espressoShot.getRecent({ limit: 50 })

    expect(await stampOf(coffees[1].shotId)).toEqual(first)
  })

  it('deletes nothing, whatever the Plan', async () => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))
    expect(Number(total)).toBe(shotsLogged)
  })

  it('still lets a Free user log and edit whatever they like', async () => {
    const coffee = await createCoffee(uniq('Logging is free'), { roasterId })
    const shotId = await logShot(coffee.id)

    const updated = await asUser.espressoShot.update({
      id: shotId,
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId: deviceId,
      dose: '20',
      yield: '40',
      time: 30,
      grindSetting: '1.5',
    })
    expect(updated.dose).toBe('20')
  })
})

describe('every espresso read path', () => {
  it('still reports a coffee as Dialed-in when its membership is Sealed', async () => {
    const list = await asUser.coffee.getAll()
    const sealedCoffee = list.find((coffee) => coffee.id === coffees[1].id)

    expect(sealedCoffee?.isDialedIn).toBe(true)
  })

  it('withholds a Sealed shot fetched on its own', async () => {
    const shot = await asUser.espressoShot.getById(coffees[1].shotId)

    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)
  })
})

// Reading is the Shelf compared against, not a repair pass that has to have run
// first. These run last: the first one clears every stamp, which is a state no
// earlier test should inherit.
describe('reading needs no prior write', () => {
  const stamps = async () =>
    db
      .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.userId, USER))

  it('withholds a shot off the Shelf that carries no stamp, and stamps nothing to do it', async () => {
    await db
      .update(espressoShots)
      .set({ sealedAt: null })
      .where(eq(espressoShots.userId, USER))

    const shot = await shotById(coffees[1].shotId)
    expect(shot.sealed).toBe(true)
    expect(shot.dose).toBe(null)

    expect((await stamps()).every((row) => row.sealedAt === null)).toBe(true)
  })

  it('stamps when a shot is logged, so a coffee returning to the Shelf reopens nothing', async () => {
    // Logging is the only way a coffee comes back onto the Shelf, so it is the
    // one place Sealing has to be made permanent.
    await logShot(coffees[1].id)

    const original = await shotById(coffees[1].shotId)
    expect(original.sealed).toBe(true)
    expect(original.dose).toBe(null)
  })

  it('computes the Shelf once for a request that reads several feeds', async () => {
    // What a dashboard load looks like: tRPC batches its feeds into one HTTP
    // request, so they share one context. The Shelf query is the only
    // db.execute in the API — drizzle's relational queries run through the
    // session instead — so counting them counts Shelf computations.
    const inOneRequest = batchedCallerFor(USER)
    const execute = vi.spyOn(db, 'execute')
    try {
      // Only reads that share the request's Shelf: espressoShot.getRecent and
      // getLatestUnsealed read their own inside their snapshot, through the
      // transaction, which this spy does not see.
      await Promise.all([
        inOneRequest.espressoShot.getDialedIn(),
        inOneRequest.aeropressBrew.getDialedIn(),
        inOneRequest.pouroverBrew.getRecent({ limit: 10, offset: 0 }),
        inOneRequest.coffee.getAll(),
      ])
      expect(execute).toHaveBeenCalledTimes(1)
    } finally {
      execute.mockRestore()
    }
  })
})

describe('a Sealed shot', () => {
  it('cannot be saved over, so the withheld settings survive', async () => {
    await expect(
      asUser.espressoShot.update({
        id: coffees[1].shotId,
        coffeeId: coffees[1].id,
        grinderId,
        brewingDeviceId: deviceId,
        dose: '99',
        yield: '99',
        time: 99,
        grindSetting: 'hacked',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const [stored] = await db
      .select({ dose: espressoShots.dose })
      .from(espressoShots)
      .where(eq(espressoShots.id, coffees[1].shotId))
    expect(stored.dose).toBe('18')
  })
})

// Sealing is one-way, so anything that can promote a Coffee back onto the Shelf
// has to Seal what is already off it first. Logging a Brew is the obvious one.
// The ones easy to miss are the deletions: removing whatever displaced a Coffee
// hands it back its old slot, and with it every Brew it was withheld for.
describe('a Coffee promoted back onto the Shelf', () => {
  let promotedGrinder: string
  let promotedDevice: string
  let promotedRoaster: string

  const logPromotedShot = async (coffeeId: string) =>
    (
      await asPromoted.espressoShot.create({
        coffeeId,
        grinderId: promotedGrinder,
        brewingDeviceId: promotedDevice,
        dose: '18',
        yield: '36',
        time: 28,
        grindSetting: '1.5',
        idempotencyKey: crypto.randomUUID(),
      })
    ).id

  const addCoffee = async (label: string) =>
    (
      await createPromotedCoffee(uniqPromoted(label), {
        roasterId: promotedRoaster,
      })
    ).id

  const promotedShotById = async (id: string) => {
    const all = (await asPromoted.espressoShot.getRecent({ limit: 50 })).items
    const found = all.find((shot) => shot.id === id)
    if (!found) throw new Error(`Shot ${id} missing from the feed entirely`)
    return found
  }

  beforeAll(async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    promotedDevice = (
      await asPromoted.brewingDevice.create({
        name: uniqPromoted('Linea Mini'),
        brand: 'La Marzocco',
        typeId,
      })
    ).id
    promotedGrinder = (
      await asPromoted.grinder.create({
        name: uniqPromoted('Niche Zero'),
        brand: 'Niche',
      })
    ).id
    promotedRoaster = (await asPromoted.roaster.create({ name: uniqPromoted('Sey') })).id
  })

  it('stays Sealed when the Coffee that displaced it is deleted', async () => {
    const displaced = await addCoffee('Displaced')
    const displacedShot = await logPromotedShot(displaced)

    // Coffees with no Brews, which rank by when they were added — so these
    // displace it without a Brew ever being logged, and nothing stamps.
    const displacers: Array<string> = []
    for (let i = 0; i < 5; i++) displacers.push(await addCoffee(`Displacer ${i}`))
    expect((await promotedShotById(displacedShot)).sealed).toBe(true)

    // Deleting one hands the displaced Coffee its slot back.
    await asPromoted.coffee.delete(displacers[0])

    expect((await promotedShotById(displacedShot)).sealed).toBe(true)
  })

  it('stays Sealed when the Brew that displaced it is deleted', async () => {
    // A Coffee outranks another by its last Brew, so deleting that Brew drops it
    // back to when it was added — and promotes whatever was sitting beneath it.
    const jumper = await addCoffee('Jumper')
    const displaced = await addCoffee('Displaced by a brew')
    const displacedShot = await logPromotedShot(displaced)
    // Brewed after it was added, so the jumper now outranks the displaced Coffee.
    const jumperShot = await logPromotedShot(jumper)

    // Four more Coffees with no Brews push the displaced one off the Shelf,
    // again with no Brew logged to stamp it.
    for (let i = 0; i < 4; i++) await addCoffee(`Filler ${i}`)
    expect((await promotedShotById(displacedShot)).sealed).toBe(true)

    // The jumper falls back below it, handing its slot to the displaced Coffee.
    await asPromoted.espressoShot.delete(jumperShot)

    expect((await promotedShotById(displacedShot)).sealed).toBe(true)
  })
})

describe('espressoShot.getLatestUnsealed', () => {
  it('answers from one snapshot even when writes land between its reads', async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await asSnapshot.brewingDevice.create({
      name: uniqSnapshot('Linea Mini'),
      brand: 'La Marzocco',
      typeId,
    })
    const grinder = await asSnapshot.grinder.create({
      name: uniqSnapshot('Niche Zero'),
      brand: 'Niche',
    })
    const log = async (coffeeId: string) =>
      (
        await asSnapshot.espressoShot.create({
          coffeeId,
          grinderId: grinder.id,
          brewingDeviceId: device.id,
          dose: '18',
          yield: '36',
          time: 28,
          grindSetting: '1.5',
          idempotencyKey: crypto.randomUUID(),
        })
      ).id
    // Five Coffees fill the Free Shelf; the first is the next to fall off.
    const shelfCoffees: Array<string> = []
    for (let i = 0; i < 5; i++) {
      shelfCoffees.push(
        (await createSnapshotCoffee(uniqSnapshot(`Coffee ${i}`))).id,
      )
      await log(shelfCoffees[i])
    }
    const target = shelfCoffees[0]

    // Hold the read after its first statement, the Shelf query, which is
    // where a repeatable-read transaction takes its snapshot.
    let reachedShelf: () => void = () => {}
    const atShelf = new Promise<void>((resolve) => {
      reachedShelf = resolve
    })
    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const transaction = db.transaction.bind(db)
    const spy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce((run, config) =>
        transaction(async (tx) => {
          const execute = tx.execute.bind(tx)
          let paused = false
          tx.execute = (async (query: Parameters<typeof execute>[0]) => {
            const result = await execute(query)
            if (!paused) {
              paused = true
              reachedShelf()
              await released
            }
            return result
          }) as typeof tx.execute
          return run(tx)
        }, config),
      )
    let reading: Promise<unknown> | undefined
    try {
      const read = asSnapshot.espressoShot.getLatestUnsealed({
        coffeeId: target,
      })
      reading = read
      // Fail fast rather than hang if the read stops pausing in one
      // transaction, and with the read's own error if it fails first.
      const notPaused = new Error('Shelf and shot not read in one transaction')
      await Promise.race([
        atShelf,
        read.then(() => {
          throw notPaused
        }),
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Read did not reach the Shelf within 5s')),
            5_000,
          ),
        ),
      ])
      // Another connection edits the shot and pushes its Coffee off the Shelf.
      await db
        .update(espressoShots)
        .set({ dose: '99' })
        .where(eq(espressoShots.coffeeId, target))
      await log((await createSnapshotCoffee(uniqSnapshot('Newcomer'))).id)
      release()

      const found = await read
      expect(found?.dose).toBe('18')
      expect(found?.sealed).toBe(false)
    } finally {
      release()
      // Whatever failed above, let the read finish before cleanup runs.
      await reading?.catch(() => {})
      spy.mockRestore()
    }

    // The control: read afresh, the Coffee is off the Shelf.
    expect(
      await asSnapshot.espressoShot.getLatestUnsealed({ coffeeId: target }),
    ).toBeNull()
  })
})

describe('espressoShot.create', () => {
  it('returns the new shot unsealed when its request already read the Shelf', async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await asBatch.brewingDevice.create({
      name: uniqBatch('Linea Mini'),
      brand: 'La Marzocco',
      typeId,
    })
    const grinder = await asBatch.grinder.create({
      name: uniqBatch('Niche Zero'),
      brand: 'Niche',
    })
    const shot = (coffeeId: string) => ({
      coffeeId,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 28,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // Added first and then outranked by five brewed Coffees, so it starts off
    // the Free Shelf, and logging a shot on it puts it back on.
    const returning = (await createBatchCoffee(uniqBatch('Returning'))).id
    let onShelf = ''
    for (let i = 0; i < 5; i++) {
      const coffee = await createBatchCoffee(uniqBatch(`Coffee ${i}`))
      onShelf = (await asBatch.espressoShot.create(shot(coffee.id))).id
    }

    // One request, as a tRPC batch is: a read computes its Shelf before the
    // create's insert moves the Coffee onto it.
    const inOneRequest = batchedCallerFor(BATCH)
    await inOneRequest.espressoShot.getById(onShelf)
    const created = await inOneRequest.espressoShot.create(shot(returning))

    expect(created.sealed).toBe(false)
    expect(created.dose).toBe('18')
  })
})

// Polls until the create's stamp waits on the held lock. A create that
// settles first fails the test with its own outcome, at once.
async function untilStampWaits(
  creating: Promise<unknown>,
  waiting: () => Promise<boolean>,
) {
  let settled: { error: unknown } | undefined
  creating.then(
    () => (settled = { error: new Error('Create finished without waiting') }),
    (error: unknown) => (settled = { error }),
  )
  const deadline = Date.now() + 5_000
  while (!(await waiting())) {
    if (settled) throw settled.error
    if (Date.now() > deadline) throw new Error('Stamp never waited')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('stamping before a create', () => {
  it('does not Seal a shot another request saves after the Shelf was read', async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await asRace.brewingDevice.create({
      name: uniqRace('Linea Mini'),
      brand: 'La Marzocco',
      typeId,
    })
    const grinder = await asRace.grinder.create({
      name: uniqRace('Niche Zero'),
      brand: 'Niche',
    })
    const shot = (coffeeId: string) => ({
      coffeeId,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 28,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // Added first and outranked by five brewed Coffees: off the Free Shelf.
    const returning = (await createRaceCoffee(uniqRace('Returning'))).id
    let latest = ''
    for (let i = 0; i < 5; i++) {
      latest = (await createRaceCoffee(uniqRace(`Coffee ${i}`))).id
      await asRace.espressoShot.create(shot(latest))
    }

    // Another connection lets the create read the Shelf but holds its stamp's
    // write to espresso_shots, then saves a shot on the off-Shelf Coffee.
    const other = await db.$client.connect()
    let creating: Promise<unknown> | undefined
    try {
      await other.query('begin')
      await other.query('lock table espresso_shots in exclusive mode')
      creating = asRace.espressoShot.create(shot(latest))
      // The stamp's UPDATE: the create's INSERT would wait on this lock too.
      await untilStampWaits(creating, async () => {
        const waiting = await db.$client.query<{ n: number }>(
          `select count(*)::int as n
           from pg_locks l join pg_stat_activity a using (pid)
           where l.relation = 'espresso_shots'::regclass and not l.granted
             and a.query ilike 'update "espresso_shots"%'`,
        )
        return waiting.rows[0].n > 0
      })
      const saved = await other.query<{ id: string }>(
        `insert into espresso_shots
           (user_id, coffee_id, grinder_id, brewing_device_id, dose, yield)
         values ($1, $2, $3, $4, '18', '36') returning id`,
        [RACE, returning, grinder.id, device.id],
      )
      await other.query('commit')
      await creating

      const [row] = await db
        .select({ sealedAt: espressoShots.sealedAt })
        .from(espressoShots)
        .where(eq(espressoShots.id, saved.rows[0].id))
      expect(row.sealedAt).toBeNull()
    } finally {
      await other.query('rollback').catch(() => {})
      other.release()
      await creating?.catch(() => {})
    }
  })

  it('retries on a fresh Shelf when another request stamps a fallen shot first', async () => {
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await asRetry.brewingDevice.create({
      name: uniqRetry('Linea Mini'),
      brand: 'La Marzocco',
      typeId,
    })
    const grinder = await asRetry.grinder.create({
      name: uniqRetry('Niche Zero'),
      brand: 'Niche',
    })
    const shot = (coffeeId: string) => ({
      coffeeId,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 28,
      grindSetting: '1.5',
      idempotencyKey: crypto.randomUUID(),
    })
    // Brewed, then outranked by five brewed Coffees: off the Free Shelf.
    const fallen = await asRetry.espressoShot.create(
      shot((await createRetryCoffee(uniqRetry('Fallen'))).id),
    )
    const outranking: Array<string> = []
    let latest = ''
    for (let i = 0; i < 5; i++) {
      latest = (await createRetryCoffee(uniqRetry(`Outranking ${i}`))).id
      outranking.push((await asRetry.espressoShot.create(shot(latest))).id)
    }
    // Unstamped again, so two stamps race for it.
    await db
      .update(espressoShots)
      .set({ sealedAt: null })
      .where(eq(espressoShots.id, fallen.id))

    // Another connection stamps the fallen shot and adds a Coffee, pushing
    // the oldest brewed one off, and holds both while the create's stamp,
    // already past its Shelf read, waits to write the fallen shot.
    const other = await db.$client.connect()
    let creating: Promise<unknown> | undefined
    const stamp = new Date('2026-01-02T03:04:05Z')
    try {
      await other.query('begin')
      const xid = await other.query<{ xid: string }>(
        'select pg_current_xact_id()::text as xid',
      )
      await other.query(
        'update espresso_shots set sealed_at = $1 where id = $2',
        [stamp, fallen.id],
      )
      await other.query('insert into coffees (user_id, name) values ($1, $2)', [
        RETRY,
        uniqRetry('Newest'),
      ])
      creating = asRetry.espressoShot.create(shot(latest))
      await untilStampWaits(creating, async () => {
        const waiting = await db.$client.query<{ n: number }>(
          `select count(*)::int as n from pg_locks
           where locktype = 'transactionid' and not granted
             and transactionid::text = $1`,
          [xid.rows[0].xid],
        )
        return waiting.rows[0].n > 0
      })
      await other.query('commit')
      await creating

      const [row] = await db
        .select({ sealedAt: espressoShots.sealedAt })
        .from(espressoShots)
        .where(eq(espressoShots.id, fallen.id))
      expect(row.sealedAt).toEqual(stamp)
      // Only a stamp that read the Shelf again sees this one fall off.
      const [pushedOff] = await db
        .select({ sealedAt: espressoShots.sealedAt })
        .from(espressoShots)
        .where(eq(espressoShots.id, outranking[0]))
      expect(pushedOff.sealedAt).not.toBeNull()
    } finally {
      await other.query('rollback').catch(() => {})
      other.release()
      await creating?.catch(() => {})
    }
  })
})
