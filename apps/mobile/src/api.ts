import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { getSessionCookie } from './auth/auth-client'
import { apiBaseUrl } from './auth/config'
import { espressoDevicesFrom } from './espresso/devices'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { TRPCRouter } from '@coffee-companion/api/trpc/router'
import type { BrewMethod, BrewRow, CoffeesApi } from './coffees/types'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotPage,
  ShotRow,
} from './espresso/types'

type RouterOutputs = inferRouterOutputs<TRPCRouter>
type ShotCreateInput = inferRouterInputs<TRPCRouter>['espressoShot']['create']
type ShotRecord = RouterOutputs['espressoShot']['getRecent']['items'][number]

async function sessionHeaders(): Promise<Record<string, string>> {
  const cookie = await getSessionCookie()
  return cookie ? { cookie } : {}
}

export const REQUEST_TIMEOUT_MS = 30_000

// A lost response would otherwise leave a save busy forever with no retry.
function fetchWithTimeout(url: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const caller = init?.signal
  if (caller?.aborted) controller.abort()
  const onAbort = () => controller.abort()
  caller?.addEventListener('abort', onAbort, { once: true })
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
    caller?.removeEventListener('abort', onAbort)
  })
}

function toShotRow(shot: ShotRecord): ShotRow {
  return {
    id: shot.id,
    coffeeId: shot.coffeeId,
    coffeeName: coffeeOptionLabel(shot.coffee),
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

function createClient() {
  return createTRPCClient<TRPCRouter>({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: sessionHeaders,
        fetch: fetchWithTimeout,
      }),
    ],
  })
}

export function createLiveEspressoApi(): EspressoApi {
  const client = createClient()

  return {
    async load(): Promise<EspressoCatalog> {
      const [coffees, grinders, devices] = await Promise.all([
        client.coffee.getAll.query(),
        client.grinder.list.query(),
        client.brewingDevice.list.query(),
      ])
      return {
        coffees: coffees.map((coffee) => ({
          id: coffee.id,
          name: coffee.name,
          label: coffeeOptionLabel(coffee),
        })),
        grinders: grinders.map(({ id, name }) => ({ id, name })),
        devices: espressoDevicesFrom(devices),
        shots: [],
      }
    },
    async listShots(
      cursor?: ShotPage['nextCursor'],
      signal?: AbortSignal,
    ): Promise<ShotPage> {
      const page = await client.espressoShot.getRecent.query(
        {
          limit: ESPRESSO_SHOT_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
        { signal },
      )
      return {
        items: page.items.map(toShotRow),
        total: page.total,
        nextCursor: page.nextCursor,
      }
    },
    async loadPrefill(coffeeId: string): Promise<ShotRow | null> {
      const shot = await client.espressoShot.getLatestUnsealed.query({
        coffeeId,
      })
      return shot ? toShotRow(shot) : null
    },
    async create(input: ShotCreate): Promise<void> {
      const payload: ShotCreateInput = input
      await client.espressoShot.create.mutate(payload)
    },
  }
}

type Client = ReturnType<typeof createClient>

// Every page of one Coffee's Shots, so its Brews list is complete.
async function allShotsOf(client: Client, coffeeId: string) {
  const shots: Array<ShotRecord> = []
  let cursor: string | undefined
  do {
    const page = await client.espressoShot.getRecent.query({
      limit: 50,
      coffeeId,
      ...(cursor ? { cursor } : {}),
    })
    shots.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return shots
}

export function createLiveCoffeesApi(): CoffeesApi {
  const client = createClient()
  return {
    list: () => client.coffee.getAll.query(),
    async listBrews(coffeeId: string): Promise<Array<BrewRow>> {
      // shortcut: the other methods have no per-Coffee feed, so this reads
      // each method's whole (sealed) history and keeps this Coffee's; add a
      // coffeeId input to their getAll if histories grow large.
      const [shots, pourOver, aeropress, frenchPress, coldBrew] =
        await Promise.all([
          allShotsOf(client, coffeeId),
          client.pouroverBrew.getAll.query(),
          client.aeropressBrew.getAll.query(),
          client.frenchpressBrew.getAll.query(),
          client.coldBrewBrew.getAll.query(),
        ])
      const base = (
        brew: {
          id: string
          createdAt: Date
          sealed: boolean
          isDialedIn: boolean
          grindSetting: string | null
          dose: string | null
        },
        method: BrewMethod,
        output: string | null,
        seconds: number | null,
      ): BrewRow => ({
        id: brew.id,
        method,
        createdAt: brew.createdAt,
        sealed: brew.sealed,
        isDialedIn: brew.isDialedIn,
        grindSetting: brew.grindSetting,
        dose: brew.dose,
        output,
        seconds,
      })
      const own = <T extends { coffeeId: string }>(brews: Array<T>) =>
        brews.filter((brew) => brew.coffeeId === coffeeId)
      return [
        ...shots.map((b) => base(b, 'Espresso', b.yield, b.time)),
        ...own(pourOver).map((b) => base(b, 'Pour Over', b.water, b.brewTime)),
        ...own(aeropress).map((b) =>
          base(b, 'AeroPress', b.water, b.steepTime),
        ),
        ...own(frenchPress).map((b) =>
          base(b, 'French Press', b.water, b.steepTime),
        ),
        ...own(coldBrew).map((b) =>
          base(
            b,
            'Cold Brew',
            b.water,
            b.steepTime == null ? null : b.steepTime * 60,
          ),
        ),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    },
  }
}
