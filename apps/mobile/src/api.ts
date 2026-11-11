import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { getSessionCookie } from './auth/auth-client'
import { apiBaseUrl } from './auth/config'
import { espressoDevicesFrom } from './espresso/devices'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotRow,
} from './espresso/types'

type RouterOutputs = inferRouterOutputs<TRPCRouter>
type ShotCreateInput = inferRouterInputs<TRPCRouter>['espressoShot']['create']
type ShotRecord = RouterOutputs['espressoShot']['getAll'][number]

function sessionHeaders(): Record<string, string> {
  const cookie = getSessionCookie()
  return cookie ? { cookie } : {}
}

function toShotRow(shot: ShotRecord): ShotRow {
  return {
    id: shot.id,
    coffeeId: shot.coffeeId,
    coffeeName: shot.coffee.name,
    grinderId: shot.grinderId,
    brewingDeviceId: shot.brewingDeviceId,
    roastDate: shot.roastDate,
    grindSetting: shot.grindSetting,
    dose: shot.dose,
    yield: shot.yield,
    time: shot.time,
    sealed: shot.sealed,
  }
}

export function createLiveEspressoApi(): EspressoApi {
  const client = createTRPCClient<TRPCRouter>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: sessionHeaders,
      }),
    ],
  })

  return {
    async load(): Promise<EspressoCatalog> {
      const [coffees, grinders, devices, shots] = await Promise.all([
        client.coffee.getAll.query(),
        client.grinder.list.query(),
        client.brewingDevice.list.query(),
        client.espressoShot.getAll.query(),
      ])
      return {
        coffees: coffees.map((coffee) => ({
          id: coffee.id,
          name: coffee.name,
          label: coffeeOptionLabel(coffee),
        })),
        grinders: grinders.map(({ id, name }) => ({ id, name })),
        devices: espressoDevicesFrom(devices),
        shots: shots.map(toShotRow),
      }
    },
    async create(input: ShotCreate): Promise<void> {
      const payload: ShotCreateInput = input
      await client.espressoShot.create.mutate(payload)
    },
  }
}
