import { countryRouter } from './country'
import { createTRPCRouter } from './init'
import { roasterRouter } from './roaster'
import { roastLevelRouter } from './roastLevel'

export const trpcRouter = createTRPCRouter({
  country: countryRouter,
  roaster: roasterRouter,
  roastLevel: roastLevelRouter,
})
export type TRPCRouter = typeof trpcRouter
