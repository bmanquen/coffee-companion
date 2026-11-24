import { describe, expect, it } from 'vitest'
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
  grinder: 'sealing-one-way-grinder',
  brewingDevice: 'sealing-one-way-device',
  ...Object.fromEntries(methods.map((m) => [m, `sealing-one-way-${m}`])),
} as Record<'grinder' | 'brewingDevice' | Method, string>

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
      await expectXSealed()
    })
  },
)
