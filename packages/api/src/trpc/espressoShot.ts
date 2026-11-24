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
import { PG_FOREIGN_KEY_VIOLATION, pgErrorIn } from '../lib/pg-error'
import { isSealed, loadShelf, stampFallenBrews } from '../lib/shelf'
import {
  onOwnCoffee,
  ownGear,
  visibleDeviceType,
} from '../lib/brew-ownership'
import { authedProcedure, createTRPCRouter } from './init'
import type {
  EspressoShotCursor,
  EspressoShotCursorKey,
} from '../lib/espresso'
import type { PlanId } from '../lib/plan'
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

function loadShotsByIds(
  userId: string,
  ids: Array<string>,
  executor: Pick<typeof db, 'query'> = db,
) {
  return executor.query.espressoShots.findMany({
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
  q: z
    .string()
    .trim()
    .max(ESPRESSO_SHOT_Q_MAX)
    // Postgres text cannot hold NUL, so the query would fail with a 500.
    .refine((q) => !q.includes('\0'), 'Search cannot contain NUL')
    .optional(),
  dialedIn: z.boolean().optional(),
  // Clients from before cursors sent offset. Dropping it would answer them
  // with page one again, which they would append as duplicates.
  offset: z.never({ error: 'Reload to continue paging' }).optional(),
})

// What JS String.prototype.trim() strips, which coffeeOptionLabel uses.
const JS_TRIM_CHARS =
  ' \t\n\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006' +
  '\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

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

// Matches formatBrewRatio in @coffee-companion/brew-display.
const MAX_RATIO_DECIMALS = 20

// The ratio as the log shows it (formatBrewRatio): yield/dose to two
// decimals without trailing zeros, so "1:2" finds 18g → 36g. A positive ratio
// that would round to zero keeps more decimals, up to MAX_RATIO_DECIMALS
// (1:0.003).
function shownRatio() {
  // A quotient past numeric's ~131072 integer digits would fail the whole
  // query, so a ratio that large is no ratio; the log bounds it first.
  const ratio = sql`(CASE WHEN log(GREATEST(${espressoShots.yield}, 1)) - log(NULLIF(abs(${espressoShots.dose}), 0)) < 130000 THEN ${espressoShots.yield} / ${espressoShots.dose} END)`
  const places = Array.from(
    { length: MAX_RATIO_DECIMALS - 1 },
    (_, index) => index + 2,
  ).map(
    (decimals) => sql`NULLIF(round(${ratio}, ${sql.raw(String(decimals))}), 0)`,
  )
  return sql`trim_scale(COALESCE(CASE WHEN ${ratio} > 0 THEN COALESCE(${sql.join(places, sql`, `)}) END, round(${ratio}, 2)))`
}

const RATIO_TERM = /^[0-9.:-]+$/

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
      // Ratio text is `1:` and a decimal, so a term with any other character
      // cannot match it; skipping it spares every row the division.
      ...(RATIO_TERM.test(q)
        ? [sql`'1:' || CAST(${shownRatio()} AS TEXT) ILIKE ${pattern}`]
        : []),
    )
    // Also the Coffee column's label, coffeeOptionLabel's `Coffee · Roaster`,
    // with the same visible roaster; a blank one shows no ` · `, and the
    // NULL leaves the coffee name alone to match.
    const identityMatch = or(
      ilike(coffees.name, pattern),
      ilike(roasters.name, pattern),
      sql`${coffees.name} || ' · ' || NULLIF(btrim(${roasters.name}, ${JS_TRIM_CHARS}), '') ILIKE ${pattern}`,
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
  plan: PlanId,
): Promise<{ page: RecentPage; shelf: Shelf }> {
  const dialedInOn = and(
    eq(dialedInBrews.brewId, espressoShots.id),
    eq(dialedInBrews.userId, userId),
    eq(dialedInBrews.brewingMethod, 'espresso'),
  )
  // One snapshot, so the Shelf, the total, the cursor and the hydrated shots
  // agree even while another request saves or deletes a shot.
  return db.transaction(
    async (tx) => {
      const shelf = await loadShelf(userId, plan, tx)
      const where = recentWhere(userId, input, shelf)
      const countWhere = recentWhere(
        userId,
        { coffeeId: input.coffeeId, q: input.q },
        shelf,
      )
      const pageQuery = tx
        .select({
          id: espressoShots.id,
          createdAt:
            sql<string>`to_char(${espressoShots.createdAt}, ${ESPRESSO_CURSOR_TIMESTAMP_FORMAT})`.as(
              'created_at',
            ),
        })
        .from(espressoShots)
        .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
        .leftJoin(roasters, roasterVisibleTo(userId))
      const countQuery = tx
        .select({ total: count() })
        .from(espressoShots)
        .innerJoin(coffees, eq(coffees.id, espressoShots.coffeeId))
        .leftJoin(roasters, roasterVisibleTo(userId))
      const idRows = await (
        input.dialedIn
          ? pageQuery.innerJoin(dialedInBrews, dialedInOn)
          : pageQuery
      )
        .where(where)
        .orderBy(desc(espressoShots.createdAt), desc(espressoShots.id))
        .limit(input.limit + 1)
      const [{ total }] = await (
        input.dialedIn
          ? countQuery.innerJoin(dialedInBrews, dialedInOn)
          : countQuery
      ).where(countWhere)
      const hasMore = idRows.length > input.limit
      const pageRows = hasMore ? idRows.slice(0, input.limit) : idRows
      const ids = pageRows.map((row) => row.id)
      if (pageRows.length === 0) {
        return { page: { items: [], total, nextCursor: null }, shelf }
      }
      const last = pageRows[pageRows.length - 1]
      const nextCursor: EspressoShotCursor | null = hasMore
        ? encodeEspressoShotCursor({ createdAt: last.createdAt, id: last.id })
        : null
      const items = await loadShotsByIds(userId, ids, tx)
      const byId = new Map(items.map((item) => [item.id, item]))
      return {
        page: {
          items: ids.flatMap((id) => {
            const item = byId.get(id)
            return item ? [item] : []
          }),
          total,
          nextCursor,
        },
        shelf,
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
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
    // Only a device the user can list, as ownGear reads it back.
    db.query.brewingDevices.findFirst({
      where: {
        id: input.brewingDeviceId,
        userId,
        type: visibleDeviceType(userId),
      },
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
  let claimedId: string | null
  try {
    claimedId = await claimShot(userId, idempotencyKey, shot)
  } catch (error) {
    // An overlapping request with this key may have saved the shot and its
    // gear been deleted since: replay that key (deleted, here) rather than
    // fail the save. Without a claimed key, the failure stands.
    if (!pgErrorIn(error, PG_FOREIGN_KEY_VIOLATION)) throw error
    const claimed = await loadIdempotencyKey(userId, idempotencyKey)
    if (!claimed) throw error
    return replayShotId(userId, claimed, input)
  }
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

// Inserts the shot and claims its key together; null when another request
// already holds the key.
function claimShot(
  userId: string,
  idempotencyKey: string,
  shot: z.infer<typeof insertEspressoShotSchema>,
) {
  return db.transaction(async (tx) => {
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
      const { page, shelf } = await loadRecentPage(
        ctx.session.user.id,
        {
          limit: input.limit,
          coffeeId: input.coffeeId,
          q: input.q,
          cursor,
          dialedIn: input.dialedIn,
        },
        ctx.plan,
      )
      // Seal with the Shelf the page was read against, not a fresh one.
      return sealBrewPageWithDialedIn(
        ctx.session.user.id,
        () => Promise.resolve(shelf),
        () => Promise.resolve(page),
      )
    }),

  getLatestUnsealed: authedProcedure
    .input(z.object({ coffeeId: uuidInput() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      // The Shelf and the shot from one snapshot, as in getRecent, so a save
      // or edit in between cannot pair a shot with a Shelf it never had.
      const found = await db.transaction(
        async (tx) => {
          const shelf = await loadShelf(userId, ctx.plan, tx)
          if (shelf !== null && !shelf.has(input.coffeeId)) return null
          const shot = await tx.query.espressoShots.findFirst({
            where: {
              userId,
              coffeeId: input.coffeeId,
              ...onOwnCoffee(userId),
              ...(shelf !== null ? { sealedAt: { isNull: true } } : {}),
            },
            orderBy: { createdAt: 'desc', id: 'desc' },
            with: withRelations(userId),
          })
          return shot ? { shot, shelf } : null
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      if (!found) return null
      return sealBrewWithDialedIn(
        userId,
        () => Promise.resolve(found.shelf),
        () => Promise.resolve(found.shot),
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
      let keyRow = await loadIdempotencyKey(userId, input.idempotencyKey)
      if (!keyRow) {
        try {
          await assertOwnEspressoGear(input, userId)
        } catch (error) {
          // A retry may have read no key while the first request saved and
          // its gear was then deleted: replay that key (deleted, here) rather
          // than report the gear missing. Without a claimed key, it stands.
          keyRow = await loadIdempotencyKey(userId, input.idempotencyKey)
          if (!keyRow) throw error
        }
      }
      let shotId: string
      if (keyRow) {
        shotId = await replayShotId(userId, keyRow, input)
      } else {
        await stampFallenBrews(userId, ctx.plan)
        shotId = await insertShotWithKey(userId, input)
      }

      // A fresh Shelf, not the request's (another read in the same batch may
      // have computed it before this insert lifted the Coffee onto it), and
      // read with the shot from one snapshot, so an edit in between cannot
      // pair the shot with a Shelf it never had.
      const found = await db.transaction(
        async (tx) => ({
          shelf: await loadShelf(userId, ctx.plan, tx),
          shot: await tx.query.espressoShots.findFirst({
            where: { id: shotId, userId },
          }),
        }),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      // Deleted since the key was claimed, e.g. from another device.
      throwIfKeyDeleted(found.shot)
      const shot = found.shot
      return sealBrewWithDialedIn(
        userId,
        () => Promise.resolve(found.shelf),
        () => Promise.resolve(shot),
      )
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

      // Moving a Brew lifts its new Coffee up the Shelf, so stamp first
      // (ADR-0004), or that Coffee's Sealed Brews would read again.
      if (existing && existing.coffeeId !== data.coffeeId) {
        await stampFallenBrews(ctx.session.user.id, ctx.plan)
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
