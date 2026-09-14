import { z } from 'zod'
import { insertCoffeeSchema } from '@coffee-companion/api/db/zod'

export const emptyOrigin = { countryId: '', regionId: '' }

export const coffeeFormSchema = insertCoffeeSchema.extend({
  origins: z.array(
    z.object({
      countryId: z.string(),
      regionId: z.string(),
    }),
  ),
})

export type CoffeeFormValues = z.input<typeof coffeeFormSchema>

export function originsForApi(
  origins: Array<{ countryId: string; regionId: string }>,
) {
  return origins
    .filter((origin) => origin.countryId !== '')
    .map((origin) => ({
      countryId: origin.countryId,
      regionId: origin.regionId === '' ? null : origin.regionId,
    }))
}

export function formOriginsFromCoffee(
  origins: Array<{ countryId: string; regionId: string | null }>,
) {
  if (origins.length === 0) return [{ ...emptyOrigin }]
  return origins.map((origin) => ({
    countryId: origin.countryId,
    regionId: origin.regionId ?? '',
  }))
}
