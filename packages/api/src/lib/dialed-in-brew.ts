import { and, eq, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { dialedInBrews } from '../db/schema'
import { isSealed, sealBrew, sealBrewPage, sealBrews } from './shelf'
import type { SealableBrew, Shelf } from './shelf'

// The Brewing Method a Dialed-in membership is keyed by — the five methods, not
// a Method Variant (Standard / Inverted / …).
export const brewingMethods = [
  'espresso',
  'aeropress',
  'pourover',
  'frenchpress',
  'coldBrew',
] as const

export type BrewingMethod = (typeof brewingMethods)[number]

export type DialedInKey = {
  coffeeId: string
  brewingMethod: BrewingMethod
  brewingDeviceId: string
}

export type DialedInMapping = DialedInKey & { brewId: string }

export type DialedInBrewView = DialedInMapping & {
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

function asLoaded(
  brew: {
    id: string
    userId: string
    coffeeId: string
    brewingDeviceId: string
    sealedAt: Date | null
    grindSetting: string | null
    dose: string | null
    coffee: { name: string }
    brewingDevice: { name: string } | null
  },
  outputGrams: string | null,
  outputLabel: LoadedBrew['outputLabel'],
  time: number | null,
  timeUnit: LoadedBrew['timeUnit'],
): LoadedBrew {
  return { ...brew, outputGrams, outputLabel, time, timeUnit }
}

async function loadBrews(
  brewingMethod: BrewingMethod,
  brewIds: Array<string>,
  userId: string,
): Promise<Map<string, LoadedBrew>> {
  if (brewIds.length === 0) return new Map()
  const where = { id: { in: brewIds }, userId }
  switch (brewingMethod) {
    case 'espresso': {
      const brews = await db.query.espressoShots.findMany({
        where,
        with: brewRelations,
      })
      return new Map(
        brews.map((brew) => [
          brew.id,
          asLoaded(brew, brew.yield, 'Yield', brew.time, 's'),
        ]),
      )
    }
    case 'aeropress': {
      const brews = await db.query.aeropressBrews.findMany({
        where,
        with: brewRelations,
      })
      return new Map(
        brews.map((brew) => [
          brew.id,
          asLoaded(brew, brew.water, 'Water', brew.steepTime, 's'),
        ]),
      )
    }
    case 'pourover': {
      const brews = await db.query.pouroverBrews.findMany({
        where,
        with: brewRelations,
      })
      return new Map(
        brews.map((brew) => [
          brew.id,
          asLoaded(brew, brew.water, 'Water', brew.brewTime, 's'),
        ]),
      )
    }
    case 'frenchpress': {
      const brews = await db.query.frenchpressBrews.findMany({
        where,
        with: brewRelations,
      })
      return new Map(
        brews.map((brew) => [
          brew.id,
          asLoaded(brew, brew.water, 'Water', brew.steepTime, 's'),
        ]),
      )
    }
    case 'coldBrew': {
      const brews = await db.query.coldBrewBrews.findMany({
        where,
        with: brewRelations,
      })
      return new Map(
        brews.map((brew) => [
          brew.id,
          asLoaded(brew, brew.water, 'Water', brew.steepTime, 'min'),
        ]),
      )
    }
  }
}

async function loadBrew(
  brewingMethod: BrewingMethod,
  brewId: string,
  userId: string,
): Promise<LoadedBrew | null> {
  const loaded = await loadBrews(brewingMethod, [brewId], userId)
  return loaded.get(brewId) ?? null
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
    coffeeId: row.coffeeId,
    brewingMethod: row.brewingMethod,
    brewingDeviceId: row.brewingDeviceId,
    brewId: row.brewId,
  }))
}

export async function dialedInBrewIdsForUser(
  userId: string,
): Promise<Set<string>> {
  const rows = await db.query.dialedInBrews.findMany({
    where: { userId },
    columns: { brewId: true },
  })
  return new Set(rows.map((row) => row.brewId))
}

export async function coffeeIdsWithDialedIn(
  userId: string,
): Promise<Set<string>> {
  const rows = await db.query.dialedInBrews.findMany({
    where: { userId },
    columns: { coffeeId: true },
  })
  return new Set(rows.map((row) => row.coffeeId))
}

export async function brewIdsForMethod(
  userId: string,
  brewingMethod: BrewingMethod,
): Promise<Array<string>> {
  const rows = await db.query.dialedInBrews.findMany({
    where: { userId, brewingMethod },
    columns: { brewId: true },
  })
  return rows.map((row) => row.brewId)
}

export function withDialedInFlag<T extends { id: string }>(
  brews: Array<T>,
  ids: Set<string>,
): Array<T & { isDialedIn: boolean }> {
  return brews.map((brew) => ({ ...brew, isDialedIn: ids.has(brew.id) }))
}

export async function dropStaleMembership(
  userId: string,
  brewId: string,
  key: DialedInKey,
) {
  await db
    .delete(dialedInBrews)
    .where(
      and(
        eq(dialedInBrews.userId, userId),
        eq(dialedInBrews.brewId, brewId),
        eq(dialedInBrews.coffeeId, key.coffeeId),
        eq(dialedInBrews.brewingMethod, key.brewingMethod),
        eq(dialedInBrews.brewingDeviceId, key.brewingDeviceId),
      ),
    )
}

export async function getDialedInBrews(
  userId: string,
  key: DialedInKey,
  shelf: Shelf,
): Promise<Array<DialedInBrewView>> {
  const rows = await db.query.dialedInBrews.findMany({
    where: {
      userId,
      coffeeId: key.coffeeId,
      brewingMethod: key.brewingMethod,
      brewingDeviceId: key.brewingDeviceId,
    },
  })
  if (rows.length === 0) return []

  const deviceName = await deviceNameFor(key.brewingDeviceId, userId)
  if (!deviceName) {
    await db
      .delete(dialedInBrews)
      .where(
        and(
          eq(dialedInBrews.userId, userId),
          eq(dialedInBrews.coffeeId, key.coffeeId),
          eq(dialedInBrews.brewingMethod, key.brewingMethod),
          eq(dialedInBrews.brewingDeviceId, key.brewingDeviceId),
        ),
      )
    return []
  }

  const loaded = await loadBrews(
    key.brewingMethod,
    rows.map((row) => row.brewId),
    userId,
  )
  const views: Array<DialedInBrewView> = []
  for (const row of rows) {
    const brew = loaded.get(row.brewId)
    if (
      !brew ||
      brew.coffeeId !== key.coffeeId ||
      brew.brewingDeviceId !== key.brewingDeviceId
    ) {
      await dropStaleMembership(userId, row.brewId, key)
      continue
    }
    views.push(
      toView(
        {
          coffeeId: key.coffeeId,
          brewingMethod: key.brewingMethod,
          brewingDeviceId: key.brewingDeviceId,
          brewId: row.brewId,
        },
        brew,
        deviceName,
        shelf,
      ),
    )
  }
  return views
}

export async function setDialedInBrew(
  userId: string,
  brewingMethod: BrewingMethod,
  brewingDeviceId: string,
  brewId: string,
  shelf: Shelf,
): Promise<DialedInMapping> {
  const deviceName = await deviceNameFor(brewingDeviceId, userId)
  if (!deviceName) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brewing device not found',
    })
  }

  const brew = await loadBrew(brewingMethod, brewId, userId)
  if (!brew) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brew not found for this method',
    })
  }
  if (brew.brewingDeviceId !== brewingDeviceId) {
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

  await db
    .insert(dialedInBrews)
    .values({
      userId,
      coffeeId: brew.coffeeId,
      brewingMethod,
      brewingDeviceId,
      brewId,
    })
    .onConflictDoUpdate({
      target: [
        dialedInBrews.userId,
        dialedInBrews.coffeeId,
        dialedInBrews.brewingMethod,
        dialedInBrews.brewingDeviceId,
      ],
      set: {
        brewId,
        updatedAt: sql`now()`,
      },
    })

  return {
    coffeeId: brew.coffeeId,
    brewingMethod,
    brewingDeviceId,
    brewId,
  }
}

export async function unsetDialedInBrew(
  userId: string,
  brewId: string,
): Promise<void> {
  await db
    .delete(dialedInBrews)
    .where(
      and(eq(dialedInBrews.userId, userId), eq(dialedInBrews.brewId, brewId)),
    )
}

export async function stampDialedIn<T extends { id: string }>(
  userId: string,
  brews: Array<T>,
): Promise<Array<T & { isDialedIn: boolean }>> {
  const ids = await dialedInBrewIdsForUser(userId)
  return withDialedInFlag(brews, ids)
}

export async function sealBrewsWithDialedIn<
  T extends SealableBrew & { id: string },
>(
  userId: string,
  shelf: () => Promise<Shelf>,
  load: () => Promise<Array<T>>,
) {
  return stampDialedIn(userId, await sealBrews(shelf, load))
}

export async function sealBrewPageWithDialedIn<
  T extends SealableBrew & { id: string },
>(
  userId: string,
  shelf: () => Promise<Shelf>,
  load: () => Promise<{ items: Array<T>; total: number }>,
) {
  const page = await sealBrewPage(shelf, load)
  return { ...page, items: await stampDialedIn(userId, page.items) }
}

export async function sealBrewWithDialedIn<
  T extends SealableBrew & { id: string },
>(userId: string, shelf: () => Promise<Shelf>, load: () => Promise<T>) {
  const brew = await sealBrew(shelf, load)
  const [stamped] = await stampDialedIn(userId, [brew])
  return stamped
}
