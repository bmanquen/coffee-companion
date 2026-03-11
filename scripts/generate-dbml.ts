// scripts/generate-dbml.ts
import { pgGenerate } from 'drizzle-dbml-generator'
import * as schema from '../src/db/schema' // path to your schema file

pgGenerate({
  schema,
  out: './docs/schema.dbml',
  relational: true,
})
