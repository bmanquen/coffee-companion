import { describe, expect, it } from 'vitest'
import { formOriginsFromCoffee, originsForApi } from './coffee-form'

const ETHIOPIA = '00000000-0000-4000-8000-000000000001'
const COLOMBIA = '00000000-0000-4000-8000-000000000002'
const GUJI = '00000000-0000-4000-8000-000000000003'
const WASHED = '00000000-0000-4000-8000-000000000004'

describe('originsForApi', () => {
  it('drops empty country rows and turns a blank region into null', () => {
    expect(
      originsForApi([
        { countryId: ETHIOPIA, regionId: GUJI, processId: WASHED },
        { countryId: COLOMBIA, regionId: '', processId: '' },
        { countryId: '', regionId: '', processId: '' },
      ]),
    ).toEqual([
      { countryId: ETHIOPIA, regionId: GUJI, processId: WASHED },
      { countryId: COLOMBIA, regionId: null, processId: null },
    ])
  })
})

describe('formOriginsFromCoffee', () => {
  it('keeps one empty row when a coffee has no origins', () => {
    expect(formOriginsFromCoffee([])).toEqual([
      { countryId: '', regionId: '', processId: '' },
    ])
  })

  it('maps a null region and process to empty strings', () => {
    expect(
      formOriginsFromCoffee([
        { countryId: ETHIOPIA, regionId: null, processId: WASHED },
      ]),
    ).toEqual([{ countryId: ETHIOPIA, regionId: '', processId: WASHED }])
    expect(
      formOriginsFromCoffee([{ countryId: ETHIOPIA, regionId: null }]),
    ).toEqual([{ countryId: ETHIOPIA, regionId: '', processId: '' }])
  })
})
