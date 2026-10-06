import { is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '../src/db/schema'
import type { PgColumn } from 'drizzle-orm/pg-core'

export type Lookup = {
  table: PgTable
  id: PgColumn
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

    const id = config.columns.find((column) => column.name === 'id')
    if (!id) {
      throw new Error(`${config.name} is a lookup without an id column`)
    }

    const nameKeyUnique = config.uniqueConstraints.find((constraint) =>
      constraint.columns.some((column) => column.name === 'name_key'),
    )
    const scopeColumn = nameKeyUnique?.columns.find(
      (column) => column.name !== 'user_id' && column.name !== 'name_key',
    )
    if (!scopeColumn) {
      lookups.push({ table: value, id, sqlName: config.name, scope: null })
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
      id,
      sqlName: config.name,
      scope: { column: scopeColumn.name, parent },
    })
  }
  return lookups
}
