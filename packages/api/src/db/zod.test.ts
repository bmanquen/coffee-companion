import { describe, expect, it } from 'vitest'
import {
  insertBrewingDeviceSchema,
  insertCoffeeSchema,
  insertColdBrewBrewSchema,
  insertEspressoShotSchema,
  insertGrinderSchema,
  insertPouroverBrewSchema,
} from './zod'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('insertEspressoShotSchema', () => {
  const valid = {
    coffeeId: uuid,
    grinderId: uuid,
    brewingDeviceId: uuid,
    dose: '18',
    yield: '36.5',
    time: 30,
    grindSetting: '1.5',
  }

  it('accepts integer and decimal dose/yield strings', () => {
    expect(insertEspressoShotSchema.safeParse(valid).success).toBe(true)
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, dose: '2.5', yield: '5' })
        .success,
    ).toBe(true)
  })

  it('accepts a numeric string for time', () => {
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, time: '28' }).success,
    ).toBe(true)
  })

  it('rejects null/omitted recipe fields, but not roast date or notes', () => {
    expect(
      insertEspressoShotSchema.safeParse({
        ...valid,
        dose: null,
        yield: undefined,
      }).success,
    ).toBe(false)
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, time: null }).success,
    ).toBe(false)
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, grindSetting: '' })
        .success,
    ).toBe(false)
    expect(
      insertEspressoShotSchema.safeParse({
        ...valid,
        roastDate: null,
        notes: null,
      }).success,
    ).toBe(true)
  })

  it('rejects non-numeric dose strings', () => {
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, dose: 'abc' }).success,
    ).toBe(false)
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, dose: '' }).success,
    ).toBe(false)
  })

  it('rejects non-uuid relation ids', () => {
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, coffeeId: 'not-a-uuid' })
        .success,
    ).toBe(false)
  })
})

describe('insertCoffeeSchema', () => {
  it('requires name, roaster, and roast level', () => {
    expect(
      insertCoffeeSchema.safeParse({
        name: 'Ethiopia Guji',
        roasterId: uuid,
        roastLevelId: uuid,
      }).success,
    ).toBe(true)
    expect(
      insertCoffeeSchema.safeParse({ name: 'Ethiopia Guji' }).success,
    ).toBe(false)
    expect(
      insertCoffeeSchema.safeParse({
        name: 'Ethiopia Guji',
        roasterId: uuid,
      }).success,
    ).toBe(false)
    expect(
      insertCoffeeSchema.safeParse({
        name: '',
        roasterId: uuid,
        roastLevelId: uuid,
      }).success,
    ).toBe(false)
  })
})

describe('insertPouroverBrewSchema', () => {
  const valid = {
    coffeeId: uuid,
    grinderId: uuid,
    brewingDeviceId: uuid,
    methodId: uuid,
    dose: '18',
    water: '300',
    brewTime: 165,
    waterTemp: 94,
    grindSetting: '22',
  }

  it('requires the recipe and leaves roast date and notes optional', () => {
    expect(insertPouroverBrewSchema.safeParse(valid).success).toBe(true)
    expect(
      insertPouroverBrewSchema.safeParse({
        ...valid,
        roastDate: null,
        notes: undefined,
      }).success,
    ).toBe(true)
    expect(
      insertPouroverBrewSchema.safeParse({ ...valid, brewTime: null }).success,
    ).toBe(false)
  })
})

describe('insertColdBrewBrewSchema', () => {
  const valid = {
    coffeeId: uuid,
    grinderId: uuid,
    brewingDeviceId: uuid,
    dose: '50',
    water: '500',
    steepTime: 1080,
    brewEnvironment: 'Fridge',
    grindSetting: 'coarse',
  }

  it('requires brew environment', () => {
    expect(insertColdBrewBrewSchema.safeParse(valid).success).toBe(true)
    expect(
      insertColdBrewBrewSchema.safeParse({
        ...valid,
        brewEnvironment: null,
      }).success,
    ).toBe(false)
  })
})

describe('insertGrinderSchema', () => {
  it('requires non-empty name and brand', () => {
    expect(
      insertGrinderSchema.safeParse({ name: 'Niche Zero', brand: 'Niche' })
        .success,
    ).toBe(true)
    expect(insertGrinderSchema.safeParse({ name: '', brand: 'Niche' }).success).toBe(
      false,
    )
    expect(insertGrinderSchema.safeParse({ name: 'Niche Zero', brand: '' }).success).toBe(
      false,
    )
  })
})

describe('insertBrewingDeviceSchema', () => {
  it('requires a uuid typeId and non-empty name/brand', () => {
    expect(
      insertBrewingDeviceSchema.safeParse({
        name: 'Linea Mini',
        brand: 'La Marzocco',
        typeId: uuid,
      }).success,
    ).toBe(true)
    expect(
      insertBrewingDeviceSchema.safeParse({
        name: 'Linea Mini',
        brand: 'La Marzocco',
        typeId: 'not-a-uuid',
      }).success,
    ).toBe(false)
  })
})
