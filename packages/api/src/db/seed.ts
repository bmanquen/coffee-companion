import { eq } from 'drizzle-orm'
import {
  brewingDeviceTypes,
  brewingDevices,
  coffeeProcesses,
  coffees,
  coffeesVarieties,
  countries,
  espressoShots,
  farms,
  greenCoffees,
  greenCoffeesVarieties,
  grinders,
  regions,
  roastLevels,
  roasters,
  user,
  varieties,
} from './schema'
import { db } from './index'

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

const grindersData = [
  { name: 'Niche Zero', brand: 'Niche' },
  { name: 'DF64', brand: 'Turin' },
  { name: 'Mignon Specialita', brand: 'Eureka' },
]

// System-default brewing device types (shared across all users, userId null).
const brewingDeviceTypesData = [
  { name: 'Espresso' },
  { name: 'Pour Over' },
  { name: 'French Press' },
  { name: 'AeroPress' },
  { name: 'Moka Pot' },
  { name: 'Drip Machine' },
  { name: 'Cold Brew' },
  { name: 'Siphon' },
]

const brewingDevicesData = [
  { name: 'Linea Mini', brand: 'La Marzocco', type: 'Espresso' },
  { name: 'Pro 600', brand: 'Profitec', type: 'Espresso' },
  { name: 'Bianca', brand: 'Lelit', type: 'Espresso' },
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

const coffeesData = [
  {
    name: 'Ethiopia Yirgacheffe',
    roaster: 'Onyx Coffee Lab',
    roastLevel: 'Light',
    roastDate: '2026-06-10',
    country: 'Ethiopia',
    region: 'Yirgacheffe',
    process: 'Washed',
    notes: 'Floral, bergamot, lemon, tea-like body',
    isActive: true,
    varieties: ['Heirloom'],
    shots: [
      { dose: '18.0', yield: '36.0', time: 28, grindSetting: '2.5', notes: 'Balanced and juicy' },
      { dose: '18.0', yield: '40.0', time: 26, grindSetting: '2.8', notes: 'A touch sour, grind finer' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Colombia Huila',
    roaster: 'Counter Culture',
    roastLevel: 'Medium',
    roastDate: '2026-06-08',
    country: 'Colombia',
    region: 'Huila',
    process: 'Washed',
    notes: 'Caramel, red apple, citrus acidity',
    isActive: true,
    varieties: ['Caturra'],
    shots: [
      { dose: '18.5', yield: '37.0', time: 30, grindSetting: '3.0', notes: 'Sweet and syrupy' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Kenya AA Nyeri',
    roaster: 'Intelligentsia',
    roastLevel: 'Medium-Light',
    roastDate: '2026-06-05',
    country: 'Kenya',
    region: 'Nyeri',
    process: 'Washed',
    notes: 'Blackcurrant, tomato, bright acidity',
    isActive: true,
    varieties: ['SL28', 'SL34'],
    shots: [
      { dose: '18.0', yield: '38.0', time: 32, grindSetting: '2.2', notes: 'Punchy blackcurrant' },
      { dose: '18.0', yield: '36.0', time: 29, grindSetting: '2.4', notes: 'More balanced' },
    ],
    dialedInShotIndex: 1,
  },
  {
    name: 'Guatemala Antigua',
    roaster: 'George Howell Coffee',
    roastLevel: 'Medium',
    roastDate: '2026-06-01',
    country: 'Guatemala',
    region: 'Antigua',
    process: 'Washed',
    notes: 'Chocolate, nuts, mild citrus',
    isActive: true,
    varieties: ['Bourbon'],
    shots: [
      { dose: '18.0', yield: '36.0', time: 30, grindSetting: '3.2', notes: 'Chocolatey, classic' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Brazil Cerrado',
    roaster: 'Counter Culture',
    roastLevel: 'Medium-Dark',
    roastDate: '2026-05-28',
    country: 'Brazil',
    region: 'Cerrado Mineiro',
    process: 'Natural',
    notes: 'Nuts, chocolate, low acidity, full body',
    isActive: false,
    varieties: ['Yellow Bourbon'],
    shots: [
      { dose: '19.0', yield: '38.0', time: 27, grindSetting: '3.5', notes: 'Heavy body, nutty' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Panama Geisha',
    roaster: 'Heart Coffee Roasters',
    roastLevel: 'Light',
    roastDate: '2026-06-12',
    country: 'Panama',
    region: 'Boquete',
    process: 'Washed',
    notes: 'Jasmine, tropical fruit, bergamot, silky body',
    isActive: true,
    varieties: ['Geisha'],
    shots: [
      { dose: '18.0', yield: '45.0', time: 32, grindSetting: '2.0', notes: 'Long ratio, floral and tea-like' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Costa Rica Tarrazu',
    roaster: 'Onyx Coffee Lab',
    roastLevel: 'Medium-Light',
    roastDate: '2026-06-03',
    country: 'Costa Rica',
    region: 'Tarrazu',
    process: 'Honey',
    notes: 'Honey, stone fruit, brown sugar',
    isActive: true,
    varieties: ['Catuai'],
    shots: [
      { dose: '18.0', yield: '37.0', time: 29, grindSetting: '2.7', notes: 'Sweet, stone fruit' },
    ],
    dialedInShotIndex: 0,
  },
  {
    name: 'Sumatra Mandheling',
    roaster: 'Heart Coffee Roasters',
    roastLevel: 'Dark',
    roastDate: '2026-05-20',
    country: 'Indonesia',
    region: 'North Sumatra',
    process: 'Wet-Hulled',
    notes: 'Earthy, herbal, full body, low acidity',
    isActive: false,
    varieties: ['Typica'],
    shots: [
      { dose: '19.0', yield: '36.0', time: 26, grindSetting: '4.0', notes: 'Earthy and bold' },
    ],
    dialedInShotIndex: 0,
  },
]

// Target user for the seed. Override with SEED_USER_ID to attach the data to a
// real account (e.g. your logged-in user) so it shows up in the app; otherwise
// it falls back to a fictional test user that the seed creates.
const TEST_USER_ID = 'test-user-seed-id'
const SEED_USER_ID = process.env.SEED_USER_ID ?? TEST_USER_ID
const usingExistingUser = process.env.SEED_USER_ID != null

async function seed() {
  console.log(`Seeding database for user "${SEED_USER_ID}"...`)

  // Only create the fictional test user. When SEED_USER_ID points at a real
  // account, that user already exists and we must not overwrite it.
  if (!usingExistingUser) {
    await db
      .insert(user)
      .values({
        id: SEED_USER_ID,
        name: 'Test User',
        email: 'test@example.com',
      })
      .onConflictDoNothing()
  }

  // Clear previously seeded transactional data so the seed is repeatable
  // (cascades to espresso shots and variety join rows). Lookup tables below
  // are upserted, so they are left in place.
  await db.delete(coffees).where(eq(coffees.userId, SEED_USER_ID))
  await db.delete(greenCoffees).where(eq(greenCoffees.userId, SEED_USER_ID))
  await db.delete(grinders).where(eq(grinders.userId, SEED_USER_ID))
  await db
    .delete(brewingDevices)
    .where(eq(brewingDevices.userId, SEED_USER_ID))

  // Lookup maps are built from a full table read (not insert().returning(),
  // which only returns newly inserted rows) so foreign keys resolve whether or
  // not the lookup rows already existed.
  await db.insert(coffeeProcesses).values(processesData).onConflictDoNothing()
  const processMap = new Map(
    (await db.select().from(coffeeProcesses)).map((p) => [p.name, p.id]),
  )

  await db.insert(varieties).values(varietiesData).onConflictDoNothing()
  const varietyMap = new Map(
    (await db.select().from(varieties)).map((v) => [v.name, v.id]),
  )

  await db.insert(countries).values(countriesData).onConflictDoNothing()
  const countryMap = new Map(
    (await db.select().from(countries)).map((c) => [c.name, c.id]),
  )

  await db
    .insert(regions)
    .values(
      regionsData.map((r) => ({
        name: r.name,
        countryId: countryMap.get(r.country),
      })),
    )
    .onConflictDoNothing()
  const regionMap = new Map(
    (await db.select().from(regions)).map((r) => [r.name, r.id]),
  )

  await db
    .insert(farms)
    .values(
      farmsData.map((f) => ({
        name: f.name,
        regionId: regionMap.get(f.region),
      })),
    )
    .onConflictDoNothing()
  const farmMap = new Map(
    (await db.select().from(farms)).map((f) => [f.name, f.id]),
  )

  await db.insert(roasters).values(roastersData).onConflictDoNothing()
  const roasterMap = new Map(
    (await db.select().from(roasters)).map((r) => [r.name, r.id]),
  )

  await db.insert(roastLevels).values(roastLevelsData).onConflictDoNothing()
  const roastLevelMap = new Map(
    (await db.select().from(roastLevels)).map((r) => [r.name, r.id]),
  )

  // Grinders are user-owned and were cleared above, so insert fresh.
  await db
    .insert(grinders)
    .values(grindersData.map((g) => ({ ...g, userId: SEED_USER_ID })))
  const grinderMap = new Map(
    (
      await db.select().from(grinders).where(eq(grinders.userId, SEED_USER_ID))
    ).map((g) => [g.name, g.id]),
  )
  const grinderIds = grindersData.map((g) => grinderMap.get(g.name)!)

  // Brewing device types are system defaults (userId null), upserted by name.
  await db
    .insert(brewingDeviceTypes)
    .values(brewingDeviceTypesData)
    .onConflictDoNothing()
  const brewingDeviceTypeMap = new Map(
    (await db.select().from(brewingDeviceTypes)).map((t) => [t.name, t.id]),
  )

  // Brewing devices are user-owned and were cleared above, so insert fresh.
  await db.insert(brewingDevices).values(
    brewingDevicesData.map((d) => ({
      name: d.name,
      brand: d.brand,
      userId: SEED_USER_ID,
      typeId: brewingDeviceTypeMap.get(d.type)!,
    })),
  )
  const brewingDeviceMap = new Map(
    (
      await db
        .select()
        .from(brewingDevices)
        .where(eq(brewingDevices.userId, SEED_USER_ID))
    ).map((d) => [d.name, d.id]),
  )
  const brewingDeviceIds = brewingDevicesData.map(
    (d) => brewingDeviceMap.get(d.name)!,
  )

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
        userId: SEED_USER_ID,
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

  for (const [coffeeIndex, coffee] of coffeesData.entries()) {
    const {
      varieties: coffeeVarieties,
      shots,
      dialedInShotIndex,
      roaster,
      roastLevel,
      process: coffeeProcess,
      country,
      region,
      roastDate,
      ...coffeeData
    } = coffee

    const grinderId = grinderIds[coffeeIndex % grinderIds.length]
    const brewingDeviceId =
      brewingDeviceIds[coffeeIndex % brewingDeviceIds.length]

    const [insertedCoffee] = await db
      .insert(coffees)
      .values({
        ...coffeeData,
        userId: SEED_USER_ID,
        roasterId: roasterMap.get(roaster),
        roastLevelId: roastLevelMap.get(roastLevel),
        processId: processMap.get(coffeeProcess),
        countryId: countryMap.get(country),
        regionId: regionMap.get(region),
      })
      .onConflictDoNothing()
      .returning()

    // `onConflictDoNothing` yields an empty array on conflict, so the row may
    // be absent at runtime even though the type says otherwise.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!insertedCoffee) continue

    await db.insert(espressoShots).values(
      shots.map((shot, index) => ({
        ...shot,
        userId: SEED_USER_ID,
        coffeeId: insertedCoffee.id,
        grinderId,
        brewingDeviceId,
        roastDate,
        // One dialed-in shot per coffee (enforced by a partial unique index).
        isDialedIn: index === dialedInShotIndex,
      })),
    )

    for (const varietyName of coffeeVarieties) {
      const varietyId = varietyMap.get(varietyName)
      if (varietyId) {
        await db.insert(coffeesVarieties).values({
          coffeeId: insertedCoffee.id,
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
