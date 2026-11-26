import z from 'zod'
import { db } from '../db'
import { insertRegionSchema } from '../db/zod'
import { regions } from '../db/schema'
import { authedProcedure, createTRPCRouter } from './init'

export const regionRouter = createTRPCRouter({
  getAll: authedProcedure.input(z.uuid()).query(async ({ ctx, input }) => {
    return db.query.regions.findMany({
      where: {
        countryId: input,
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
    })
  }),

  create: authedProcedure
    .input(insertRegionSchema)
    .mutation(async ({ ctx, input }) => {
      const [region] = await db.insert(regions).values({ ...input, userId: ctx.session.user.id }).returning()
      return region
    }),
})
