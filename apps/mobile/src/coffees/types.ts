import type { SearchableCoffee } from '@coffee-companion/brew-display'

export type CoffeeRow = SearchableCoffee & {
  id: string
  isDialedIn: boolean
}

export type BrewMethod =
  'Espresso' | 'Pour Over' | 'AeroPress' | 'French Press' | 'Cold Brew'

// One Brew of any method, as the Coffee's detail lists it. A Sealed Brew
// arrives from the server with these settings already blanked.
export type BrewRow = {
  id: string
  method: BrewMethod
  createdAt: Date
  sealed: boolean
  isDialedIn: boolean
  grindSetting: string | null
  dose: string | null
  // Espresso's yield, or the other methods' water.
  output: string | null
  // Whole seconds, except Cold Brew's whole minutes, as each table stores it.
  time: number | null
}

export type CoffeesApi = {
  list: () => Promise<Array<CoffeeRow>>
  // Newest first, across every Brewing Method. signal aborts every request
  // when its query is cancelled.
  listBrews: (coffeeId: string, signal?: AbortSignal) => Promise<Array<BrewRow>>
}

export const idleCoffeesApi: CoffeesApi = {
  list: () => Promise.resolve([]),
  listBrews: () => Promise.resolve([]),
}
