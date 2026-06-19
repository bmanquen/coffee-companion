import { db } from '../db'
import { roasters } from '../db/schema'
import { insertRoasterSchema } from '../db/zod'
import { authedProcedure, createTRPCRouter } from './init'

export const roasterRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.roasters.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertRoasterSchema)
    .mutation(async ({ ctx, input }) => {
      const [roaster] = await db.insert(roasters).values({ ...input, userId: ctx.session.user.id }).returning()
      return roaster
    }),
})
