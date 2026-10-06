import { describe, expect, it } from 'vitest'
import {
  lookupTables,
  lookupUniqueConstraintNames,
} from '../../test/lookups'

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
    expect(lookupUniqueConstraintNames().sort()).toEqual([
      'aeropress_methods_user_id_name_key_unique',
      'brewing_device_types_user_id_name_key_unique',
      'coffee_processes_user_id_name_key_unique',
      'countries_user_id_name_key_unique',
      'farms_user_id_name_key_region_id_unique',
      'frenchpress_methods_user_id_name_key_unique',
      'pourover_methods_user_id_name_key_unique',
      'regions_user_id_name_key_country_id_unique',
      'roast_levels_user_id_name_key_unique',
      'roasters_user_id_name_key_unique',
      'varieties_user_id_name_key_unique',
    ])
  })
})
