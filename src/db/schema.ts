import {
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core'

export * from './auth-schema'

export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const greenCoffees = pgTable('green_coffees', {
  id: uuid(),
  name: text().notNull(),
  country: text(),
  region: text(),
  farm: text(),
  producer: text(),
  variety: text(),
  process: text(),
  altitude: integer(),
  notes: text(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
