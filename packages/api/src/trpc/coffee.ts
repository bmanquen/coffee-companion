import { and, count, eq, inArray } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coffeeOrigins, coffees, espressoShots, regions } from '../db/schema'
import { insertCoffeeSchema } from '../db/zod'
import { isSealed, sealNestedBrew, stampFallenBrews } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'
import type { CoffeeOriginInput, InsertCoffee } from '../db/zod'

const originWithPlace = {
  country: true,
  region: true,
} as const

function sortedOrigins<T extends { country?: { name: string } | null }>(
  origins: Array<T>,
) {
  return [...origins].sort((a, b) =>
    (a.country?.name ?? '').localeCompare(b.country?.name ?? ''),
  )
}

function coffeeColumnValues(input: InsertCoffee) {
  const { origins: _origins, ...columns } = input
  return columns
}

function isPgUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (typeof current !== 'object' || current === null) return false
    if ('code' in current && (current as { code: unknown }).code === '23505') {
      return true
    }
    current =
      'cause' in current ? (current as { cause: unknown }).cause : undefined
  }
  return false
}

function rethrowUniqueCoffeeConflict(err: unknown): never {
  if (isPgUniqueViolation(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A coffee with this name already exists for this roaster',
    })
  }
  throw err
}

function originRows(coffeeId: string, origins: Array<CoffeeOriginInput>) {
  const seen = new Set<string>()
  return origins.map((origin) => {
    if (seen.has(origin.countryId)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A coffee can list a country only once',
      })
    }
    seen.add(origin.countryId)
    return {
      coffeeId,
      countryId: origin.countryId,
      regionId: origin.regionId || null,
    }
  })
}

async function assertRegionsBelongToCountries(
  origins: Array<CoffeeOriginInput>,
) {
  const regionIds = origins.flatMap((origin) =>
    origin.regionId ? [origin.regionId] : [],
  )
  if (regionIds.length === 0) return
  const found = await db
    .select({ id: regions.id, countryId: regions.countryId })
    .from(regions)
    .where(inArray(regions.id, regionIds))
  const countryByRegion = new Map(found.map((row) => [row.id, row.countryId]))
  for (const origin of origins) {
    if (!origin.regionId) continue
    if (countryByRegion.get(origin.regionId) !== origin.countryId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Region must belong to its origin country',
      })
    }
  }
}

async function replaceOrigins(
  tx: Pick<typeof db, 'delete' | 'insert'>,
  coffeeId: string,
  origins: Array<CoffeeOriginInput>,
) {
  const rows = originRows(coffeeId, origins)
  await tx.delete(coffeeOrigins).where(eq(coffeeOrigins.coffeeId, coffeeId))
  if (rows.length > 0) {
    await tx.insert(coffeeOrigins).values(rows)
  }
}

export const coffeeRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    const [rows, shelf] = await Promise.all([
      db.query.coffees.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { updatedAt: 'desc' },
        with: {
          process: true,
          roaster: true,
          roastLevel: true,
          origins: { with: originWithPlace },
          // Varieties are a many-to-many via the join table; flatten below.
          coffeesVarieties: { with: { variety: true } },
          // The coffee's dialed-in espresso shot, if one is set.
          espressoShots: { where: { isDialedIn: true }, limit: 1 },
        },
      }),
      ctx.shelf(),
    ])
    return rows.map(
      ({ espressoShots: dialedIn, coffeesVarieties, origins, ...coffee }) => ({
        ...coffee,
        origins: sortedOrigins(origins),
        varieties: coffeesVarieties.map((cv) => cv.variety),
        // Blanked rather than dropped, like every Brew feed: a Sealed dial-in
        // is still the coffee's reference shot, and the list is where a user
        // notices it has gone.
        dialedInShot: sealNestedBrew(dialedIn.at(0) ?? null, shelf),
      }),
    )
  }),

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const coffee = await db.query.coffees.findFirst({
      where: { id: input, userId: ctx.session.user.id },
      with: { origins: { with: originWithPlace } },
    })
    if (!coffee) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
    }
    return { ...coffee, origins: sortedOrigins(coffee.origins) }
  }),

  getRecent: authedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }),
    )
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.coffees.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ total: count() })
          .from(coffees)
          .where(eq(coffees.userId, ctx.session.user.id)),
      ])
      return { items, total }
    }),

  create: authedProcedure
    .input(insertCoffeeSchema)
    .mutation(async ({ ctx, input }) => {
      const origins = input.origins ?? []
      await assertRegionsBelongToCountries(origins)
      try {
        return await db.transaction(async (tx) => {
          const [coffee] = await tx
            .insert(coffees)
            .values({
              ...coffeeColumnValues(input),
              userId: ctx.session.user.id,
            })
            .returning()
          await replaceOrigins(tx, coffee.id, origins)
          return coffee
        })
      } catch (err) {
        rethrowUniqueCoffeeConflict(err)
      }
    }),

  update: authedProcedure
    .input(insertCoffeeSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const existing = await db.query.coffees.findFirst({
        where: { id, userId: ctx.session.user.id },
        columns: { id: true },
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
      }
      if (data.origins) {
        await assertRegionsBelongToCountries(data.origins)
      }
      try {
        return await db.transaction(async (tx) => {
          const updated = await tx
            .update(coffees)
            .set(coffeeColumnValues(data))
            .where(
              and(eq(coffees.id, id), eq(coffees.userId, ctx.session.user.id)),
            )
            .returning()
          if (updated.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Coffee not found',
            })
          }
          if (data.origins) {
            await replaceOrigins(tx, id, data.origins)
          }
          return updated[0]
        })
      } catch (err) {
        if (err instanceof TRPCError) throw err
        rethrowUniqueCoffeeConflict(err)
      }
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const deleted = await db
        .delete(coffees)
        .where(
          and(eq(coffees.id, input), eq(coffees.userId, ctx.session.user.id)),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
      }
      return deleted[0]
    }),

  setDialedIn: authedProcedure
    .input(z.object({ coffeeId: z.string(), shotId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // A Sealed Brew cannot become the reference to reproduce: its settings
      // are not readable, so it would arrive as a Sealed row nobody can act on.
      if (input.shotId) {
        const target = await db.query.espressoShots.findFirst({
          where: { id: input.shotId, userId },
        })
        if (target && isSealed(target, await ctx.shelf())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'This Brew is Sealed. Subscribe to dial it in again.',
          })
        }
      }
      await db.transaction(async (tx) => {
        // Clear the coffee's current dialed-in espresso shot, if any. The
        // partial unique index allows only one dialed-in shot per coffee, so
        // this must run before flagging a new one.
        await tx
          .update(espressoShots)
          .set({ isDialedIn: false })
          .where(
            and(
              eq(espressoShots.coffeeId, input.coffeeId),
              eq(espressoShots.userId, userId),
              eq(espressoShots.isDialedIn, true),
            ),
          )
        if (input.shotId) {
          await tx
            .update(espressoShots)
            .set({ isDialedIn: true })
            .where(
              and(
                eq(espressoShots.id, input.shotId),
                eq(espressoShots.userId, userId),
              ),
            )
        }
      })
    }),
})
