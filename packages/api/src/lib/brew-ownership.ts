// A user only ever sees their own data or the app's shared lookups. Brews
// reference the user's Coffee, grinder and brewing device, which are never
// shared. The database holds writes to that (lookup_reference_guard and the
// owner foreign keys); reads are held to the owner here.

// Brew reads: a Brew on another user's Coffee could only come from a write
// made before the database refused it, so it is left out rather than shown.
export function onOwnCoffee(userId: string) {
  return { coffee: { userId } } as const
}

// A Brewing Device Type the user may see: a shared one or their own.
export function visibleDeviceType(userId: string) {
  return { OR: [{ userId: { isNull: true as const } }, { userId }] }
}

// Another user's grinder or device on a legacy Brew comes back as null, and
// so does a device written with another user's private type before the
// database refused it.
export function ownGear(userId: string) {
  return {
    grinder: { where: { userId } },
    brewingDevice: {
      where: { userId, type: visibleDeviceType(userId) },
      with: { type: true },
    },
  } as const
}
