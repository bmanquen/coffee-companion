import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  brewingDevices,
  brewingDeviceTypes,
  coffeeProcesses,
  coffees,
  countries,
  espressoShots,
  farms,
  greenCoffees,
  grinders,
  regions,
  roasters,
  roastLevels,
  varieties,
} from './schema'

// The brewing device type that espresso shots must use. Seeded as a system
// default (see seed.ts / the brewing_device_types migration).
export const ESPRESSO_DEVICE_TYPE = 'Espresso'

// Whether a brewing device is an Espresso-type device, i.e. valid for pulling
// espresso shots. Pure helper so it can be unit tested without a database.
export const isEspressoDevice = (device: {
  type: { name: string }
}): boolean => device.type.name === ESPRESSO_DEVICE_TYPE

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

// Grinders
export const insertGrinderSchema = createInsertSchema(grinders, {
  name: (schema) => schema.min(1),
  brand: (schema) => schema.min(1),
}).omit({ id: true, userId: true })
export const selectGrinderSchema = createSelectSchema(grinders)
export type InsertGrinder = z.infer<typeof insertGrinderSchema>
export type Grinder = z.infer<typeof selectGrinderSchema>

// Brewing Device Types
export const insertBrewingDeviceTypeSchema = createInsertSchema(
  brewingDeviceTypes,
  {
    name: (schema) => schema.min(1),
  },
)
export const selectBrewingDeviceTypeSchema =
  createSelectSchema(brewingDeviceTypes)
export type InsertBrewingDeviceType = z.infer<
  typeof insertBrewingDeviceTypeSchema
>
export type BrewingDeviceType = z.infer<typeof selectBrewingDeviceTypeSchema>

// Brewing Devices
export const insertBrewingDeviceSchema = createInsertSchema(brewingDevices, {
  name: (schema) => schema.min(1),
  brand: (schema) => schema.min(1),
  typeId: () => z.uuid('Select a type'),
}).omit({ id: true, userId: true })
export const selectBrewingDeviceSchema = createSelectSchema(brewingDevices)
export type InsertBrewingDevice = z.infer<typeof insertBrewingDeviceSchema>
export type BrewingDevice = z.infer<typeof selectBrewingDeviceSchema>

// Accepts an integer or decimal string, e.g. "16", "36.5", "2.5"
const decimalString = () =>
  z.string().regex(/^\d+(\.\d+)?$/, 'Must be a number').nullish()

// Espresso Shots
export const insertEspressoShotSchema = createInsertSchema(espressoShots, {
  dose: decimalString,
  yield: decimalString,
  coffeeId: () => z.uuid('Select a coffee'),
  grinderId: () => z.uuid('Select a grinder'),
  brewingDeviceId: () => z.uuid('Select a brewing device'),
}).omit({
  id: true,
  userId: true,
})
export const selectEspressoShotSchema = createSelectSchema(espressoShots)
export type InsertEspressoShot = z.infer<typeof insertEspressoShotSchema>
export type EspressoShot = z.infer<typeof selectEspressoShotSchema>
