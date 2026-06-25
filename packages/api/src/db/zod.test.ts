import { describe, expect, it } from 'vitest'
import {
  ESPRESSO_DEVICE_TYPE,
  insertBrewingDeviceSchema,
  insertEspressoShotSchema,
  insertGrinderSchema,
  isEspressoDevice,
} from './zod'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('insertEspressoShotSchema', () => {
  const valid = {
    coffeeId: uuid,
    grinderId: uuid,
    brewingDeviceId: uuid,
    dose: '18',
    yield: '36.5',
  }

  it('accepts integer and decimal dose/yield strings', () => {
    expect(insertEspressoShotSchema.safeParse(valid).success).toBe(true)
    expect(
      insertEspressoShotSchema.safeParse({ ...valid, dose: '2.5', yield: '5' })
        .success,
    ).toBe(true)
  })

  it('accepts null/omitted dose and yield', () => {
    expect(
      insertEspressoShotSchema.safeParse({
        ...valid,
        dose: null,
        yield: undefined,
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

describe('isEspressoDevice', () => {
  it('is true only for the espresso device type', () => {
    expect(isEspressoDevice({ type: { name: ESPRESSO_DEVICE_TYPE } })).toBe(true)
    expect(isEspressoDevice({ type: { name: 'Pour Over' } })).toBe(false)
  })
})
