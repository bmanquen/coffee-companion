import { z } from 'zod'

import { db } from '../db'
import { countries } from '../db/schema'
import { createTRPCRouter, publicProcedure } from './init'

export const countryRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return db.query.countries.findMany({
      orderBy: (countries, { asc }) => [asc(countries.name)],
    })
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const [country] = await db.insert(countries).values(input).returning()
      return country
    }),
})
