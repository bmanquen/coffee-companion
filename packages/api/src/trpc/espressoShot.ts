import { and, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { coffees, dialedInBrews, espressoShots, roasters } from '../db/schema'
import { insertEspressoShotSchema } from '../db/zod'
import {
  brewIdsForMethod,
  sealBrewPageWithDialedIn,
  sealBrewWithDialedIn,
  sealBrewsWithDialedIn,
} from '../lib/dialed-in-brew'
import {
  ESPRESSO_CURSOR_TIMESTAMP_FORMAT,
  ESPRESSO_DEVICE_TYPE,
  ESPRESSO_SHOT_Q_MAX,
  decodeEspressoShotCursor,
  encodeEspressoShotCursor,
  isEspressoDevice,
  normalizeDecimal,
} from '../lib/espresso'
import { isSealed, stampFallenBrews } from '../lib/shelf'
import { authedProcedure, createTRPCRouter } from './init'
import type { EspressoShotCursor } from '../lib/espresso'
import type { Shelf } from '../lib/shelf'

type EspressoShotCursorKey = NonNullable<
  ReturnType<typeof decodeEspressoShotCursor>
>

export const TRPC_BAD_REQUEST = 'BAD_REQUEST' as const
export const TRPC_CONFLICT = 'CONFLICT' as const

const SHOT_REPLAY_CONFLICT =
  'This shot was already saved with different settings.'

const withRelations = {
  coffee: { with: { roaster: true } },
  grinder: true,
  brewingDevice: { with: { type: true } },
} as const

function loadShotsByIds(userId: string, ids: Array<string>) {
  return db.query.espressoShots.findMany({
    where: { userId, id: { in: ids } },
    with: withRelations,
  })
}

type LoadedShot = Awaited<ReturnType<typeof loadShotsByIds>>[number]

type RecentPage = {
  items: Array<LoadedShot>
  total: number
  nextCursor: EspressoShotCursor | null
}

const getRecentInput = z.object({
  limit: z.number().min(1).max(50),
  cursor: z.string().min(1).max(256).optional(),
  coffeeId: z.uuid().optional(),
  q: z.string().trim().max(ESPRESSO_SHOT_Q_MAX).optional(),
  dialedIn: z.boolean().optional(),
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
    normalizeDecimal(stored.dose) === normalizeDecimal(input.dose) &&
    normalizeDecimal(stored.yield) === normalizeDecimal(input.yield) &&
    stored.time === input.time &&
    (stored.grindSetting ?? null) === input.grindSetting &&
    (stored.notes ?? null) === (input.notes ?? null)
  )
}

function settingsReadable(shelf: Shelf) {
  if (shelf === null) return undefined
  const onShelf = [...shelf]
  if (onShelf.length === 0) return sql`false`
  return and(
    isNull(espressoShots.sealedAt),
    inArray(espressoShots.coffeeId, onShelf),
  )
}

function cursorTimestamp(createdAt: string) {
  return sql`${createdAt}::timestamp`
}

function afterCursor(cursor: EspressoShotCursorKey) {
  const createdAt = cursorTimestamp(cursor.createdAt)
  return or(
    lt(espressoShots.createdAt, createdAt),
    and(
      eq(espressoShots.createdAt, createdAt),
      lt(espressoShots.id, cursor.id),
    ),
  )
}

function recentWhere(
  userId: string,
  input: {
    coffeeId?: string
    q?: string
    cursor?: EspressoShotCursorKey
  },
  shelf: Shelf,
) {
  const parts = [eq(espressoShots.userId, userId)]
  if (input.coffeeId) parts.push(eq(espressoShots.coffeeId, input.coffeeId))
  if (input.cursor) {
    const cursorWhere = afterCursor(input.cursor)
    if (cursorWhere) parts.push(cursorWhere)
  }
  const q = input.q?.trim()
  if (q) {
    const pattern = likeContains(q)
    const settingsMatch = or(
      ilike(espressoShots.grindSetting, pattern),
      ilike(espressoShots.notes, pattern),
      sql`CAST(${espressoShots.dose} AS TEXT) ILIKE ${pattern}`,
      sql`CAST(${espressoShots.yield} AS TEXT) ILIKE ${pattern}`,
      sql`CAST(${espressoShots.time} AS TEXT) ILIKE ${pattern}`,
    )
    const identityMatch = or(
      ilike(coffees.name, pattern),
      ilike(roasters.name, pattern),
    )
    const readable = settingsReadable(shelf)
    parts.push(
      or(
        readable ? and(readable, settingsMatch) : settingsMatch,
        identityMatch,
      )!,
    )
  }
  return and(...parts)
}

function decodeCursorOrThrow(cursor: string): EspressoShotCursorKey {
  const decoded = decodeEspressoShotCursor(cursor)
  if (!decoded) {
    throw new TRPCError({
      code: TRPC_BAD_REQUEST,
      message: 'Invalid cursor',
    })
  }
  return decoded
}

async function loadRecentPage(
  userId: string,
  input: {
    limit: number
    coffeeId?: string
    q?: string
    cursor?: EspressoShotCursorKey
    dialedIn?: boolean
  },
  shelf: Shelf,
): Promise<RecentPage> {
  const where = recentWhere(userId, input, shelf)
  const countWhere = recentWhere(
    userId,
    {
      coffeeId: input.coffeeId,
      q: input.q,
    },
    shelf,
  )
  const dialedInOn = and(
    eq(dialedInBrews.brewId, espressoShots.id),
    eq(dialedInBrews.userId, userId),
    eq(dialedInBrews.brewingMethod, 'espresso'),
  )
  const pageQuery = db
    .select({
      id: espressoShots.id,
      createdAt: sql<string>`to_char(${espressoShots.createdAt}, ${ESPRESSO_CURSOR_TIMESTAMP_FORMAT})`.as(
        'created_at',
      ),
    })
    .from(espressoShots)
    .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
    .leftJoin(roasters, eq(roasters.id, coffees.roasterId))
  const countQuery = db
    .select({ total: count() })
    .from(espressoShots)
    .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
    .leftJoin(roasters, eq(roasters.id, coffees.roasterId))
  const [idRows, [{ total }]] = await Promise.all([
    (input.dialedIn ? pageQuery.innerJoin(dialedInBrews, dialedInOn) : pageQuery)
      .where(where)
      .orderBy(desc(espressoShots.createdAt), desc(espressoShots.id))
      .limit(input.limit + 1),
    (input.dialedIn
      ? countQuery.innerJoin(dialedInBrews, dialedInOn)
      : countQuery
    ).where(countWhere),
  ])
  const hasMore = idRows.length > input.limit
  const pageRows = hasMore ? idRows.slice(0, input.limit) : idRows
  const ids = pageRows.map((row) => row.id)
  if (pageRows.length === 0) {
    return { items: [], total, nextCursor: null }
  }
  const last = pageRows[pageRows.length - 1]
  const nextCursor: EspressoShotCursor | null = hasMore
    ? encodeEspressoShotCursor({ createdAt: last.createdAt, id: last.id })
    : null
  const items = await loadShotsByIds(userId, ids)
  const byId = new Map(items.map((item) => [item.id, item]))
  return {
    items: ids.flatMap((id) => {
      const item = byId.get(id)
      return item ? [item] : []
    }),
    total,
    nextCursor,
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
      code: TRPC_BAD_REQUEST,
      message: `Espresso shots require an ${ESPRESSO_DEVICE_TYPE} brewing device`,
    })
  }
}

export const espressoShotRouter = createTRPCRouter({
  getRecent: authedProcedure
    .input(getRecentInput)
    .query(async ({ ctx, input }) => {
      const cursor = input.cursor
        ? decodeCursorOrThrow(input.cursor)
        : undefined
      return sealBrewPageWithDialedIn(
        ctx.session.user.id,
        ctx.shelf,
        async () =>
          loadRecentPage(
            ctx.session.user.id,
            {
              limit: input.limit,
              coffeeId: input.coffeeId,
              q: input.q,
              cursor,
              dialedIn: input.dialedIn,
            },
            await ctx.shelf(),
          ),
      )
    }),

  getLatestUnsealed: authedProcedure
    .input(z.object({ coffeeId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const shelf = await ctx.shelf()
      if (shelf !== null && !shelf.has(input.coffeeId)) return null
      const shot = await db.query.espressoShots.findFirst({
        where: {
          userId: ctx.session.user.id,
          coffeeId: input.coffeeId,
          ...(shelf !== null ? { sealedAt: { isNull: true } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        with: withRelations,
      })
      if (!shot) return null
      return sealBrewWithDialedIn(
        ctx.session.user.id,
        ctx.shelf,
        () => Promise.resolve(shot),
      )
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
