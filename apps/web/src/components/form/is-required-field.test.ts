import {
  insertAeropressBrewSchema,
  insertBrewingDeviceSchema,
  insertCoffeeSchema,
  insertColdBrewBrewSchema,
  insertEspressoShotSchema,
  insertFrenchpressBrewSchema,
  insertGrinderSchema,
  insertPouroverBrewSchema,
} from '@coffee-companion/api/db/zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isRequiredField, isRequiredSchema } from './is-required-field'

describe('isRequiredSchema', () => {
  it('treats a min-length string as required', () => {
    expect(isRequiredSchema(z.string().min(1))).toBe(true)
  })

  it('treats optional and nullish schemas as unmarked', () => {
    expect(isRequiredSchema(z.string().min(1).optional())).toBe(false)
    expect(isRequiredSchema(z.string().nullish())).toBe(false)
  })

  it('ignores values that are not a zod schema', () => {
    expect(isRequiredSchema(undefined)).toBe(false)
    expect(isRequiredSchema(() => undefined)).toBe(false)
  })
})

describe('isRequiredField', () => {
  it('marks espresso relation ids and leaves recipe fields unmarked', () => {
    expect(isRequiredField(insertEspressoShotSchema, 'coffeeId')).toBe(true)
    expect(isRequiredField(insertEspressoShotSchema, 'grinderId')).toBe(true)
    expect(isRequiredField(insertEspressoShotSchema, 'brewingDeviceId')).toBe(
      true,
    )
    expect(isRequiredField(insertEspressoShotSchema, 'roastDate')).toBe(false)
    expect(isRequiredField(insertEspressoShotSchema, 'dose')).toBe(false)
    expect(isRequiredField(insertEspressoShotSchema, 'yield')).toBe(false)
    expect(isRequiredField(insertEspressoShotSchema, 'time')).toBe(false)
    expect(isRequiredField(insertEspressoShotSchema, 'grindSetting')).toBe(
      false,
    )
    expect(isRequiredField(insertEspressoShotSchema, 'notes')).toBe(false)
  })

  it('marks method on pour over, french press, and aeropress', () => {
    expect(isRequiredField(insertPouroverBrewSchema, 'methodId')).toBe(true)
    expect(isRequiredField(insertPouroverBrewSchema, 'coffeeId')).toBe(true)
    expect(isRequiredField(insertPouroverBrewSchema, 'brewTime')).toBe(false)
    expect(isRequiredField(insertFrenchpressBrewSchema, 'methodId')).toBe(true)
    expect(isRequiredField(insertFrenchpressBrewSchema, 'steepTime')).toBe(
      false,
    )
    expect(isRequiredField(insertAeropressBrewSchema, 'methodId')).toBe(true)
    expect(isRequiredField(insertAeropressBrewSchema, 'steepTime')).toBe(false)
  })

  it('leaves cold brew methodless and its recipe fields unmarked', () => {
    expect(isRequiredField(insertColdBrewBrewSchema, 'coffeeId')).toBe(true)
    expect(isRequiredField(insertColdBrewBrewSchema, 'grinderId')).toBe(true)
    expect(isRequiredField(insertColdBrewBrewSchema, 'brewingDeviceId')).toBe(
      true,
    )
    expect(isRequiredField(insertColdBrewBrewSchema, 'steepTime')).toBe(false)
    expect(isRequiredField(insertColdBrewBrewSchema, 'brewEnvironment')).toBe(
      false,
    )
  })

  it('marks coffee name only', () => {
    expect(isRequiredField(insertCoffeeSchema, 'name')).toBe(true)
    expect(isRequiredField(insertCoffeeSchema, 'roasterId')).toBe(false)
    expect(isRequiredField(insertCoffeeSchema, 'notes')).toBe(false)
  })

  it('marks grinder name and brand', () => {
    expect(isRequiredField(insertGrinderSchema, 'name')).toBe(true)
    expect(isRequiredField(insertGrinderSchema, 'brand')).toBe(true)
  })

  it('marks brewing device name, brand, and type', () => {
    expect(isRequiredField(insertBrewingDeviceSchema, 'name')).toBe(true)
    expect(isRequiredField(insertBrewingDeviceSchema, 'brand')).toBe(true)
    expect(isRequiredField(insertBrewingDeviceSchema, 'typeId')).toBe(true)
  })
})
