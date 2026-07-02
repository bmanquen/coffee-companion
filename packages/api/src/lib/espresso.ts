// The brewing device type that espresso shots must use. Seeded as a system
// default (see seed.ts / the brewing_device_types migration).
export const ESPRESSO_DEVICE_TYPE = 'Espresso'

// Whether a brewing device is an Espresso-type device, i.e. valid for pulling
// espresso shots. Pure helper so it can be unit tested without a database.
export const isEspressoDevice = (device: { type: { name: string } }): boolean =>
  device.type.name === ESPRESSO_DEVICE_TYPE
