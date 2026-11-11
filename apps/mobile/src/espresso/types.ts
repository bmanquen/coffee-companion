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

export type MaybePromise<T> = T | Promise<T>

export type EspressoApi = {
  load: () => MaybePromise<EspressoCatalog>
  create: (input: ShotCreate) => MaybePromise<void>
}

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

export function runMaybePromise<T>(
  produce: () => T | Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
): void {
  try {
    const value = produce()
    if (isThenable(value)) {
      void value.then(onValue, onError)
      return
    }
    onValue(value)
  } catch (error) {
    onError(error)
  }
}

export const idleEspressoApi: EspressoApi = {
  load: () => ({
    coffees: [],
    grinders: [],
    devices: [],
    shots: [],
  }),
  create: () => {
    throw new Error('Espresso API is not configured')
  },
}
