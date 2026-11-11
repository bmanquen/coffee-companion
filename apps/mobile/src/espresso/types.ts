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
}

export type EspressoCatalog = {
  coffees: Array<NamedOption>
  grinders: Array<NamedOption>
  devices: Array<NamedOption>
  shots: Array<ShotRow>
}

export type EspressoApi = {
  load: () => Promise<EspressoCatalog>
  create: (input: ShotCreate) => Promise<void>
}

export const idleEspressoApi: EspressoApi = {
  load: () =>
    Promise.resolve({ coffees: [], grinders: [], devices: [], shots: [] }),
  create: () => Promise.reject(new Error('Espresso API is not configured')),
}
