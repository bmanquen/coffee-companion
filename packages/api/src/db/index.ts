import { drizzle } from 'drizzle-orm/node-postgres'
import './load-env'
import { relations } from './schema'

export const db = drizzle({
  connection: { connectionString: process.env.DATABASE_URL! },
  relations,
})
