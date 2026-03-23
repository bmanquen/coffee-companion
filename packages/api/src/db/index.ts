import { config } from 'dotenv'

import { drizzle } from 'drizzle-orm/node-postgres'

import { relations } from './schema'

config({ path: '.env.local' })
config({ path: '.env' })

export const db = drizzle({
  connection: { connectionString: process.env.DATABASE_URL! },
  relations,
})
