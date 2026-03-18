import { countryRouter } from './country'
import { createTRPCRouter } from './init'
import { roasterRouter } from './roaster'

export const trpcRouter = createTRPCRouter({
  country: countryRouter,
  roaster: roasterRouter,
})
export type TRPCRouter = typeof trpcRouter
