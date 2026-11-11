export type NamedOption = {
  id: string
  name: string
  label?: string
}

export type ShotRow = {
  id: string
  coffeeId: string
  coffeeName: string
  grinderId: string | null
  brewingDeviceId: string | null
  roastDate: string | null
  grindSetting: string | null
  dose: string | null
  yield: string | null
  time: number | null
  sealed: boolean
}

export type ShotCreate = {
  coffeeId: string
  grinderId: string
  brewingDeviceId: string
  roastDate: string | null
  dose: string
  yield: string
  time: number
  grindSetting: string
  notes: string | null
  idempotencyKey: string
}

export type ShotPage = {
  items: Array<ShotRow>
  total: number
}

export type EspressoCatalog = {
  coffees: Array<NamedOption>
  grinders: Array<NamedOption>
  devices: Array<NamedOption>
  shots: Array<ShotRow>
  total: number
}

export type EspressoApi = {
  load: () => Promise<EspressoCatalog>
  listShots: (offset: number) => Promise<ShotPage>
  loadPrefill: (coffeeId: string) => Promise<ShotRow | null>
  create: (input: ShotCreate) => Promise<void>
}

export { ESPRESSO_SHOT_PAGE_SIZE as SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'

const emptyCatalog: EspressoCatalog = {
  coffees: [],
  grinders: [],
  devices: [],
  shots: [],
  total: 0,
}

export const idleEspressoApi: EspressoApi = {
  load: () => Promise.resolve(emptyCatalog),
  listShots: () => Promise.resolve({ items: [], total: 0 }),
  loadPrefill: () => Promise.resolve(null),
  create: () => Promise.reject(new Error('Espresso API is not configured')),
}
