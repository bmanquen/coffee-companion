import { eq } from 'drizzle-orm'
import { AEROPRESS_DEVICE_TYPE } from '../lib/aeropress'
import { E2E_USER_WITH_DATA } from '../lib/e2e-auth'
import {
  aeropressBrews,
  aeropressMethods,
  brewingDeviceTypes,
  brewingDevices,
  coffees,
  espressoShots,
  grinders,
  roasters,
  user,
} from './schema'
import { db } from './index'

// Seeds the auth-bypass test user with a little data so authenticated pages
// render real content during e2e. Idempotent — resets the user's rows each run.
// Closes the connection pool when done (intended for one-shot test setup).
export async function seedE2eUser() {
  await db.delete(user).where(eq(user.id, E2E_USER_WITH_DATA))
  await db.insert(user).values({
    id: E2E_USER_WITH_DATA,
    name: 'E2E Tester',
    email: 'e2e@example.com',
  })

  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, 'Espresso'))
  const typeId =
    existing[0]?.id ??
    (
      await db
        .insert(brewingDeviceTypes)
        .values({ name: 'Espresso' })
        .returning()
    )[0].id

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

  await db
    .insert(roasters)
    .values({ userId: E2E_USER_WITH_DATA, name: 'Sey' })

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
  })

  // AeroPress method + device + a dialed-in brew, so the Brews page's AeroPress
  // tab and the dashboard's dialed-in section render real content.
  const existingApType = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, AEROPRESS_DEVICE_TYPE))
  const aeropressTypeId =
    existingApType[0]?.id ??
    (
      await db
        .insert(brewingDeviceTypes)
        .values({ name: AEROPRESS_DEVICE_TYPE })
        .returning()
    )[0].id

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

  await db.$client.end()
}
