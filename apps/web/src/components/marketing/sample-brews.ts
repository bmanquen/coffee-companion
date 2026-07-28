import type { EspressoShotWithRelations } from '@/types'

// Sample Shots for the marketing hero. Typed against the same shape the real
// espresso feed renders, so if that shape changes this stops compiling rather
// than quietly showing something the app no longer produces.
//
// Deliberately separate from src/test/factories.ts: these exist to be read by
// strangers, so the numbers have to tell a believable dial-in story rather than
// just satisfy an assertion — three Shots walking the grind finer as the yield
// tightens and the time stretches, the last one marked Dialed-in.
//
// Notes are left null: the hero renders no expander, so there is nowhere for
// them to show, and unreachable copy only rots.
const createdAt = new Date('2026-03-14T07:30:00.000Z')
const updatedAt = createdAt

const grinder = {
  id: 'sample-grinder',
  userId: 'sample',
  name: 'Niche Zero',
  brand: 'Niche',
  createdAt,
  updatedAt,
}

const brewingDevice = {
  id: 'sample-device',
  userId: 'sample',
  name: 'Linea Mini',
  brand: 'La Marzocco',
  typeId: 'sample-device-type',
  createdAt,
  updatedAt,
  type: {
    id: 'sample-device-type',
    userId: null,
    name: 'Espresso Machine',
    createdAt,
    updatedAt,
  },
}

const coffee = {
  id: 'sample-coffee',
  userId: 'sample',
  name: 'Ethiopia Guji',
  roasterId: null,
  roastLevelId: null,
  countryId: null,
  regionId: null,
  processId: null,
  notes: null,
  isActive: true,
  createdAt,
  updatedAt,
}

function sampleShot(
  overrides: Partial<EspressoShotWithRelations>,
): EspressoShotWithRelations {
  return {
    id: 'sample-shot',
    userId: 'sample',
    coffeeId: coffee.id,
    grinderId: grinder.id,
    brewingDeviceId: brewingDevice.id,
    roastDate: '2026-03-07',
    isDialedIn: false,
    dose: '18',
    yield: '36',
    time: 28,
    grindSetting: '12',
    notes: null,
    createdAt,
    updatedAt,
    coffee,
    grinder,
    brewingDevice,
    ...overrides,
  }
}

export const sampleShots: Array<EspressoShotWithRelations> = [
  sampleShot({
    id: 'sample-shot-3',
    grindSetting: '11',
    dose: '18',
    yield: '37',
    time: 29,
    isDialedIn: true,
  }),
  sampleShot({
    id: 'sample-shot-2',
    grindSetting: '13',
    dose: '18',
    yield: '41',
    time: 24,
  }),
  sampleShot({
    id: 'sample-shot-1',
    grindSetting: '15',
    dose: '18',
    yield: '44',
    time: 21,
  }),
]
