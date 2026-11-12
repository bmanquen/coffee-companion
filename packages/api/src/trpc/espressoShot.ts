import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coffees, espressoShots, roasters } from '../db/schema'
import { insertEspressoShotSchema } from '../db/zod'
import {
  brewIdsForMethod,
  sealBrewPageWithDialedIn,
  sealBrewWithDialedIn,
  sealBrewsWithDialedIn,
} from '../lib/dialed-in-brew'
import { ESPRESSO_DEVICE_TYPE, isEspressoDevice } from '../lib/espresso'
import { isSealed, stampFallenBrews } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'

const TRPC_CONFLICT = 'CONFLICT' as const

const SHOT_REPLAY_CONFLICT =
  'This shot was already saved with different settings.'

const withRelations = {
  coffee: { with: { roaster: true } },
  grinder: true,
  brewingDevice: { with: { type: true } },
} as const

const getRecentInput = z.object({
  limit: z.number().min(1).max(50),
  offset: z.number().min(0),
  coffeeId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
})

function likeContains(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

function shotMatchesReplay(
  stored: {
    coffeeId: string
    grinderId: string
    brewingDeviceId: string
    roastDate: string | null
    dose: string | null
    yield: string | null
    time: number | null
    grindSetting: string | null
    notes: string | null
  },
  input: {
    coffeeId: string
    grinderId: string
    brewingDeviceId: string
    roastDate?: string | null
    dose: string
    yield: string
    time?: number | null
    grindSetting: string
    notes?: string | null
  },
) {
  return (
    stored.coffeeId === input.coffeeId &&
    stored.grinderId === input.grinderId &&
    stored.brewingDeviceId === input.brewingDeviceId &&
    (stored.roastDate ?? null) === (input.roastDate ?? null) &&
    Number(stored.dose) === Number(input.dose) &&
    Number(stored.yield) === Number(input.yield) &&
    stored.time === input.time &&
    (stored.grindSetting ?? null) === input.grindSetting &&
    (stored.notes ?? null) === (input.notes ?? null)
  )
}

function recentWhere(
  userId: string,
  input: { coffeeId?: string; q?: string },
) {
  const parts = [eq(espressoShots.userId, userId)]
  if (input.coffeeId) parts.push(eq(espressoShots.coffeeId, input.coffeeId))
  const q = input.q?.trim()
  if (q) {
    const pattern = likeContains(q)
    parts.push(
      or(
        ilike(espressoShots.grindSetting, pattern),
        ilike(espressoShots.notes, pattern),
        sql`CAST(${espressoShots.dose} AS TEXT) ILIKE ${pattern}`,
        sql`CAST(${espressoShots.yield} AS TEXT) ILIKE ${pattern}`,
        sql`CAST(${espressoShots.time} AS TEXT) ILIKE ${pattern}`,
        ilike(coffees.name, pattern),
        ilike(roasters.name, pattern),
      )!,
    )
  }
  return and(...parts)
}

async function loadRecentPage(
  userId: string,
  input: z.infer<typeof getRecentInput>,
) {
  const where = recentWhere(userId, input)
  const [idRows, [{ total }]] = await Promise.all([
    db
      .select({ id: espressoShots.id })
      .from(espressoShots)
      .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
      .leftJoin(roasters, eq(roasters.id, coffees.roasterId))
      .where(where)
      .orderBy(desc(espressoShots.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ total: count() })
      .from(espressoShots)
      .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
      .leftJoin(roasters, eq(roasters.id, coffees.roasterId))
      .where(where),
  ])
  const ids = idRows.map((row) => row.id)
  if (ids.length === 0) return { items: [], total }
  const items = await db.query.espressoShots.findMany({
    where: { userId, id: { in: ids } },
    with: withRelations,
  })
  const byId = new Map(items.map((item) => [item.id, item]))
  return {
    items: ids.flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    }),
    total,
  }
}

// Espresso shots must be brewed on an Espresso-type device. Throws if the
// device is missing, owned by another user, or not an espresso device.
async function assertEspressoDevice(brewingDeviceId: string, userId: string) {
  const device = await db.query.brewingDevices.findFirst({
    where: { id: brewingDeviceId, userId },
    with: { type: true },
  })
  if (!device) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Brewing device not found',
    })
  }
  if (!isEspressoDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Espresso shots require an ${ESPRESSO_DEVICE_TYPE} brewing device`,
    })
  }
}

export const espressoShotRouter = createTRPCRouter({
  getRecent: authedProcedure
    .input(getRecentInput)
    .query(({ ctx, input }) =>
      sealBrewPageWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        loadRecentPage(ctx.session.user.id, input),
      ),
    ),

  getLatestUnsealed: authedProcedure
    .input(z.object({ coffeeId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const shots = await sealBrewsWithDialedIn(
        ctx.session.user.id,
        ctx.shelf,
        () =>
          db.query.espressoShots.findMany({
            where: {
              userId: ctx.session.user.id,
              coffeeId: input.coffeeId,
            },
            orderBy: { createdAt: 'desc' },
            with: withRelations,
            limit: 20,
          }),
      )
      return shots.find((shot) => !shot.sealed) ?? null
    }),

  // Dialed-in shots, most recent first. An optional limit caps the result;
  // omitting it returns every one. A Sealed one is blanked like any other Brew
  // rather than dropped: it is still Dialed-in, and the user is owed the sight
  // of what subscribing would reopen.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await brewIdsForMethod(ctx.session.user.id, 'espresso')
      if (ids.length === 0) return []
      return sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        db.query.espressoShots.findMany({
          where: { userId: ctx.session.user.id, id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input?.limit,
        }),
      )
    }),

  // Sealed here too: the edit form would otherwise hand back every setting the
  // feeds withhold.
  getById: authedProcedure.input(z.uuid()).query(({ ctx, input }) =>
    sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
      const shot = await db.query.espressoShots.findFirst({
        where: { id: input, userId: ctx.session.user.id },
      })
      if (!shot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return shot
    }),
  ),

  create: authedProcedure
    .input(insertEspressoShotSchema.extend({ idempotencyKey: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertEspressoDevice(input.brewingDeviceId, ctx.session.user.id)

      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const inserted = await db
        .insert(espressoShots)
        .values({ ...input, userId: ctx.session.user.id })
        .onConflictDoNothing({
          target: [espressoShots.userId, espressoShots.idempotencyKey],
        })
        .returning()
      if (!inserted[0]) {
        const existing = await db.query.espressoShots.findFirst({
          where: {
            userId: ctx.session.user.id,
            idempotencyKey: input.idempotencyKey,
          },
        })
        if (!existing) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not save this shot',
          })
        }
        if (!shotMatchesReplay(existing, input)) {
          throw new TRPCError({
            code: TRPC_CONFLICT,
            message: SHOT_REPLAY_CONFLICT,
          })
        }
      }
      return sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
        const shot = await db.query.espressoShots.findFirst({
          where: {
            userId: ctx.session.user.id,
            idempotencyKey: input.idempotencyKey,
          },
        })
        if (!shot) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Shot not found',
          })
        }
        return shot
      })
    }),

  update: authedProcedure
    .input(insertEspressoShotSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await assertEspressoDevice(data.brewingDeviceId, ctx.session.user.id)

      // A Sealed shot reaches the form with its settings withheld, so saving it
      // would write those blanks over what is stored. Nothing is ever deleted
      // (ADR-0004), so the edit is refused instead.
      const existing = await db.query.espressoShots.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (existing && isSealed(existing, await ctx.shelf())) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'This Brew is Sealed. Subscribe to read and edit it again.',
        })
      }

      const updated = await db
        .update(espressoShots)
        .set(data)
        .where(
          and(
            eq(espressoShots.id, id),
            eq(espressoShots.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return updated[0]
    }),

  delete: authedProcedure
    .input(z.uuid())
    .mutation(async ({ ctx, input }) => {
      await stampFallenBrews(ctx.session.user.id, ctx.plan)

      const deleted = await db
        .delete(espressoShots)
        .where(
          and(
            eq(espressoShots.id, input),
            eq(espressoShots.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return deleted[0]
    }),
})
