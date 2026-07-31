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
//
// A Sealed shot arrives with its settings blanked, so everything the paywall
// withholds is nullable here. `sealed` says which it is.
export interface EspressoShotWithRelations
  extends Omit<EspressoShot, 'grinderId' | 'brewingDeviceId'> {
  coffee: Coffee
  grinder: Grinder | null
  brewingDevice: (BrewingDevice & { type: BrewingDeviceType }) | null
  grinderId: string | null
  brewingDeviceId: string | null
  sealed: boolean
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
