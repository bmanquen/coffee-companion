import { insertCountrySchema } from '../db/zod'
import { db } from '../db'
import { countries } from '../db/schema'
import { authedProcedure, createTRPCRouter } from './init'

export const countryRouter = createTRPCRouter({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.query.countries.findMany({
      where: {
        OR: [{ userId: { isNull: true } }, { userId: ctx.session.user.id }],
      },
      orderBy: { name: 'asc' },
    })
  }),

  create: authedProcedure
    .input(insertCountrySchema)
    .mutation(async ({ ctx, input }) => {
      const [country] = await db.insert(countries).values({ ...input, userId: ctx.session.user.id }).returning()
      return country
    }),
})
