import { db } from './index.ts'
import {
  greenCoffees,
  coffeeProcesses,
  varieties,
  greenCoffeesVarieties,
  user,
} from './schema.ts'

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

const greenCoffeesData = [
  {
    name: 'Ethiopian Yirgacheffe',
    country: 'Ethiopia',
    region: 'Yirgacheffe',
    farm: 'Kochere Washing Station',
    producer: 'Various Smallholders',
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
    producer: 'Diego Bermudez',
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
    producer: 'Othaya Farmers',
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
    producer: 'Filadelfia Estate',
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
    producer: 'Carmo de Minas',
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
    producer: 'Peterson Family',
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
    producer: 'Don Mayo',
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
    producer: 'Mandheling Cooperative',
    process: 'Wet-Hulled',
    altitude: 1300,
    notes: 'Earthy, herbal, full body, low acidity',
    varieties: ['Typica'],
  },
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

  for (const coffee of greenCoffeesData) {
    const { varieties: coffeeVarieties, process, ...coffeeData } = coffee
    const [insertedCoffee] = await db
      .insert(greenCoffees)
      .values({ ...coffeeData, userId: TEST_USER_ID, processId: processMap.get(process) })
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
