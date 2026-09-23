import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { dialedInBrews } from '../db/schema'
import { isSealed } from './shelf'
import type { Shelf } from './shelf'

// The Brewing Method a Dialed-in mapping is keyed by — the five methods, not
// a Method Variant (Standard / Inverted / …).
export const brewingMethods = [
  'espresso',
  'aeropress',
  'pourover',
  'frenchpress',
  'coldBrew',
] as const

export type BrewingMethod = (typeof brewingMethods)[number]

export type DialedInPair = {
  brewingMethod: BrewingMethod
  brewingDeviceId: string
}

export type DialedInMapping = DialedInPair & { brewId: string }

export type DialedInBrewView = {
  brewingMethod: BrewingMethod
  brewingDeviceId: string
  brewId: string
  coffeeName: string
  deviceName: string
  grindSetting: string | null
  dose: string | null
  outputGrams: string | null
  outputLabel: 'Yield' | 'Water'
  time: number | null
  timeUnit: 's' | 'min'
  sealed: boolean
}

const brewRelations = {
  coffee: true,
  brewingDevice: true,
} as const

type LoadedBrew = {
  id: string
  userId: string
  coffeeId: string
  brewingDeviceId: string
  sealedAt: Date | null
  grindSetting: string | null
  dose: string | null
  coffee: { name: string }
  brewingDevice: { name: string } | null
  outputGrams: string | null
  outputLabel: 'Yield' | 'Water'
  time: number | null
  timeUnit: 's' | 'min'
}

async function loadBrew(
  brewingMethod: BrewingMethod,
  brewId: string,
  userId: string,
): Promise<LoadedBrew | null> {
  switch (brewingMethod) {
    case 'espresso': {
      const brew = await db.query.espressoShots.findFirst({
        where: { id: brewId, userId },
        with: brewRelations,
      })
      return brew
        ? {
            ...brew,
            outputGrams: brew.yield,
            outputLabel: 'Yield',
            time: brew.time,
            timeUnit: 's',
          }
        : null
    }
    case 'aeropress': {
      const brew = await db.query.aeropressBrews.findFirst({
        where: { id: brewId, userId },
        with: brewRelations,
      })
      return brew
        ? {
            ...brew,
            outputGrams: brew.water,
            outputLabel: 'Water',
            time: brew.steepTime,
            timeUnit: 's',
          }
        : null
    }
    case 'pourover': {
      const brew = await db.query.pouroverBrews.findFirst({
        where: { id: brewId, userId },
        with: brewRelations,
      })
      return brew
        ? {
            ...brew,
            outputGrams: brew.water,
            outputLabel: 'Water',
            time: brew.brewTime,
            timeUnit: 's',
          }
        : null
    }
    case 'frenchpress': {
      const brew = await db.query.frenchpressBrews.findFirst({
        where: { id: brewId, userId },
        with: brewRelations,
      })
      return brew
        ? {
            ...brew,
            outputGrams: brew.water,
            outputLabel: 'Water',
            time: brew.steepTime,
            timeUnit: 's',
          }
        : null
    }
    case 'coldBrew': {
      const brew = await db.query.coldBrewBrews.findFirst({
        where: { id: brewId, userId },
        with: brewRelations,
      })
      return brew
        ? {
            ...brew,
            outputGrams: brew.water,
            outputLabel: 'Water',
            time: brew.steepTime,
            timeUnit: 'min',
          }
        : null
    }
  }
}

async function deviceNameFor(
  brewingDeviceId: string,
  userId: string,
): Promise<string | null> {
  const device = await db.query.brewingDevices.findFirst({
    where: { id: brewingDeviceId, userId },
  })
  return device?.name ?? null
}

async function clearMapping(userId: string, pair: DialedInPair) {
  await db
    .delete(dialedInBrews)
    .where(
      and(
        eq(dialedInBrews.userId, userId),
        eq(dialedInBrews.brewingMethod, pair.brewingMethod),
        eq(dialedInBrews.brewingDeviceId, pair.brewingDeviceId),
      ),
    )
}

function toView(
  mapping: DialedInMapping,
  brew: LoadedBrew,
  deviceName: string,
  shelf: Shelf,
): DialedInBrewView {
  const sealed = isSealed(brew, shelf)
  return {
    ...mapping,
    coffeeName: brew.coffee.name,
    deviceName,
    grindSetting: sealed ? null : brew.grindSetting,
    dose: sealed ? null : brew.dose,
    outputGrams: sealed ? null : brew.outputGrams,
    outputLabel: brew.outputLabel,
    time: sealed ? null : brew.time,
    timeUnit: brew.timeUnit,
    sealed,
  }
}

export async function listDialedInBrews(
  userId: string,
): Promise<Array<DialedInMapping>> {
  const rows = await db.query.dialedInBrews.findMany({
    where: { userId },
  })
  return rows.map((row) => ({
    brewingMethod: row.brewingMethod,
    brewingDeviceId: row.brewingDeviceId,
    brewId: row.brewId,
  }))
}

export async function getDialedInBrew(
  userId: string,
  pair: DialedInPair,
  shelf: Shelf,
): Promise<DialedInBrewView | null> {
  const row = await db.query.dialedInBrews.findFirst({
    where: {
      userId,
      brewingMethod: pair.brewingMethod,
      brewingDeviceId: pair.brewingDeviceId,
    },
  })
  if (!row) return null

  const brew = await loadBrew(pair.brewingMethod, row.brewId, userId)
  if (!brew || brew.brewingDeviceId !== pair.brewingDeviceId) {
    await clearMapping(userId, pair)
    return null
  }

  const deviceName = await deviceNameFor(pair.brewingDeviceId, userId)
  if (!deviceName) {
    await clearMapping(userId, pair)
    return null
  }

  return toView(
    {
      brewingMethod: pair.brewingMethod,
      brewingDeviceId: pair.brewingDeviceId,
      brewId: row.brewId,
    },
    brew,
    deviceName,
    shelf,
  )
}

export async function setDialedInBrew(
  userId: string,
  pair: DialedInPair,
  brewId: string | null,
  shelf: Shelf,
): Promise<DialedInMapping | null> {
  if (brewId === null) {
    await clearMapping(userId, pair)
    return null
  }

  const deviceName = await deviceNameFor(pair.brewingDeviceId, userId)
  if (!deviceName) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brewing device not found',
    })
  }

  const brew = await loadBrew(pair.brewingMethod, brewId, userId)
  if (!brew) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brew not found for this method',
    })
  }
  if (brew.brewingDeviceId !== pair.brewingDeviceId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Brew was not logged on this brewing device',
    })
  }
  if (isSealed(brew, shelf)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This Brew is Sealed. Subscribe to dial it in again.',
    })
  }

  await db.transaction(async (tx) => {
    // A brew can be the pointer for only one pair. Drop any other mapping that
    // still names it (device change, or a leftover from a previous pair).
    await tx
      .delete(dialedInBrews)
      .where(
        and(
          eq(dialedInBrews.userId, userId),
          eq(dialedInBrews.brewId, brewId),
        ),
      )
    await tx
      .delete(dialedInBrews)
      .where(
        and(
          eq(dialedInBrews.userId, userId),
          eq(dialedInBrews.brewingMethod, pair.brewingMethod),
          eq(dialedInBrews.brewingDeviceId, pair.brewingDeviceId),
        ),
      )
    await tx.insert(dialedInBrews).values({
      userId,
      brewingMethod: pair.brewingMethod,
      brewingDeviceId: pair.brewingDeviceId,
      brewId,
    })
  })

  return { ...pair, brewId }
}
