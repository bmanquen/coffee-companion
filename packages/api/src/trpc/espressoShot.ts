import { and, count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { insertEspressoShotSchema } from '../db/zod'
import { ESPRESSO_DEVICE_TYPE, isEspressoDevice } from '../lib/espresso'
import { authedProcedure, createTRPCRouter } from './init'

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
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.espressoShots.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      with: { coffee: true, grinder: true, brewingDevice: { with: { type: true } } },
    })
  }),

  getRecent: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }))
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.espressoShots.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          with: { coffee: true, grinder: true, brewingDevice: { with: { type: true } } },
          limit: input.limit,
          offset: input.offset,
        }),
        db.select({ total: count() }).from(espressoShots).where(eq(espressoShots.userId, ctx.session.user.id)),
      ])
      return { items, total }
    }),

  // Shots that are the dialed-in reference for their coffee, most recent first.
  // An optional limit caps the result (the dashboard asks for a handful);
  // omitting it returns every dialed-in shot.
  getDialedIn: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.query.espressoShots.findMany({
        where: { userId: ctx.session.user.id, isDialedIn: true },
        orderBy: { createdAt: 'desc' },
        with: {
          coffee: true,
          grinder: true,
          brewingDevice: { with: { type: true } },
        },
        limit: input?.limit,
      })
    }),

  getById: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    const shot = await db.query.espressoShots.findFirst({
      where: { id: input, userId: ctx.session.user.id },
    })
    if (!shot) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Shot not found' })
    }
    return shot
  }),

  create: authedProcedure
    .input(insertEspressoShotSchema)
    .mutation(async ({ ctx, input }) => {
      await assertEspressoDevice(input.brewingDeviceId, ctx.session.user.id)

      const [shot] = await db
        .insert(espressoShots)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return shot
    }),

  update: authedProcedure
    .input(insertEspressoShotSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await assertEspressoDevice(data.brewingDeviceId, ctx.session.user.id)

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
