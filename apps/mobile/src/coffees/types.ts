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
  // Whole seconds; Cold Brew's whole minutes are converted on the way in.
  seconds: number | null
}

export type CoffeesApi = {
  list: () => Promise<Array<CoffeeRow>>
  // Newest first, across every Brewing Method.
  listBrews: (coffeeId: string) => Promise<Array<BrewRow>>
}

export const idleCoffeesApi: CoffeesApi = {
  list: () => Promise.resolve([]),
  listBrews: () => Promise.resolve([]),
}
