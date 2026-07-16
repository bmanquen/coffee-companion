import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { frenchpressBrews } from '../db/schema'
import { insertFrenchpressBrewSchema } from '../db/zod'
import {
  FRENCH_PRESS_DEVICE_TYPE,
  isFrenchPressDevice,
} from '../lib/frenchpress'
import { authedProcedure, createTRPCRouter } from './init'

const withRelations = {
  coffee: true,
  grinder: true,
  brewingDevice: { with: { type: true } },
  method: true,
} as const

// French press brews must be brewed on a French Press-type device. Throws if the
// device is missing, owned by another user, or not a french press device.
async function assertFrenchPressDevice(brewingDeviceId: string, userId: string) {
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
  if (!isFrenchPressDevice(device)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `French press brews require a ${FRENCH_PRESS_DEVICE_TYPE} brewing device`,
    })
  }
}

// The method must be a system default (null userId) or owned by the user.
async function assertFrenchPressMethod(methodId: string, userId: string) {
  const method = await db.query.frenchpressMethods.findFirst({
    where: {
      id: methodId,
      OR: [{ userId: { isNull: true } }, { userId }],
    },
  })
  if (!method) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Method not found' })
  }
}

export const frenchpressBrewRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.frenchpressBrews.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      with: withRelations,
    })
  }),

  getRecent: authedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }),
    )
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.frenchpressBrews.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          with: withRelations,
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ total: count() })
          .from(frenchpressBrews)
          .where(eq(frenchpressBrews.userId, ctx.session.user.id)),
      ])
      return { items, total }
    }),

  // Brews that are the dialed-in reference for their coffee+method, most recent
  // first. An optional limit caps the result; omitting it returns all of them.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.query.frenchpressBrews.findMany({
        where: { userId: ctx.session.user.id, isDialedIn: true },
        orderBy: { createdAt: 'desc' },
        with: withRelations,
        limit: input?.limit,
      })
    }),

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const brew = await db.query.frenchpressBrews.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!brew) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return brew
  }),

  create: authedProcedure
    .input(insertFrenchpressBrewSchema)
    .mutation(async ({ ctx, input }) => {
      await assertFrenchPressDevice(input.brewingDeviceId, ctx.session.user.id)
      await assertFrenchPressMethod(input.methodId, ctx.session.user.id)

      const [brew] = await db
        .insert(frenchpressBrews)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return brew
    }),

  update: authedProcedure
    .input(insertFrenchpressBrewSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await assertFrenchPressDevice(data.brewingDeviceId, ctx.session.user.id)
      await assertFrenchPressMethod(data.methodId, ctx.session.user.id)

      const updated = await db
        .update(frenchpressBrews)
        .set(data)
        .where(
          and(
            eq(frenchpressBrews.id, id),
            eq(frenchpressBrews.userId, ctx.session.user.id),
          ),
        )
        .returning()
      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
      }
      return updated[0]
    }),

  delete: authedProcedure.input(z.uuid()).mutation(async ({ ctx, input }) => {
    const deleted = await db
      .delete(frenchpressBrews)
      .where(
        and(
          eq(frenchpressBrews.id, input),
          eq(frenchpressBrews.userId, ctx.session.user.id),
        ),
      )
      .returning()
    if (deleted.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Brew not found' })
    }
    return deleted[0]
  }),

  // Set (or clear, with brewId null) the dialed-in french press brew for a coffee
  // *within a single method*, scoped to coffeeId + methodId so it never touches
  // another method's dialed-in brew.
  setDialedIn: authedProcedure
    .input(
      z.object({
        coffeeId: z.uuid(),
        methodId: z.uuid(),
        brewId: z.uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db.transaction(async (tx) => {
        await tx
          .update(frenchpressBrews)
          .set({ isDialedIn: false })
          .where(
            and(
              eq(frenchpressBrews.coffeeId, input.coffeeId),
              eq(frenchpressBrews.methodId, input.methodId),
              eq(frenchpressBrews.userId, userId),
              eq(frenchpressBrews.isDialedIn, true),
            ),
          )
        if (input.brewId) {
          await tx
            .update(frenchpressBrews)
            .set({ isDialedIn: true })
            .where(
              and(
                eq(frenchpressBrews.id, input.brewId),
                eq(frenchpressBrews.userId, userId),
              ),
            )
        }
      })
    }),
})
