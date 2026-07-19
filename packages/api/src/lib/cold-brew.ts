// The brewing device type that cold brews must use. Seeded as a system default
// (see the brewing_device_types data).
export const COLD_BREW_DEVICE_TYPE = 'Cold Brew'

// Whether a brewing device is a Cold Brew-type device, i.e. valid for logging
// cold brews. Pure helper so it can be unit tested without a database.
export const isColdBrewDevice = (device: {
  type: { name: string }
}): boolean => device.type.name === COLD_BREW_DEVICE_TYPE
