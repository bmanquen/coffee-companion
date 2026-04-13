import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  coffeeProcesses,
  coffees,
  countries,
  espressoShots,
  farms,
  greenCoffees,
  regions,
  roasters,
  roastLevels,
  varieties,
} from './schema'

// Countries
export const insertCountrySchema = createInsertSchema(countries, {
  name: (schema) => schema.min(1),
})
export const selectCountrySchema = createSelectSchema(countries)
export type InsertCountry = z.infer<typeof insertCountrySchema>
export type Country = z.infer<typeof selectCountrySchema>

// Regions
export const insertRegionSchema = createInsertSchema(regions, {
  name: (schema) => schema.min(1),
})
export const selectRegionSchema = createSelectSchema(regions)
export type InsertRegion = z.infer<typeof insertRegionSchema>
export type Region = z.infer<typeof selectRegionSchema>

// Roasters
export const insertRoasterSchema = createInsertSchema(roasters, {
  name: (schema) => schema.min(1),
})
export const selectRoasterSchema = createSelectSchema(roasters)
export type InsertRoaster = z.infer<typeof insertRoasterSchema>
export type Roaster = z.infer<typeof selectRoasterSchema>

// Roast Levels
export const insertRoastLevelSchema = createInsertSchema(roastLevels, {
  name: (schema) => schema.min(1),
})
export const selectRoastLevelSchema = createSelectSchema(roastLevels)
export type InsertRoastLevel = z.infer<typeof insertRoastLevelSchema>
export type RoastLevel = z.infer<typeof selectRoastLevelSchema>

// Farms
export const insertFarmSchema = createInsertSchema(farms, {
  name: (schema) => schema.min(1),
})
export const selectFarmSchema = createSelectSchema(farms)
export type InsertFarm = z.infer<typeof insertFarmSchema>
export type Farm = z.infer<typeof selectFarmSchema>

// Coffee Processes
export const insertCoffeeProcessSchema = createInsertSchema(coffeeProcesses, {
  name: (schema) => schema.min(1),
})
export const selectCoffeeProcessSchema = createSelectSchema(coffeeProcesses)
export type InsertCoffeeProcess = z.infer<typeof insertCoffeeProcessSchema>
export type CoffeeProcess = z.infer<typeof selectCoffeeProcessSchema>

// Varieties
export const insertVarietySchema = createInsertSchema(varieties, {
  name: (schema) => schema.min(1),
})
export const selectVarietySchema = createSelectSchema(varieties)
export type InsertVariety = z.infer<typeof insertVarietySchema>
export type Variety = z.infer<typeof selectVarietySchema>

// Green Coffees
export const insertGreenCoffeeSchema = createInsertSchema(greenCoffees)
export const selectGreenCoffeeSchema = createSelectSchema(greenCoffees)
export type InsertGreenCoffee = z.infer<typeof insertGreenCoffeeSchema>
export type GreenCoffee = z.infer<typeof selectGreenCoffeeSchema>

// Coffees
export const insertCoffeeSchema = createInsertSchema(coffees, {
  name: (schema) => schema.min(1),
}).omit({ id: true, userId: true })
export const selectCoffeeSchema = createSelectSchema(coffees)
export type InsertCoffee = z.infer<typeof insertCoffeeSchema>
export type Coffee = z.infer<typeof selectCoffeeSchema>

// Espresso Shots
export const insertEspressoShotSchema = createInsertSchema(espressoShots).omit({
  id: true,
  userId: true,
})
export const selectEspressoShotSchema = createSelectSchema(espressoShots)
export type InsertEspressoShot = z.infer<typeof insertEspressoShotSchema>
export type EspressoShot = z.infer<typeof selectEspressoShotSchema>
