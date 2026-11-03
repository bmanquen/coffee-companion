import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { getSessionCookie } from './auth/auth-client'
import { apiBaseUrl } from './auth/config'
import { espressoDevicesFrom } from './espresso/devices'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotRow,
} from './espresso/types'

type CoffeeRecord = { id: string; name: string }
type GrinderRecord = { id: string; name: string }
type DeviceRecord = { id: string; name: string; type: { name: string } }
type ShotRecord = {
  id: string
  coffeeId: string
  coffee: { name: string }
  grinderId: string | null
  brewingDeviceId: string | null
  roastDate: string | null
  grindSetting: string | null
  dose: string | null
  yield: string | null
  time: number | null
  sealed: boolean
}

type TrpcLike = {
  coffee: { getAll: { query: () => Promise<Array<CoffeeRecord>> } }
  grinder: { list: { query: () => Promise<Array<GrinderRecord>> } }
  brewingDevice: { list: { query: () => Promise<Array<DeviceRecord>> } }
  espressoShot: {
    getAll: { query: () => Promise<Array<ShotRecord>> }
    create: { mutate: (input: ShotCreate) => Promise<{ id: string }> }
  }
}

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
  const client = createTRPCClient({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: sessionHeaders,
      }),
    ],
  }) as unknown as TrpcLike

  return {
    async load(): Promise<EspressoCatalog> {
      const [coffees, grinders, devices, shots] = await Promise.all([
        client.coffee.getAll.query(),
        client.grinder.list.query(),
        client.brewingDevice.list.query(),
        client.espressoShot.getAll.query(),
      ])
      return {
        coffees: coffees.map(({ id, name }) => ({ id, name })),
        grinders: grinders.map(({ id, name }) => ({ id, name })),
        devices: espressoDevicesFrom(devices),
        shots: shots.map(toShotRow),
      }
    },
    async create(input: ShotCreate): Promise<void> {
      await client.espressoShot.create.mutate(input)
    },
  }
}
