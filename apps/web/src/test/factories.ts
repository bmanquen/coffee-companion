import type { inferRouterOutputs } from '@trpc/server'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'

// Fixtures typed against the real tRPC output, so they always match what the
// widgets actually receive. Defaults are sensible; pass overrides per test.
type RouterOutputs = inferRouterOutputs<TRPCRouter>
type RecentShot = RouterOutputs['espressoShot']['getRecent']['items'][number]
type RecentCoffee = RouterOutputs['coffee']['getRecent']['items'][number]

const epoch = new Date(0)

export function makeRecentShot(overrides: Partial<RecentShot> = {}): RecentShot {
  return {
    id: 's1',
    userId: 'u1',
    coffeeId: 'c1',
    grinderId: 'g1',
    brewingDeviceId: 'd1',
    dose: '18',
    yield: '36',
    time: 28,
    grindSetting: '4.5',
    notes: 'tasty',
    createdAt: epoch,
    updatedAt: null,
    coffee: makeRecentCoffee({ id: 'c1' }),
    grinder: {
      id: 'g1',
      userId: 'u1',
      name: 'Niche Zero',
      brand: 'Niche',
      createdAt: epoch,
      updatedAt: null,
    },
    brewingDevice: {
      id: 'd1',
      userId: 'u1',
      name: 'Linea Mini',
      brand: 'La Marzocco',
      typeId: 't1',
      createdAt: epoch,
      updatedAt: null,
      type: {
        id: 't1',
        userId: null,
        name: 'Espresso',
        createdAt: epoch,
        updatedAt: null,
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
    roastDate: null,
    countryId: null,
    regionId: null,
    processId: null,
    notes: null,
    isActive: false,
    dialedInShotId: null,
    createdAt: epoch,
    updatedAt: null,
    ...overrides,
  }
}
