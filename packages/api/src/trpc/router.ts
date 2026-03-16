import { createTRPCRouter } from './init'
import { countryRouter } from './country'

export const trpcRouter = createTRPCRouter({
  country: countryRouter,
})
export type TRPCRouter = typeof trpcRouter
