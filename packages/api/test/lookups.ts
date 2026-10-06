import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../src/db/schema'

export type Lookup = {
  table: PgTable
  sqlName: string
  scope: { column: string; parent: PgTable } | null
}

/** Every table in schema.ts with a name_key column. Adding a lookup adds it here. */
export function lookupTables(): Array<Lookup> {
  const lookups: Array<Lookup> = []
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    if (!config.columns.some((column) => column.name === 'name_key')) continue

    const nameKeyUnique = config.uniqueConstraints.find((constraint) =>
      constraint.columns.some((column) => column.name === 'name_key'),
    )
    const scopeColumn = nameKeyUnique?.columns.find(
      (column) => column.name !== 'user_id' && column.name !== 'name_key',
    )
    if (!scopeColumn) {
      lookups.push({ table: value, sqlName: config.name, scope: null })
      continue
    }

    const parent = config.foreignKeys
      .map((fk) => fk.reference())
      .find((ref) => ref.columns.some((column) => column.name === scopeColumn.name))
      ?.foreignTable
    if (!parent) {
      throw new Error(
        `${config.name} names ${scopeColumn.name} as a lookup scope without a foreign key`,
      )
    }
    lookups.push({
      table: value,
      sqlName: config.name,
      scope: { column: scopeColumn.name, parent },
    })
  }
  return lookups
}
