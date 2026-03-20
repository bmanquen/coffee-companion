import { insertCountrySchema } from '@/db/zod'
import { db } from '../db'
import { countries } from '../db/schema'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const countryRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return db.query.countries.findMany({
      orderBy: (countries, { asc }) => [asc(countries.name)],
    })
  }),

  create: authedProcedure
    .input(insertCountrySchema)
    .mutation(async ({ input }) => {
      const [country] = await db.insert(countries).values(input).returning()
      return country
    }),
})
