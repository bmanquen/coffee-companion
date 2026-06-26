import type {
  BrewingDevice,
  BrewingDeviceType,
  Coffee,
  EspressoShot,
  Grinder,
} from '@coffee-companion/api/db/zod'

// An espresso shot with its coffee, grinder, and brewing device relations joined
// in — the shape returned by the espresso shot list queries (getRecent /
// getDialedIn) and rendered by the dashboard widgets.
export interface EspressoShotWithRelations extends EspressoShot {
  coffee: Coffee
  grinder: Grinder
  brewingDevice: BrewingDevice & { type: BrewingDeviceType }
}
