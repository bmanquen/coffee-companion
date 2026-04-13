import { db } from '@/db'
import { espressoShots } from '@/db/schema'
import { insertEspressoShotSchema } from '@/db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const espressoShotRouter = createTRPCRouter({
  getAll: authedProcedure.query(async ({ ctx }) => {
    return db.query.espressoShots.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      with: { coffee: true },
    })
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
