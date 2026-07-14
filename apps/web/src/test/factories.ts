import type { inferRouterOutputs } from '@trpc/server'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'

// Fixtures typed against the real tRPC output, so they always match what the
// widgets actually receive. Defaults are sensible; pass overrides per test.
type RouterOutputs = inferRouterOutputs<TRPCRouter>
type RecentShot = RouterOutputs['espressoShot']['getRecent']['items'][number]
type RecentCoffee = RouterOutputs['coffee']['getRecent']['items'][number]
type AeropressBrew = RouterOutputs['aeropressBrew']['getDialedIn'][number]
type PouroverBrew = RouterOutputs['pouroverBrew']['getDialedIn'][number]
type CoffeeOption = RouterOutputs['coffee']['getAll'][number]
type MethodOption = RouterOutputs['aeropressMethod']['list'][number]
type PouroverMethodOption = RouterOutputs['pouroverMethod']['list'][number]
type GrinderOption = RouterOutputs['grinder']['list'][number]
type DeviceOption = RouterOutputs['brewingDevice']['list'][number]

const createdAt = new Date('2026-06-01T08:00:00.000Z')
const updatedAt = new Date('2026-06-15T10:30:00.000Z')

export function makeRecentShot(
  overrides: Partial<RecentShot> = {},
): RecentShot {
  return {
    id: 's1',
    userId: 'u1',
    coffeeId: 'c1',
    grinderId: 'g1',
    brewingDeviceId: 'd1',
    roastDate: null,
    isDialedIn: false,
    dose: '18',
    yield: '36',
    time: 28,
    grindSetting: '4.5',
    notes: 'tasty',
    createdAt,
    updatedAt,
    coffee: makeRecentCoffee({ id: 'c1' }),
    grinder: {
      id: 'g1',
      userId: 'u1',
      name: 'Niche Zero',
      brand: 'Niche',
      createdAt,
      updatedAt,
    },
    brewingDevice: {
      id: 'd1',
      userId: 'u1',
      name: 'Linea Mini',
      brand: 'La Marzocco',
      typeId: 't1',
      createdAt,
      updatedAt,
      type: {
        id: 't1',
        userId: null,
        name: 'Espresso',
        createdAt,
        updatedAt,
      },
    },
    ...overrides,
  }
}

export function makeRecentCoffee(
  overrides: Partial<RecentCoffee> = {},
): RecentCoffee {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Ethiopia Guji',
    roasterId: null,
    roastLevelId: null,
    countryId: null,
    regionId: null,
    processId: null,
    notes: null,
    isActive: false,
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function makeAeropressBrew(
  overrides: Partial<AeropressBrew> = {},
): AeropressBrew {
  return {
    id: 'a1',
    userId: 'u1',
    coffeeId: 'c1',
    grinderId: 'g1',
    brewingDeviceId: 'd1',
    methodId: 'm1',
    roastDate: null,
    isDialedIn: true,
    dose: '15',
    water: '220',
    steepTime: 90,
    grindSetting: '18',
    notes: 'bright and clean',
    createdAt,
    updatedAt,
    coffee: makeRecentCoffee({ id: 'c1' }),
    grinder: {
      id: 'g1',
      userId: 'u1',
      name: 'Ode',
      brand: 'Fellow',
      createdAt,
      updatedAt,
    },
    brewingDevice: {
      id: 'd1',
      userId: 'u1',
      name: 'AeroPress Go',
      brand: 'AeroPress',
      typeId: 't1',
      createdAt,
      updatedAt,
      type: {
        id: 't1',
        userId: null,
        name: 'AeroPress',
        createdAt,
        updatedAt,
      },
    },
    method: {
      id: 'm1',
      userId: null,
      name: 'Standard',
      createdAt,
      updatedAt,
    },
    ...overrides,
  }
}

export function makePouroverBrew(
  overrides: Partial<PouroverBrew> = {},
): PouroverBrew {
  return {
    id: 'p1',
    userId: 'u1',
    coffeeId: 'c1',
    grinderId: 'g1',
    brewingDeviceId: 'd1',
    methodId: 'm1',
    roastDate: null,
    isDialedIn: true,
    dose: '18',
    water: '300',
    brewTime: 165,
    waterTemp: 94,
    grindSetting: '22',
    notes: 'sweet and floral',
    createdAt,
    updatedAt,
    coffee: makeRecentCoffee({ id: 'c1' }),
    grinder: {
      id: 'g1',
      userId: 'u1',
      name: 'Ode',
      brand: 'Fellow',
      createdAt,
      updatedAt,
    },
    brewingDevice: {
      id: 'd1',
      userId: 'u1',
      name: 'V60',
      brand: 'Hario',
      typeId: 't3',
      createdAt,
      updatedAt,
      type: {
        id: 't3',
        userId: null,
        name: 'Pour Over',
        createdAt,
        updatedAt,
      },
    },
    method: {
      id: 'm1',
      userId: null,
      name: 'Standard',
      createdAt,
      updatedAt,
    },
    ...overrides,
  }
}

// The following back the SearchSelect option lists that the brew forms load.
export function makeCoffee(overrides: Partial<CoffeeOption> = {}): CoffeeOption {
  return {
    ...makeRecentCoffee(),
    country: null,
    region: null,
    process: null,
    dialedInShot: null,
    ...overrides,
  }
}

export function makeAeropressMethod(
  overrides: Partial<MethodOption> = {},
): MethodOption {
  return {
    id: 'm1',
    userId: null,
    name: 'Standard',
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function makePouroverMethod(
  overrides: Partial<PouroverMethodOption> = {},
): PouroverMethodOption {
  return {
    id: 'm1',
    userId: null,
    name: 'Standard',
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function makeGrinder(
  overrides: Partial<GrinderOption> = {},
): GrinderOption {
  return {
    id: 'g1',
    userId: 'u1',
    name: 'Ode',
    brand: 'Fellow',
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function makeBrewingDevice(
  overrides: Partial<DeviceOption> = {},
): DeviceOption {
  return {
    id: 'd1',
    userId: 'u1',
    name: 'AeroPress Go',
    brand: 'AeroPress',
    typeId: 't1',
    createdAt,
    updatedAt,
    type: { id: 't1', userId: null, name: 'AeroPress', createdAt, updatedAt },
    ...overrides,
  }
}
