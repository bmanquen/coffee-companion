import { brewingDeviceRouter } from './brewingDevice'
import { brewingDeviceTypeRouter } from './brewingDeviceType'
import { coffeeRouter } from './coffee'
import { coffeeProcessRouter } from './coffeeProcess'
import { countryRouter } from './country'
import { espressoShotRouter } from './espressoShot'
import { grinderRouter } from './grinder'
import { createTRPCRouter } from './init'
import { regionRouter } from './region'
import { roasterRouter } from './roaster'
import { roastLevelRouter } from './roastLevel'

export const trpcRouter = createTRPCRouter({
  country: countryRouter,
  roaster: roasterRouter,
  roastLevel: roastLevelRouter,
  region: regionRouter,
  coffeeProcess: coffeeProcessRouter,
  coffee: coffeeRouter,
  grinder: grinderRouter,
  brewingDeviceType: brewingDeviceTypeRouter,
  brewingDevice: brewingDeviceRouter,
  espressoShot: espressoShotRouter,
})
export type TRPCRouter = typeof trpcRouter
