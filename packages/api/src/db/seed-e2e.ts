import { eq } from 'drizzle-orm'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { E2E_USER_FREE, E2E_USER_WITH_DATA } from '../lib/e2e-auth'
import {
  E2E_LIBRARY,
  FREE_GEAR,
  OFF_SHELF_DIALED_IN_COFFEE,
} from './e2e-library'
import {
  aeropressBrews,
  aeropressMethods,
  brewingDeviceTypes,
  brewingDevices,
  coffees,
  espressoShots,
  grinders,
  planGrants,
  roastLevels,
  roasters,
  user,
} from './schema'
import { db } from './index'

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

// Device types are globally-unique system defaults (null userId); reuse or
// create so repeated runs don't collide on the unique name.
async function roastLevelId(name: string) {
  const existing = await db
    .select()
    .from(roastLevels)
    .where(eq(roastLevels.name, name))
  if (existing[0]) return existing[0].id

  const [created] = await db
    .insert(roastLevels)
    .values({ name })
    .returning()
  return created.id
}

async function deviceTypeId(name: string) {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, name))
  if (existing[0]) return existing[0].id

  const [created] = await db
    .insert(brewingDeviceTypes)
    .values({ name })
    .returning()
  return created.id
}

// Every Coffee in E2E_LIBRARY with one Espresso Shot, brewed a day apart in the
// order listed, so the Shelf's five are the first five listed rather than
// whatever order the inserts happen to land in.
async function seedLibrary(
  userId: string,
  grinderId: string,
  brewingDeviceId: string,
) {
  for (const [index, entry] of E2E_LIBRARY.entries()) {
    const [coffee] = await db
      .insert(coffees)
      .values({ userId, name: entry.name })
      .returning()

    await db.insert(espressoShots).values({
      userId,
      coffeeId: coffee.id,
      grinderId,
      brewingDeviceId,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: entry.grindSetting,
      isDialedIn: entry.name === OFF_SHELF_DIALED_IN_COFFEE.name,
      createdAt: daysAgo(index + 1),
    })
  }
}

// The granted identity: seeded with a little data so authenticated pages render
// real content, plus the shared library its Grant lets it read in full.
async function seedGrantedUser() {
  await db.delete(user).where(eq(user.id, E2E_USER_WITH_DATA))
  await db.insert(user).values({
    id: E2E_USER_WITH_DATA,
    name: 'E2E Tester',
    email: 'e2e@example.com',
  })

  // This user exercises equipment CRUD past what Free allows, and reads a
  // library past what the Free Shelf holds.
  await db.insert(planGrants).values({
    userId: E2E_USER_WITH_DATA,
    planId: 'pro',
    reason: 'e2e fixture',
  })

  const typeId = await deviceTypeId('Espresso')

  const [grinder] = await db
    .insert(grinders)
    .values({ userId: E2E_USER_WITH_DATA, name: 'Niche Zero', brand: 'Niche' })
    .returning()

  const [device] = await db
    .insert(brewingDevices)
    .values({
      userId: E2E_USER_WITH_DATA,
      name: 'Linea Mini',
      brand: 'La Marzocco',
      typeId,
    })
    .returning()

  await seedLibrary(E2E_USER_WITH_DATA, grinder.id, device.id)

  await db.insert(roasters).values({ userId: E2E_USER_WITH_DATA, name: 'Sey' })
  await roastLevelId('Medium')

  // Brewed now, against a library brewed days ago, so this stays the most
  // recent Shot. The other `.data` specs read it as the log's first row, so
  // anything added to the library has to stay older than this.
  const [coffee] = await db
    .insert(coffees)
    .values({ userId: E2E_USER_WITH_DATA, name: 'Ethiopia Guji' })
    .returning()

  await db.insert(espressoShots).values({
    userId: E2E_USER_WITH_DATA,
    coffeeId: coffee.id,
    grinderId: grinder.id,
    brewingDeviceId: device.id,
    dose: '18',
    yield: '36',
    createdAt: daysAgo(0),
  })

  // AeroPress method + device + a dialed-in brew, so the Brews page's AeroPress
  // tab and the dashboard's dialed-in section render real content.
  const aeropressTypeId = await deviceTypeId(AEROPRESS_DEVICE_TYPE)

  const [aeropressDevice] = await db
    .insert(brewingDevices)
    .values({
      userId: E2E_USER_WITH_DATA,
      name: 'AeroPress Go',
      brand: 'AeroPress',
      typeId: aeropressTypeId,
    })
    .returning()

  // Methods are globally-unique system defaults (null userId); reuse or create.
  const existingMethod = await db
    .select()
    .from(aeropressMethods)
    .where(eq(aeropressMethods.name, 'Standard'))
  const methodId =
    existingMethod[0]?.id ??
    (
      await db.insert(aeropressMethods).values({ name: 'Standard' }).returning()
    )[0].id

  await db.insert(aeropressBrews).values({
    userId: E2E_USER_WITH_DATA,
    coffeeId: coffee.id,
    grinderId: grinder.id,
    brewingDeviceId: aeropressDevice.id,
    methodId,
    dose: '15',
    water: '220',
    steepTime: 90,
    grindSetting: '18',
    isDialedIn: true,
  })
}

// The Free identity: the same library, no Grant. Its equipment stays inside
// what Free allows, so nothing it owns predates a limit.
async function seedFreeUser() {
  await db.delete(user).where(eq(user.id, E2E_USER_FREE))
  await db.insert(user).values({
    id: E2E_USER_FREE,
    name: 'E2E Free Tester',
    email: 'e2e-free@example.com',
  })

  const typeId = await deviceTypeId('Espresso')

  const [grinder] = await db
    .insert(grinders)
    .values({
      userId: E2E_USER_FREE,
      name: FREE_GEAR.grinder,
      brand: 'Comandante',
    })
    .returning()

  const [device] = await db
    .insert(brewingDevices)
    .values({
      userId: E2E_USER_FREE,
      name: FREE_GEAR.brewingDevice,
      brand: 'Flair',
      typeId,
    })
    .returning()

  await seedLibrary(E2E_USER_FREE, grinder.id, device.id)
}

// Seeds the auth-bypass test users so authenticated pages render real content
// during e2e. Idempotent — resets each user's rows every run. Closes the
// connection pool when done (intended for one-shot test setup).
export async function seedE2eUsers() {
  await seedGrantedUser()
  await seedFreeUser()

  await db.$client.end()
}
