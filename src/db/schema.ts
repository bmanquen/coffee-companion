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
import { user } from './auth-schema'

export * from './auth-schema'

const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
}

export const greenCoffees = pgTable(
  'green_coffees',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    country: text(),
    region: text(),
    farm: text(),
    producer: text(),
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
    index('green_coffees_user_country_idx').on(table.country, table.userId),
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
    roasterName: text('roaster_name'),
    roastLevel: text('roast_level'),
    roastDate: date(),
    country: text(),
    region: text(),
    processId: uuid('process_id').references(() => coffeeProcesses.id),
    notes: text(),
    isActive: boolean('is_active'),
    ...timestamps,
  },
  (table) => [
    index('coffees_user_idx').on(table.userId),
    index('coffees_user_name_idx').on(table.name, table.userId),
    index('coffees_user_process_id_idx').on(table.processId, table.userId),
    index('coffess_user_country_idx').on(table.country, table.userId),
  ],
)

export const varieties = pgTable(
  'varieties',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    ...timestamps,
  },
  (table) => [uniqueIndex('varieties_name_idx').on(table.name)],
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
    name: text().notNull().unique(),
    ...timestamps,
  },
  (table) => [uniqueIndex('coffee_processes_name_idx').on(table.name)],
)
