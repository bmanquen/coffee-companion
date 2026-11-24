import { describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { COLD_BREW_DEVICE_TYPE } from '../lib/cold-brew'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { FRENCH_PRESS_DEVICE_TYPE } from '../lib/frenchpress'
import { POUR_OVER_DEVICE_TYPE } from '../lib/pourover'
import {
  callerFor,
  createCoffeeFor,
  deviceTypes,
  expireGrants,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'

// Sealing is one-way (ADR-0004): a Brew withheld because its Coffee fell off
// the Shelf stays withheld when something hands that Coffee its slot back.
// Each test builds a lapsed subscriber whose Coffee X has fallen off a Free
// Shelf without a stamp, then does one write that lifts X back on.

const methods = [
  'espressoShot',
  'aeropressBrew',
  'pouroverBrew',
  'frenchpressBrew',
  'coldBrewBrew',
] as const
type Method = (typeof methods)[number]

const deviceTypeOf: Record<Method, string> = {
  espressoShot: ESPRESSO_DEVICE_TYPE,
  aeropressBrew: AEROPRESS_DEVICE_TYPE,
  pouroverBrew: POUR_OVER_DEVICE_TYPE,
  frenchpressBrew: FRENCH_PRESS_DEVICE_TYPE,
  coldBrewBrew: COLD_BREW_DEVICE_TYPE,
}

const USERS = {
  coffee: 'sealing-one-way-coffee',
  grinder: 'sealing-one-way-grinder',
  brewingDevice: 'sealing-one-way-device',
  race: 'sealing-one-way-race',
  sealedWhileWaiting: 'sealing-one-way-sealed-while-waiting',
  ...Object.fromEntries(methods.map((m) => [m, `sealing-one-way-${m}`])),
} as Record<
  | 'coffee'
  | 'grinder'
  | 'brewingDevice'
  | 'race'
  | 'sealedWhileWaiting'
  | Method,
  string
>

const types = deviceTypes()
seedUsers(Object.values(USERS), types.cleanup)

type Gear = { coffeeId: string; grinderId: string; brewingDeviceId: string }

async function scenario(userId: string, filler: Method) {
  const as = callerFor(userId)
  const uniq = uniqFor(userId)
  const createCoffee = createCoffeeFor(as, uniq)
  // Pro to hold the gear and to log the fixture without stamping anything.
  await grantPlan(userId, 'pro', { reason: 'sealing one-way fixture' })

  const grinder = await as.grinder.create({ name: uniq('G'), brand: 'x' })
  const fillerGrinder = await as.grinder.create({ name: uniq('G2'), brand: 'x' })
  const devices = {} as Record<Method, string>
  for (const method of methods) {
    const typeId = await types.findOrCreate(deviceTypeOf[method])
    devices[method] = (
      await as.brewingDevice.create({ name: uniq(method), brand: 'x', typeId })
    ).id
  }
  const fillerDevice = (
    await as.brewingDevice.create({
      name: uniq('filler'),
      brand: 'x',
      typeId: await types.findOrCreate(deviceTypeOf[filler]),
    })
  ).id
  const aeroMethod = await as.aeropressMethod.create({ name: uniq('A') })
  const pourMethod = await as.pouroverMethod.create({ name: uniq('P') })
  const frenchMethod = await as.frenchpressMethod.create({ name: uniq('F') })

  const log = async (method: Method, gear: Gear) => {
    const base = { ...gear, grindSetting: '18', notes: 'withheld notes' }
    switch (method) {
      case 'espressoShot':
        return as.espressoShot.create({
          ...base,
          dose: '18',
          yield: '36',
          time: 30,
          idempotencyKey: crypto.randomUUID(),
        })
      case 'aeropressBrew':
        return as.aeropressBrew.create({
          ...base,
          methodId: aeroMethod.id,
          dose: '18',
          water: '250',
          steepTime: 90,
        })
      case 'pouroverBrew':
        return as.pouroverBrew.create({
          ...base,
          methodId: pourMethod.id,
          dose: '18',
          water: '250',
          brewTime: 165,
          waterTemp: 94,
        })
      case 'frenchpressBrew':
        return as.frenchpressBrew.create({
          ...base,
          methodId: frenchMethod.id,
          dose: '18',
          water: '250',
          steepTime: 240,
          waterTemp: 95,
        })
      case 'coldBrewBrew':
        return as.coldBrewBrew.create({
          ...base,
          dose: '18',
          water: '250',
          steepTime: 1080,
          brewEnvironment: 'Fridge',
        })
    }
  }

  // Five Coffees added before X and brewed after it, so X is the one that
  // falls off a five-Coffee Shelf once the Plan lapses.
  const five = []
  for (let i = 0; i < 5; i++) five.push(await createCoffee(uniq(`C${i}`)))
  const x = await createCoffee(uniq('X'))
  const xBrews = {} as Record<Method, string>
  for (const method of methods) {
    xBrews[method] = (
      await log(method, {
        coffeeId: x.id,
        grinderId: grinder.id,
        brewingDeviceId: devices[method],
      })
    ).id
  }
  const fillerBrews = []
  for (const coffee of five) {
    fillerBrews.push(
      await log(filler, {
        coffeeId: coffee.id,
        grinderId: fillerGrinder.id,
        brewingDeviceId: fillerDevice,
      }),
    )
  }
  await expireGrants(userId)

  const expectXSealed = async () => {
    for (const method of methods) {
      const brew = await as[method].getById(xBrews[method])
      expect({ method, sealed: brew.sealed, notes: brew.notes }).toEqual({
        method,
        sealed: true,
        notes: null,
      })
    }
  }
  // Without this, a passing test could mean the fixture never Sealed X.
  await expectXSealed()

  return { as, x, fillerGrinder, fillerDevice, fillerBrews, expectXSealed }
}

// An unbrewed Coffee ranks by its createdAt, so moving it back in time must
// not hand its slot to a fallen Coffee. Needs its own fixture: the Coffee has
// to sit above X before the Plan lapses.
it('a forged Coffee createdAt keeps Sealed Brews Sealed', async () => {
  const as = callerFor(USERS.coffee)
  const uniq = uniqFor(USERS.coffee)
  const createCoffee = createCoffeeFor(as, uniq)
  await grantPlan(USERS.coffee, 'pro', { reason: 'sealing one-way fixture' })
  const grinder = await as.grinder.create({ name: uniq('G'), brand: 'x' })
  const device = await as.brewingDevice.create({
    name: uniq('D'),
    brand: 'x',
    typeId: await types.findOrCreate(ESPRESSO_DEVICE_TYPE),
  })
  const shot = (coffeeId: string) =>
    as.espressoShot.create({
      coffeeId,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '18',
      notes: 'withheld notes',
      idempotencyKey: crypto.randomUUID(),
    })
  const x = await shot((await createCoffee(uniq('X'))).id)
  for (let i = 0; i < 4; i++) await shot((await createCoffee(uniq(`C${i}`))).id)
  // Unbrewed and newest: the fifth Shelf slot, one above X.
  const unbrewed = await createCoffee(uniq('U'))
  await expireGrants(USERS.coffee)
  const sealed = { sealed: true, notes: null }
  const read = async () => {
    const brew = await as.espressoShot.getById(x.id)
    return { sealed: brew.sealed, notes: brew.notes }
  }
  expect(await read()).toEqual(sealed)

  await as.coffee.update({
    id: unbrewed.id,
    name: unbrewed.name,
    roasterId: unbrewed.roasterId!,
    roastLevelId: unbrewed.roastLevelId!,
    createdAt: new Date('2000-01-01T00:00:00Z'),
  } as never)

  expect(await read()).toEqual(sealed)
})

describe('deleting gear keeps Sealed Brews Sealed', () => {
  it('a grinder', async () => {
    const { as, fillerGrinder, expectXSealed } = await scenario(
      USERS.grinder,
      'espressoShot',
    )
    await as.grinder.delete(fillerGrinder.id)
    await expectXSealed()
  })

  it('a brewing device', async () => {
    const { as, fillerDevice, expectXSealed } = await scenario(
      USERS.brewingDevice,
      'espressoShot',
    )
    await as.brewingDevice.delete(fillerDevice)
    await expectXSealed()
  })
})

describe.each(methods)(
  '%s update keeps Sealed Brews Sealed',
  (method) => {
    it('when a Brew moves onto the fallen Coffee', async () => {
      const { as, x, fillerBrews, expectXSealed } = await scenario(
        USERS[method],
        method,
      )
      const moved = fillerBrews[fillerBrews.length - 1]
      const updated = await as[method].update({
        ...moved,
        coffeeId: x.id,
      } as never)
      // The moved Brew itself was readable and stays readable.
      expect(updated).toMatchObject({ id: moved.id, coffeeId: x.id })
      const readable = await as[method].getById(moved.id)
      expect({ sealed: readable.sealed, notes: readable.notes }).toEqual({
        sealed: false,
        notes: 'withheld notes',
      })
      await expectXSealed()
    })
  },
)

// Holds a Coffee row so a write whose foreign key checks it waits after its
// stamp: the test then decides the order the writes land in.
function holdCoffeeRow(coffeeId: string) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let ready!: () => void
  const locked = new Promise<void>((resolve) => (ready = resolve))
  const done = db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from coffees where id = ${coffeeId} for update`)
    ready()
    await released
  })
  return {
    locked,
    release: async () => {
      release()
      await done
    },
  }
}

async function waitForLockWaiters(count: number) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const { rows } = await db.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `)
    if (rows[0].waiting >= count) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`fewer than ${count} requests waiting on a lock`)
}

describe('concurrent Shelf-changing writes', () => {
  // Found by an exhaustive model of the Shelf. Two moves that each stamp
  // before either writes stamp nothing and touch different rows, so their
  // snapshots never conflict, yet together they reopen a Brew that every
  // serial order Seals. Only serializing the writes closes it.
  it('Seal what one at a time would Seal', async () => {
    const userId = USERS.race
    const as = callerFor(userId)
    const uniq = uniqFor(userId)
    const createCoffee = createCoffeeFor(as, uniq)
    await grantPlan(userId, 'pro', { reason: 'shelf race fixture' })
    const grinder = await as.grinder.create({ name: uniq('G'), brand: 'x' })
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await as.brewingDevice.create({
      name: uniq('D'),
      brand: 'x',
      typeId,
    })
    const shot = (coffeeId: string) =>
      as.espressoShot.create({
        coffeeId,
        grinderId: grinder.id,
        brewingDeviceId: device.id,
        grindSetting: '18',
        dose: '18',
        yield: '36',
        time: 30,
        notes: 'withheld notes',
        idempotencyKey: crypto.randomUUID(),
      })

    const c0 = await createCoffee(uniq('c0'))
    const c2 = await createCoffee(uniq('c2'))
    const c1 = await createCoffee(uniq('c1'))
    const b0 = await shot(c1.id)
    const b1 = await shot(c0.id)
    const b2 = await shot(c1.id)
    await shot(c2.id)
    // Three Coffees brewed last hold the top of the Shelf, leaving two slots
    // for c0, c1 and c2: c2 and c1 hold them, and c0 has fallen off.
    for (let i = 0; i < 3; i++) await shot((await createCoffee(uniq(`top${i}`))).id)
    await expireGrants(userId)
    // Stamped, as the write that pushed c0 off would have left it.
    await db
      .update(espressoShots)
      .set({ sealedAt: new Date() })
      .where(eq(espressoShots.id, b1.id))

    const read = (id: string) => as.espressoShot.getById(id)
    expect((await read(b1.id)).sealed).toBe(true)
    expect((await read(b0.id)).sealed).toBe(false)

    // Move b2 to c2 and b0 to c0 at once. Each holds at its Coffee's row
    // until released, b2's move first.
    const toC2 = holdCoffeeRow(c2.id)
    const toC0 = holdCoffeeRow(c0.id)
    await Promise.all([toC2.locked, toC0.locked])
    let moveB2: Promise<unknown> | undefined
    let moveB0: Promise<unknown> | undefined
    try {
      moveB2 = as.espressoShot.update({ ...b2, coffeeId: c2.id } as never)
      await waitForLockWaiters(1)
      moveB0 = as.espressoShot.update({ ...b0, coffeeId: c0.id } as never)
      // It can be refused while the test still awaits moveB2 or the release.
      moveB0.catch(() => {})
      await waitForLockWaiters(2)
      await toC2.release()
      await moveB2
      await toC0.release()
      // b2's move pushed c1 off and stamped b0, so editing b0 is refused.
      await expect(moveB0).rejects.toMatchObject({ code: 'FORBIDDEN' })
    } finally {
      // A failed run must not leave a row held for the user cleanup to wait on.
      await Promise.all([toC2.release(), toC0.release()])
      await Promise.allSettled([moveB2, moveB0])
    }

    // Serially, moving b2 empties c1 off the Shelf, so b0 is stamped (and
    // its move refused); moving b0 first drops c0 off again, stamping it then.
    const after = await read(b0.id)
    expect({ sealed: after.sealed, notes: after.notes }).toEqual({
      sealed: true,
      notes: null,
    })
  })

  it('refuse an edit to a Brew Sealed while it waited, and keep the stamp', async () => {
    const userId = USERS.sealedWhileWaiting
    const as = callerFor(userId)
    const uniq = uniqFor(userId)
    const createCoffee = createCoffeeFor(as, uniq)
    await grantPlan(userId, 'pro', { reason: 'sealed while waiting fixture' })
    const grinder = await as.grinder.create({ name: uniq('G'), brand: 'x' })
    const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
    const device = await as.brewingDevice.create({
      name: uniq('D'),
      brand: 'x',
      typeId,
    })
    const shot = async (coffeeId: string) =>
      as.espressoShot.create({
        coffeeId,
        grinderId: grinder.id,
        brewingDeviceId: device.id,
        grindSetting: '18',
        dose: '18',
        yield: '36',
        time: 30,
        notes: 'withheld notes',
        idempotencyKey: crypto.randomUUID(),
      })
    // Five brewed Coffees fill the Free Shelf; the edited Brew's is the oldest.
    const edited = await shot((await createCoffee(uniq('edited'))).id)
    for (let i = 0; i < 4; i++) await shot((await createCoffee(uniq(`c${i}`))).id)
    await expireGrants(userId)
    expect((await as.espressoShot.getById(edited.id)).sealed).toBe(false)

    // Another request holds the user's Shelf lock while the edit queues behind
    // it, and adds a Coffee that pushes the edited Brew's Coffee off.
    const holder = await db.$client.connect()
    let editing: Promise<unknown> | undefined
    try {
      await holder.query('select pg_advisory_lock(hashtextextended($1, 0))', [
        userId,
      ])
      editing = as.espressoShot.update({
        ...edited,
        notes: 'overwritten',
      } as never)
      editing.catch(() => {})
      await waitForLockWaiters(1)
      await createCoffee(uniq('newest'))
      await holder.query('select pg_advisory_unlock(hashtextextended($1, 0))', [
        userId,
      ])
      await expect(editing).rejects.toMatchObject({ code: 'FORBIDDEN' })
    } finally {
      await holder
        .query('select pg_advisory_unlock_all()')
        .catch(() => {})
      holder.release()
      await editing?.catch(() => {})
    }

    const [row] = await db
      .select({ notes: espressoShots.notes, sealedAt: espressoShots.sealedAt })
      .from(espressoShots)
      .where(eq(espressoShots.id, edited.id))
    expect(row.notes).toBe('withheld notes')
    expect(row.sealedAt).not.toBeNull()
  })
})
