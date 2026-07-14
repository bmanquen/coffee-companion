// The brewing device type that pour over brews must use. Seeded as a system
// default (see the brewing_device_types data).
export const POUR_OVER_DEVICE_TYPE = 'Pour Over'

// Whether a brewing device is a Pour Over-type device, i.e. valid for logging
// pour over brews. Pure helper so it can be unit tested without a database.
export const isPourOverDevice = (device: {
  type: { name: string }
}): boolean => device.type.name === POUR_OVER_DEVICE_TYPE
