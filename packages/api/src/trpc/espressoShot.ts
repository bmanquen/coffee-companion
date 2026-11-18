import { createHash } from 'node:crypto'
import { and, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import {
  coffees,
  dialedInBrews,
  espressoShotIdempotencyKeys,
  espressoShots,
  roasters,
} from '../db/schema'
import { insertEspressoShotSchema, uuidInput } from '../db/zod'
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
  SHOT_IDEMPOTENCY_DELETED,
  SHOT_REPLAY_CONFLICT,
  decodeEspressoShotCursor,
  encodeEspressoShotCursor,
  isEspressoDevice,
  normalizeDecimal,
} from '../lib/espresso'
import { isSealed, stampFallenBrews } from '../lib/shelf'
import { onOwnCoffee, ownGear } from '../lib/brew-ownership'
import { authedProcedure, createTRPCRouter } from './init'
import type {
  EspressoShotCursor,
  EspressoShotCursorKey,
} from '../lib/espresso'
import type { Shelf } from '../lib/shelf'

export const TRPC_BAD_REQUEST = 'BAD_REQUEST' as const
export const TRPC_CONFLICT = 'CONFLICT' as const
export { SHOT_IDEMPOTENCY_DELETED, SHOT_REPLAY_CONFLICT }

// A coffee written before roasters were checked may point at another user's.
function withRelations(userId: string) {
  const visible = { OR: [{ userId: { isNull: true as const } }, { userId }] }
  return {
    coffee: { with: { roaster: { where: visible } } },
    ...ownGear(userId),
  } as const
}

function roasterVisibleTo(userId: string) {
  return and(
    eq(roasters.id, coffees.roasterId),
    or(isNull(roasters.userId), eq(roasters.userId, userId)),
  )
}

function loadShotsByIds(userId: string, ids: Array<string>) {
  return db.query.espressoShots.findMany({
    where: { userId, id: { in: ids } },
    with: withRelations(userId),
  })
}

type LoadedShot = Awaited<ReturnType<typeof loadShotsByIds>>[number]

type RecentPage = {
  items: Array<LoadedShot>
  total: number
  nextCursor: EspressoShotCursor | null
}

const getRecentInput = z.object({
  limit: z.number().int().min(1).max(50),
  cursor: z.string().min(1).max(256).optional(),
  coffeeId: uuidInput().optional(),
  q: z.string().trim().max(ESPRESSO_SHOT_Q_MAX).optional(),
  dialedIn: z.boolean().optional(),
})

function likeContains(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

// Identifies a create request, so 16 and 16.0 replay as the same shot. Hashed
// so the key row keeps no copy of the notes after the shot is deleted.
function replayFingerprint(
  shot: Pick<
    typeof espressoShots.$inferInsert,
    | 'coffeeId'
    | 'grinderId'
    | 'brewingDeviceId'
    | 'roastDate'
    | 'dose'
    | 'yield'
    | 'time'
    | 'grindSetting'
    | 'notes'
  >,
) {
  const fields = [
    shot.coffeeId,
    shot.grinderId,
    shot.brewingDeviceId,
    shot.roastDate ?? null,
    normalizeDecimal(shot.dose),
    normalizeDecimal(shot.yield),
    shot.time,
    shot.grindSetting ?? null,
    shot.notes ?? null,
  ]
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex')
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
  const parts = [eq(espressoShots.userId, userId), eq(coffees.userId, userId)]
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
    .leftJoin(roasters, roasterVisibleTo(userId))
  const countQuery = db
    .select({ total: count() })
    .from(espressoShots)
    .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
    .leftJoin(roasters, roasterVisibleTo(userId))
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

// Every reference must be the user's own, and the device an Espresso one.
async function assertOwnEspressoGear(
  input: { coffeeId: string; grinderId: string; brewingDeviceId: string },
  userId: string,
) {
  const [coffee, grinder, device] = await Promise.all([
    db.query.coffees.findFirst({
      where: { id: input.coffeeId, userId },
      columns: { id: true },
    }),
    db.query.grinders.findFirst({
      where: { id: input.grinderId, userId },
      columns: { id: true },
    }),
    db.query.brewingDevices.findFirst({
      where: { id: input.brewingDeviceId, userId },
      with: { type: true },
    }),
  ])
  if (!coffee) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Coffee not found' })
  }
  if (!grinder) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Grinder not found' })
  }
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

async function loadIdempotencyKey(userId: string, idempotencyKey: string) {
  const rows = await db
    .select()
    .from(espressoShotIdempotencyKeys)
    .where(
      and(
        eq(espressoShotIdempotencyKeys.userId, userId),
        eq(espressoShotIdempotencyKeys.idempotencyKey, idempotencyKey),
      ),
    )
  if (rows.length === 0) return null
  return rows[0]
}

function throwIfKeyDeleted<T>(value: T | null | undefined): asserts value is T {
  if (value != null) return
  throw new TRPCError({
    code: TRPC_CONFLICT,
    message: SHOT_IDEMPOTENCY_DELETED,
  })
}

async function insertShotWithKey(
  userId: string,
  input: z.infer<typeof insertEspressoShotSchema> & { idempotencyKey: string },
) {
  const { idempotencyKey, ...shot } = input
  const claimedId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(espressoShots)
      .values({ ...shot, userId })
      .returning({ id: espressoShots.id })
    const shotId = inserted[0].id
    const claimed = await tx
      .insert(espressoShotIdempotencyKeys)
      .values({
        userId,
        idempotencyKey,
        shotId,
        requestFingerprint: replayFingerprint(shot),
      })
      .onConflictDoNothing()
      .returning({
        shotId: espressoShotIdempotencyKeys.shotId,
      })
    if (claimed.length > 0) return shotId
    await tx.delete(espressoShots).where(eq(espressoShots.id, shotId))
    return null
  })
  if (claimedId) return claimedId

  const raced = await loadIdempotencyKey(userId, idempotencyKey)
  if (!raced) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not save this shot',
    })
  }
  return replayShotId(userId, raced, input)
}

// A retry of the request that claimed the key gets the shot as it is now, even
// after an edit. A different request under the same key is a conflict.
async function replayShotId(
  userId: string,
  keyRow: typeof espressoShotIdempotencyKeys.$inferSelect,
  input: z.infer<typeof insertEspressoShotSchema>,
) {
  const { shotId } = keyRow
  throwIfKeyDeleted(shotId)
  const existing = await db.query.espressoShots.findFirst({
    where: { id: shotId, userId },
  })
  throwIfKeyDeleted(existing)
  const claimed = keyRow.requestFingerprint ?? replayFingerprint(existing)
  if (claimed !== replayFingerprint(input)) {
    throw new TRPCError({
      code: TRPC_CONFLICT,
      message: SHOT_REPLAY_CONFLICT,
    })
  }
  return existing.id
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
    .input(z.object({ coffeeId: uuidInput() }))
    .query(async ({ ctx, input }) => {
      const shelf = await ctx.shelf()
      if (shelf !== null && !shelf.has(input.coffeeId)) return null
      const shot = await db.query.espressoShots.findFirst({
        where: {
          userId: ctx.session.user.id,
          coffeeId: input.coffeeId,
          ...onOwnCoffee(ctx.session.user.id),
          ...(shelf !== null ? { sealedAt: { isNull: true } } : {}),
        },
        orderBy: { createdAt: 'desc', id: 'desc' },
        with: withRelations(ctx.session.user.id),
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
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ids = await brewIdsForMethod(ctx.session.user.id, 'espresso')
      if (ids.length === 0) return []
      return sealBrewsWithDialedIn(ctx.session.user.id, ctx.shelf, () =>
        db.query.espressoShots.findMany({
          where: {
            userId: ctx.session.user.id,
            id: { in: ids },
            ...onOwnCoffee(ctx.session.user.id),
          },
          orderBy: { createdAt: 'desc', id: 'desc' },
          with: withRelations(ctx.session.user.id),
          limit: input?.limit,
        }),
      )
    }),

  // Sealed here too: the edit form would otherwise hand back every setting the
  // feeds withhold.
  getById: authedProcedure.input(uuidInput()).query(({ ctx, input }) =>
    sealBrewWithDialedIn(ctx.session.user.id, ctx.shelf, async () => {
      const shot = await db.query.espressoShots.findFirst({
        where: {
          id: input,
          userId: ctx.session.user.id,
          ...onOwnCoffee(ctx.session.user.id),
        },
      })
      if (!shot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
      }
      return shot
    }),
  ),

  create: authedProcedure
    .input(insertEspressoShotSchema.extend({ idempotencyKey: uuidInput() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const keyRow = await loadIdempotencyKey(userId, input.idempotencyKey)
      let shotId: string
      if (keyRow) {
        shotId = await replayShotId(userId, keyRow, input)
      } else {
        await assertOwnEspressoGear(input, userId)
        await stampFallenBrews(userId, ctx.plan)
        shotId = await insertShotWithKey(userId, input)
      }

      return sealBrewWithDialedIn(userId, ctx.shelf, async () => {
        const shot = await db.query.espressoShots.findFirst({
          where: { id: shotId, userId },
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
    .input(insertEspressoShotSchema.extend({ id: uuidInput() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await assertOwnEspressoGear(data, ctx.session.user.id)

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
    .input(uuidInput())
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
