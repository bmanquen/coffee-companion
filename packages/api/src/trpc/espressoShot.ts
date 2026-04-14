import { count, eq } from 'drizzle-orm'
import { db } from '@/db'
import { espressoShots } from '@/db/schema'
import { insertEspressoShotSchema } from '@/db/zod'
import z from 'zod'
import { authedProcedure, createTRPCRouter } from './init'

export const espressoShotRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.espressoShots.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      with: { coffee: true },
    })
  }),

  getRecent: authedProcedure
    .input(z.object({ limit: z.number().min(1).max(50), offset: z.number().min(0) }))
    .query(async ({ ctx, input }) => {
      const [items, [{ total }]] = await Promise.all([
        db.query.espressoShots.findMany({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: 'desc' },
          with: { coffee: true },
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
      const [shot] = await db
        .insert(espressoShots)
        .values({ ...input, userId: ctx.session.user.id })
        .returning()
      return shot
    }),
})
