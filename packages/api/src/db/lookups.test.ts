import { describe, expect, it } from 'vitest'
import { lookupTables } from '../../test/lookups'

describe('lookupTables', () => {
  it('finds every lookup and the parent scope of regions and farms', () => {
    const lookups = lookupTables()
    expect(lookups.map((lookup) => lookup.sqlName).sort()).toEqual([
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
    ])
    expect(lookups.find((lookup) => lookup.sqlName === 'regions')?.scope).toEqual(
      expect.objectContaining({ column: 'country_id' }),
    )
    expect(lookups.find((lookup) => lookup.sqlName === 'farms')?.scope).toEqual(
      expect.objectContaining({ column: 'region_id' }),
    )
    expect(
      lookups.filter((lookup) => lookup.scope != null).map((lookup) => lookup.sqlName),
    ).toEqual(['regions', 'farms'])
  })
})
