import { count, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import {
  ESPRESSO_DEVICE_TYPE,
  insertEspressoShotSchema,
  isEspressoDevice,
} from '../db/zod'
import z from 'zod'
import { authedProcedure, createTRPCRouter } from './init'

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

  create: authedProcedure
    .input(insertEspressoShotSchema)
    .mutation(async ({ ctx, input }) => {
      // Espresso shots must be brewed on an Espresso-type device.
      const device = await db.query.brewingDevices.findFirst({
        where: { id: input.brewingDeviceId, userId: ctx.session.user.id },
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

      const [shot] = await db
        .insert(espressoShots)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return shot
    }),
})
