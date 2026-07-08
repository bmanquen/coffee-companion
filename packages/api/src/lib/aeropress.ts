// The brewing device type that aeropress brews must use. Seeded as a system
// default (see seed.ts / the brewing_device_types data).
export const AEROPRESS_DEVICE_TYPE = 'AeroPress'

// Whether a brewing device is an AeroPress-type device, i.e. valid for logging
// aeropress brews. Pure helper so it can be unit tested without a database.
export const isAeropressDevice = (device: {
  type: { name: string }
}): boolean => device.type.name === AEROPRESS_DEVICE_TYPE

// System-default brew methods, seeded with a null userId and shared across all
// users (users can add their own on top of these).
export const AEROPRESS_METHOD_DEFAULTS = ['Standard', 'Inverted'] as const
