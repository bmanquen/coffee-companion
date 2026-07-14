import type {
  AeropressBrew,
  AeropressMethod,
  BrewingDevice,
  BrewingDeviceType,
  Coffee,
  EspressoShot,
  Grinder,
  PouroverBrew,
  PouroverMethod,
} from '@coffee-companion/api/db/zod'

// An espresso shot with its coffee, grinder, and brewing device relations joined
// in — the shape returned by the espresso shot list queries (getRecent /
// getDialedIn) and rendered by the dashboard widgets.
export interface EspressoShotWithRelations extends EspressoShot {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
}

// An aeropress brew with its coffee, grinder, brewing device, and method
// relations joined in — the shape returned by the aeropress brew list queries
// (getAll / getRecent / getDialedIn) and rendered by the tables and dashboard.
export interface AeropressBrewWithRelations extends AeropressBrew {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
  method: AeropressMethod
}

// A pour over brew with its coffee, grinder, brewing device, and method
// relations joined in — the shape returned by the pour over brew list queries
// (getAll / getRecent / getDialedIn) and rendered by the tables and dashboard.
export interface PouroverBrewWithRelations extends PouroverBrew {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
  method: PouroverMethod
}
