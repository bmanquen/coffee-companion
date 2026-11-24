import { TRPCError } from '@trpc/server'
import { db } from '../db'

// A user only ever sees their own data or the app's shared lookups. Brews
// reference the user's Coffee, grinder and brewing device, which are never
// shared, so every Brew read and write is held to the owner.

// Brew writes: the Coffee and grinder must be the user's own. Each router
// checks the brewing device itself, because it also checks the device type.
export async function assertOwnCoffeeAndGrinder(
  input: { coffeeId: string; grinderId: string },
  userId: string,
) {
  const [coffee, grinder] = await Promise.all([
    db.query.coffees.findFirst({
      where: { id: input.coffeeId, userId },
      columns: { id: true },
    }),
    db.query.grinders.findFirst({
      where: { id: input.grinderId, userId },
      columns: { id: true },
    }),
  ])
  if (!coffee) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
  }
  if (!grinder) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Grinder not found' })
  }
}

// Brew reads: a Brew on another user's Coffee could only come from a write
// made before the check above, so it is left out rather than shown as theirs.
export function onOwnCoffee(userId: string) {
  return { coffee: { userId } } as const
}

// A Brewing Device Type the user may see: a shared one or their own.
export function visibleDeviceType(userId: string) {
  return { OR: [{ userId: { isNull: true as const } }, { userId }] }
}

// Device writes: the type must be one the user may see, so a device cannot
// carry another user's private type into the user's reads.
export async function assertVisibleDeviceType(typeId: string, userId: string) {
  const type = await db.query.brewingDeviceTypes.findFirst({
    where: { id: typeId, ...visibleDeviceType(userId) },
    columns: { id: true },
  })
  if (!type) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brewing device type not found',
    })
  }
}

// Another user's grinder or device on a legacy Brew comes back as null, and
// so does a device written with another user's private type before the check.
export function ownGear(userId: string) {
  return {
    grinder: { where: { userId } },
    brewingDevice: {
      where: { userId, type: visibleDeviceType(userId) },
      with: { type: true },
    },
  } as const
}
