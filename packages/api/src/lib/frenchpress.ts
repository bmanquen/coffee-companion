// The brewing device type that french press brews must use. Seeded as a system
// default (see the brewing_device_types data).
export const FRENCH_PRESS_DEVICE_TYPE = 'French Press'

// Whether a brewing device is a French Press-type device, i.e. valid for logging
// french press brews. Pure helper so it can be unit tested without a database.
export const isFrenchPressDevice = (device: {
  type: { name: string }
}): boolean => device.type.name === FRENCH_PRESS_DEVICE_TYPE
