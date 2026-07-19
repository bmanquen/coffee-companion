import type {
  AeropressBrew,
  AeropressMethod,
  BrewingDevice,
  BrewingDeviceType,
  Coffee,
  ColdBrewBrew,
  EspressoShot,
  FrenchpressBrew,
  FrenchpressMethod,
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

// A french press brew with its coffee, grinder, brewing device, and method
// relations joined in — the shape returned by the french press brew list queries
// (getAll / getRecent / getDialedIn) and rendered by the tables and dashboard.
export interface FrenchpressBrewWithRelations extends FrenchpressBrew {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
  method: FrenchpressMethod
}

// A cold brew with its coffee, grinder, and brewing device relations joined in —
// the shape returned by the cold brew list queries and rendered by the table.
// Methodless (ADR-0001), so there is no method relation.
export interface ColdBrewBrewWithRelations extends ColdBrewBrew {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
}
