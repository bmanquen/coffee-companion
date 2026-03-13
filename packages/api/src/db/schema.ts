import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  date,
  boolean,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { user, session, account } from './auth-schema'

export * from './auth-schema'

const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
}

export const countries = pgTable(
  'countries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('countries_system_name_idx')
      .on(table.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex('countries_user_name_idx')
      .on(table.name, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const regions = pgTable(
  'regions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    countryId: uuid('country_id').references(() => countries.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('regions_system_name_idx')
      .on(table.name, table.countryId)
      .where(sql`user_id IS NULL`),
    uniqueIndex('regions_user_name_idx')
      .on(table.name, table.countryId, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const roastLevels = pgTable(
  'roast_levels',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('roast_levels_system_name_idx')
      .on(table.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex('roast_levels_user_name_idx')
      .on(table.name, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const farms = pgTable(
  'farms',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    regionId: uuid('region_id').references(() => regions.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('farms_system_name_idx')
      .on(table.name, table.regionId)
      .where(sql`user_id IS NULL`),
    uniqueIndex('farms_user_name_idx')
      .on(table.name, table.regionId, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const greenCoffees = pgTable(
  'green_coffees',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    countryId: uuid('country_id').references(() => countries.id),
    regionId: uuid('region_id').references(() => regions.id),
    farmId: uuid('farm_id').references(() => farms.id),
    processId: uuid('process_id').references(() => coffeeProcesses.id),
    altitude: integer(),
    notes: text(),
    ...timestamps,
  },
  (table) => [
    index('green_coffees_user_idx').on(table.userId),
    index('green_coffees_user_name_idx').on(table.name, table.userId),
    index('green_coffees_user_process_id_idx').on(
      table.processId,
      table.userId,
    ),
    index('green_coffees_user_country_idx').on(table.countryId, table.userId),
  ],
)

export const roasters = pgTable(
  'roasters',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('roasters_system_name_idx')
      .on(table.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex('roasters_user_name_idx')
      .on(table.name, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const coffees = pgTable(
  'coffees',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    roasterId: uuid('roaster_id').references(() => roasters.id),
    roastLevelId: uuid('roast_level_id').references(() => roastLevels.id),
    roastDate: date(),
    countryId: uuid('country_id').references(() => countries.id),
    regionId: uuid('region_id').references(() => regions.id),
    processId: uuid('process_id').references(() => coffeeProcesses.id),
    notes: text(),
    isActive: boolean('is_active'),
    ...timestamps,
  },
  (table) => [
    index('coffees_user_idx').on(table.userId),
    index('coffees_user_name_idx').on(table.name, table.userId),
    index('coffees_user_process_id_idx').on(table.processId, table.userId),
    index('coffees_user_country_idx').on(table.countryId, table.userId),
  ],
)

export const varieties = pgTable(
  'varieties',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('varieties_system_name_idx')
      .on(table.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex('varieties_user_name_idx')
      .on(table.name, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

export const coffeesVarieties = pgTable(
  'coffees_varieties',
  {
    varietyId: uuid('variety_id')
      .references(() => varieties.id, { onDelete: 'cascade' })
      .notNull(),
    coffeeId: uuid('coffee_id')
      .references(() => coffees.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.coffeeId, table.varietyId],
    }),
  ],
)

export const greenCoffeesVarieties = pgTable(
  'green_coffees_varieties',
  {
    varietyId: uuid('variety_id')
      .references(() => varieties.id, { onDelete: 'cascade' })
      .notNull(),
    greenCoffeeId: uuid('green_coffee_id')
      .references(() => greenCoffees.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.greenCoffeeId, table.varietyId],
    }),
  ],
)

export const coffeeProcesses = pgTable(
  'coffee_processes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('coffee_processes_system_name_idx')
      .on(table.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex('coffee_processes_user_name_idx')
      .on(table.name, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
)

// Relations

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  greenCoffees: many(greenCoffees),
  coffees: many(coffees),
  countries: many(countries),
  regions: many(regions),
  farms: many(farms),
  roasters: many(roasters),
  roastLevels: many(roastLevels),
  coffeeProcesses: many(coffeeProcesses),
  varieties: many(varieties),
}))

export const countriesRelations = relations(countries, ({ one, many }) => ({
  user: one(user, {
    fields: [countries.userId],
    references: [user.id],
  }),
  regions: many(regions),
  greenCoffees: many(greenCoffees),
  coffees: many(coffees),
}))

export const regionsRelations = relations(regions, ({ one, many }) => ({
  user: one(user, {
    fields: [regions.userId],
    references: [user.id],
  }),
  country: one(countries, {
    fields: [regions.countryId],
    references: [countries.id],
  }),
  farms: many(farms),
  greenCoffees: many(greenCoffees),
  coffees: many(coffees),
}))

export const farmsRelations = relations(farms, ({ one, many }) => ({
  user: one(user, {
    fields: [farms.userId],
    references: [user.id],
  }),
  region: one(regions, {
    fields: [farms.regionId],
    references: [regions.id],
  }),
  greenCoffees: many(greenCoffees),
}))

export const roastersRelations = relations(roasters, ({ one, many }) => ({
  user: one(user, {
    fields: [roasters.userId],
    references: [user.id],
  }),
  coffees: many(coffees),
}))

export const roastLevelsRelations = relations(roastLevels, ({ one, many }) => ({
  user: one(user, {
    fields: [roastLevels.userId],
    references: [user.id],
  }),
  coffees: many(coffees),
}))

export const coffeeProcessesRelations = relations(coffeeProcesses, ({ one, many }) => ({
  user: one(user, {
    fields: [coffeeProcesses.userId],
    references: [user.id],
  }),
  greenCoffees: many(greenCoffees),
  coffees: many(coffees),
}))

export const varietiesRelations = relations(varieties, ({ one, many }) => ({
  user: one(user, {
    fields: [varieties.userId],
    references: [user.id],
  }),
  coffeesVarieties: many(coffeesVarieties),
  greenCoffeesVarieties: many(greenCoffeesVarieties),
}))

export const greenCoffeesRelations = relations(greenCoffees, ({ one, many }) => ({
  user: one(user, {
    fields: [greenCoffees.userId],
    references: [user.id],
  }),
  country: one(countries, {
    fields: [greenCoffees.countryId],
    references: [countries.id],
  }),
  region: one(regions, {
    fields: [greenCoffees.regionId],
    references: [regions.id],
  }),
  farm: one(farms, {
    fields: [greenCoffees.farmId],
    references: [farms.id],
  }),
  process: one(coffeeProcesses, {
    fields: [greenCoffees.processId],
    references: [coffeeProcesses.id],
  }),
  greenCoffeesVarieties: many(greenCoffeesVarieties),
}))

export const coffeesRelations = relations(coffees, ({ one, many }) => ({
  user: one(user, {
    fields: [coffees.userId],
    references: [user.id],
  }),
  roaster: one(roasters, {
    fields: [coffees.roasterId],
    references: [roasters.id],
  }),
  country: one(countries, {
    fields: [coffees.countryId],
    references: [countries.id],
  }),
  region: one(regions, {
    fields: [coffees.regionId],
    references: [regions.id],
  }),
  roastLevel: one(roastLevels, {
    fields: [coffees.roastLevelId],
    references: [roastLevels.id],
  }),
  process: one(coffeeProcesses, {
    fields: [coffees.processId],
    references: [coffeeProcesses.id],
  }),
  coffeesVarieties: many(coffeesVarieties),
}))

export const coffeesVarietiesRelations = relations(coffeesVarieties, ({ one }) => ({
  coffee: one(coffees, {
    fields: [coffeesVarieties.coffeeId],
    references: [coffees.id],
  }),
  variety: one(varieties, {
    fields: [coffeesVarieties.varietyId],
    references: [varieties.id],
  }),
}))

export const greenCoffeesVarietiesRelations = relations(greenCoffeesVarieties, ({ one }) => ({
  greenCoffee: one(greenCoffees, {
    fields: [greenCoffeesVarieties.greenCoffeeId],
    references: [greenCoffees.id],
  }),
  variety: one(varieties, {
    fields: [greenCoffeesVarieties.varietyId],
    references: [varieties.id],
  }),
}))
