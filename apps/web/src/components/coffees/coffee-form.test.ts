import { describe, expect, it } from 'vitest'
import { formOriginsFromCoffee, originsForApi } from './coffee-form'

const ETHIOPIA = '00000000-0000-4000-8000-000000000001'
const COLOMBIA = '00000000-0000-4000-8000-000000000002'
const GUJI = '00000000-0000-4000-8000-000000000003'

describe('originsForApi', () => {
  it('drops empty country rows and turns a blank region into null', () => {
    expect(
      originsForApi([
        { countryId: ETHIOPIA, regionId: GUJI },
        { countryId: COLOMBIA, regionId: '' },
        { countryId: '', regionId: '' },
      ]),
    ).toEqual([
      { countryId: ETHIOPIA, regionId: GUJI },
      { countryId: COLOMBIA, regionId: null },
    ])
  })
})

describe('formOriginsFromCoffee', () => {
  it('keeps one empty row when a coffee has no origins', () => {
    expect(formOriginsFromCoffee([])).toEqual([
      { countryId: '', regionId: '' },
    ])
  })

  it('maps a null region to an empty string', () => {
    expect(
      formOriginsFromCoffee([{ countryId: ETHIOPIA, regionId: null }]),
    ).toEqual([{ countryId: ETHIOPIA, regionId: '' }])
  })
})
