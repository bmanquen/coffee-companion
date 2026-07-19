import { aeropressBrewRouter } from './aeropressBrew'
import { aeropressMethodRouter } from './aeropressMethod'
import { brewingDeviceRouter } from './brewingDevice'
import { brewingDeviceTypeRouter } from './brewingDeviceType'
import { coffeeRouter } from './coffee'
import { coffeeProcessRouter } from './coffeeProcess'
import { coldBrewBrewRouter } from './coldBrewBrew'
import { countryRouter } from './country'
import { espressoShotRouter } from './espressoShot'
import { frenchpressBrewRouter } from './frenchpressBrew'
import { frenchpressMethodRouter } from './frenchpressMethod'
import { grinderRouter } from './grinder'
import { createTRPCRouter } from './init'
import { pouroverBrewRouter } from './pouroverBrew'
import { pouroverMethodRouter } from './pouroverMethod'
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
  aeropressMethod: aeropressMethodRouter,
  aeropressBrew: aeropressBrewRouter,
  pouroverMethod: pouroverMethodRouter,
  pouroverBrew: pouroverBrewRouter,
  frenchpressMethod: frenchpressMethodRouter,
  frenchpressBrew: frenchpressBrewRouter,
  coldBrewBrew: coldBrewBrewRouter,
})
export type TRPCRouter = typeof trpcRouter
