import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DRIZZLE = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
const THIS_MIGRATION = 'lookup_name_uniqueness'

const LOOKUP_TABLES = [
  'aeropress_methods',
  'brewing_device_types',
  'coffee_processes',
  'countries',
  'farms',
  'frenchpress_methods',
  'pourover_methods',
  'regions',
  'roast_levels',
  'roasters',
  'varieties',
]

const insertIntoLookup = new RegExp(
  `INSERT\\s+INTO\\s+"?(?:${LOOKUP_TABLES.join('|')})"?(?:\\s|\\()`,
  'i',
)

describe('migrations after lookup name uniqueness', () => {
  it('fold any lookup insert so user copies merge into the new shared default', () => {
    const folders = readdirSync(DRIZZLE)
      .filter((name) => /^\d{14}_/.test(name))
      .sort()
    const here = folders.findIndex((name) => name.endsWith(`_${THIS_MIGRATION}`))
    expect(here).toBeGreaterThanOrEqual(0)

    const missing = folders.slice(here + 1).filter((folder) => {
      const sql = readFileSync(join(DRIZZLE, folder, 'migration.sql'), 'utf8')
      return insertIntoLookup.test(sql) && !sql.includes('lookup_fold()')
    })

    expect(missing).toEqual([])
  })
})
