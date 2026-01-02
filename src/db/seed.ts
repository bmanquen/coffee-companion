import { db } from './index.ts'
import { greenCoffees } from './schema.ts'

const seedData = [
  {
    name: 'Ethiopian Yirgacheffe',
    country: 'Ethiopia',
    region: 'Yirgacheffe',
    farm: 'Kochere Washing Station',
    producer: 'Various Smallholders',
    variety: 'Heirloom',
    process: 'Washed',
    altitude: 1950,
    notes: 'Floral, bergamot, lemon, tea-like body',
  },
  {
    name: 'Colombian Huila',
    country: 'Colombia',
    region: 'Huila',
    farm: 'Finca El Paraiso',
    producer: 'Diego Bermudez',
    variety: 'Caturra',
    process: 'Washed',
    altitude: 1800,
    notes: 'Caramel, red apple, citrus acidity',
  },
  {
    name: 'Kenyan AA Nyeri',
    country: 'Kenya',
    region: 'Nyeri',
    farm: 'Othaya Cooperative',
    producer: 'Othaya Farmers',
    variety: 'SL28, SL34',
    process: 'Washed',
    altitude: 1700,
    notes: 'Blackcurrant, tomato, bright acidity',
  },
  {
    name: 'Guatemala Antigua',
    country: 'Guatemala',
    region: 'Antigua',
    farm: 'Finca Filadelfia',
    producer: 'Filadelfia Estate',
    variety: 'Bourbon',
    process: 'Washed',
    altitude: 1500,
    notes: 'Chocolate, nuts, mild citrus',
  },
  {
    name: 'Brazilian Cerrado',
    country: 'Brazil',
    region: 'Cerrado Mineiro',
    farm: 'Fazenda Santa Ines',
    producer: 'Carmo de Minas',
    variety: 'Yellow Bourbon',
    process: 'Natural',
    altitude: 1100,
    notes: 'Nuts, chocolate, low acidity, full body',
  },
  {
    name: 'Panama Geisha',
    country: 'Panama',
    region: 'Boquete',
    farm: 'Hacienda La Esmeralda',
    producer: 'Peterson Family',
    variety: 'Geisha',
    process: 'Washed',
    altitude: 1600,
    notes: 'Jasmine, tropical fruit, bergamot, silky body',
  },
  {
    name: 'Costa Rica Tarrazu',
    country: 'Costa Rica',
    region: 'Tarrazu',
    farm: 'Finca Don Mayo',
    producer: 'Don Mayo',
    variety: 'Catuai',
    process: 'Honey',
    altitude: 1650,
    notes: 'Honey, stone fruit, brown sugar',
  },
  {
    name: 'Sumatra Mandheling',
    country: 'Indonesia',
    region: 'North Sumatra',
    farm: 'Various Smallholders',
    producer: 'Mandheling Cooperative',
    variety: 'Typica',
    process: 'Wet-Hulled',
    altitude: 1300,
    notes: 'Earthy, herbal, full body, low acidity',
  },
]

async function seed() {
  console.log('Seeding database...')
  await db.insert(greenCoffees).values(seedData)
  console.log('Seeding complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
