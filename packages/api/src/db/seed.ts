import { db } from './index'
import {
  greenCoffees,
  coffeeProcesses,
  varieties,
  greenCoffeesVarieties,
  countries,
  regions,
  farms,
  roasters,
  roastLevels,
  user,
} from './schema'

const processesData = [
  { name: 'Washed' },
  { name: 'Natural' },
  { name: 'Honey' },
  { name: 'Wet-Hulled' },
]

const varietiesData = [
  { name: 'Heirloom' },
  { name: 'Caturra' },
  { name: 'SL28' },
  { name: 'SL34' },
  { name: 'Bourbon' },
  { name: 'Yellow Bourbon' },
  { name: 'Geisha' },
  { name: 'Catuai' },
  { name: 'Typica' },
]

const countriesData = [
  { name: 'Ethiopia' },
  { name: 'Colombia' },
  { name: 'Kenya' },
  { name: 'Guatemala' },
  { name: 'Brazil' },
  { name: 'Panama' },
  { name: 'Costa Rica' },
  { name: 'Indonesia' },
]

const roastersData = [
  { name: 'Onyx Coffee Lab' },
  { name: 'George Howell Coffee' },
  { name: 'Intelligentsia' },
  { name: 'Counter Culture' },
  { name: 'Heart Coffee Roasters' },
]

const roastLevelsData = [
  { name: 'Light' },
  { name: 'Medium-Light' },
  { name: 'Medium' },
  { name: 'Medium-Dark' },
  { name: 'Dark' },
]

const greenCoffeesData = [
  {
    name: 'Ethiopian Yirgacheffe',
    country: 'Ethiopia',
    region: 'Yirgacheffe',
    farm: 'Kochere Washing Station',
    process: 'Washed',
    altitude: 1950,
    notes: 'Floral, bergamot, lemon, tea-like body',
    varieties: ['Heirloom'],
  },
  {
    name: 'Colombian Huila',
    country: 'Colombia',
    region: 'Huila',
    farm: 'Finca El Paraiso',
    process: 'Washed',
    altitude: 1800,
    notes: 'Caramel, red apple, citrus acidity',
    varieties: ['Caturra'],
  },
  {
    name: 'Kenyan AA Nyeri',
    country: 'Kenya',
    region: 'Nyeri',
    farm: 'Othaya Cooperative',
    process: 'Washed',
    altitude: 1700,
    notes: 'Blackcurrant, tomato, bright acidity',
    varieties: ['SL28', 'SL34'],
  },
  {
    name: 'Guatemala Antigua',
    country: 'Guatemala',
    region: 'Antigua',
    farm: 'Finca Filadelfia',
    process: 'Washed',
    altitude: 1500,
    notes: 'Chocolate, nuts, mild citrus',
    varieties: ['Bourbon'],
  },
  {
    name: 'Brazilian Cerrado',
    country: 'Brazil',
    region: 'Cerrado Mineiro',
    farm: 'Fazenda Santa Ines',
    process: 'Natural',
    altitude: 1100,
    notes: 'Nuts, chocolate, low acidity, full body',
    varieties: ['Yellow Bourbon'],
  },
  {
    name: 'Panama Geisha',
    country: 'Panama',
    region: 'Boquete',
    farm: 'Hacienda La Esmeralda',
    process: 'Washed',
    altitude: 1600,
    notes: 'Jasmine, tropical fruit, bergamot, silky body',
    varieties: ['Geisha'],
  },
  {
    name: 'Costa Rica Tarrazu',
    country: 'Costa Rica',
    region: 'Tarrazu',
    farm: 'Finca Don Mayo',
    process: 'Honey',
    altitude: 1650,
    notes: 'Honey, stone fruit, brown sugar',
    varieties: ['Catuai'],
  },
  {
    name: 'Sumatra Mandheling',
    country: 'Indonesia',
    region: 'North Sumatra',
    farm: 'Various Smallholders',
    process: 'Wet-Hulled',
    altitude: 1300,
    notes: 'Earthy, herbal, full body, low acidity',
    varieties: ['Typica'],
  },
]

const farmsData = [
  { name: 'Kochere Washing Station', region: 'Yirgacheffe' },
  { name: 'Finca El Paraiso', region: 'Huila' },
  { name: 'Othaya Cooperative', region: 'Nyeri' },
  { name: 'Finca Filadelfia', region: 'Antigua' },
  { name: 'Fazenda Santa Ines', region: 'Cerrado Mineiro' },
  { name: 'Hacienda La Esmeralda', region: 'Boquete' },
  { name: 'Finca Don Mayo', region: 'Tarrazu' },
  { name: 'Various Smallholders', region: 'North Sumatra' },
]

const regionsData = [
  { name: 'Yirgacheffe', country: 'Ethiopia' },
  { name: 'Huila', country: 'Colombia' },
  { name: 'Nyeri', country: 'Kenya' },
  { name: 'Antigua', country: 'Guatemala' },
  { name: 'Cerrado Mineiro', country: 'Brazil' },
  { name: 'Boquete', country: 'Panama' },
  { name: 'Tarrazu', country: 'Costa Rica' },
  { name: 'North Sumatra', country: 'Indonesia' },
]

const TEST_USER_ID = 'test-user-seed-id'

async function seed() {
  console.log('Seeding database...')

  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Test User',
      email: 'test@example.com',
    })
    .onConflictDoNothing()

  const insertedProcesses = await db
    .insert(coffeeProcesses)
    .values(processesData)
    .onConflictDoNothing()
    .returning()
  const processMap = new Map(insertedProcesses.map((p) => [p.name, p.id]))

  const insertedVarieties = await db
    .insert(varieties)
    .values(varietiesData)
    .onConflictDoNothing()
    .returning()
  const varietyMap = new Map(insertedVarieties.map((v) => [v.name, v.id]))

  const insertedCountries = await db
    .insert(countries)
    .values(countriesData)
    .onConflictDoNothing()
    .returning()
  const countryMap = new Map(insertedCountries.map((c) => [c.name, c.id]))

  const insertedRegions = await db
    .insert(regions)
    .values(
      regionsData.map((r) => ({
        name: r.name,
        countryId: countryMap.get(r.country),
      })),
    )
    .onConflictDoNothing()
    .returning()
  const regionMap = new Map(insertedRegions.map((r) => [r.name, r.id]))

  const insertedFarms = await db
    .insert(farms)
    .values(
      farmsData.map((f) => ({
        name: f.name,
        regionId: regionMap.get(f.region),
      })),
    )
    .onConflictDoNothing()
    .returning()
  const farmMap = new Map(insertedFarms.map((f) => [f.name, f.id]))

  await db.insert(roasters).values(roastersData).onConflictDoNothing()

  await db.insert(roastLevels).values(roastLevelsData).onConflictDoNothing()

  for (const coffee of greenCoffeesData) {
    const {
      varieties: coffeeVarieties,
      process,
      country,
      region,
      farm,
      ...coffeeData
    } = coffee
    const [insertedCoffee] = await db
      .insert(greenCoffees)
      .values({
        ...coffeeData,
        userId: TEST_USER_ID,
        processId: processMap.get(process),
        countryId: countryMap.get(country),
        regionId: regionMap.get(region),
        farmId: farmMap.get(farm),
      })
      .onConflictDoNothing()
      .returning()

    for (const varietyName of coffeeVarieties) {
      const varietyId = varietyMap.get(varietyName)
      if (varietyId) {
        await db.insert(greenCoffeesVarieties).values({
          greenCoffeeId: insertedCoffee.id,
          varietyId,
        })
      }
    }
  }

  console.log('Seeding complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
