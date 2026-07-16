import {
  
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { defineRelations, sql } from 'drizzle-orm'
import { account, session, user } from './auth-schema'

export * from './auth-schema'

const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    // Use the database clock (not the app's JS clock) so updatedAt stays
    // consistent with createdAt's defaultNow() and never lands before it.
    .$onUpdate(() => sql`now()`),
}

export const countries = pgTable(
  'countries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('countries_name_idx').on(table.name)],
)

export const regions = pgTable(
  'regions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    countryId: uuid('country_id').references(() => countries.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('regions_name_country_idx').on(table.name, table.countryId),
  ],
)

export const roastLevels = pgTable(
  'roast_levels',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('roast_levels_name_idx').on(table.name)],
)

export const farms = pgTable(
  'farms',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    regionId: uuid('region_id').references(() => regions.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('farms_name_region_idx').on(table.name, table.regionId),
  ],
)

export const greenCoffees = pgTable(
  'green_coffees',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    countryId: uuid('country_id').references(() => countries.id),
    regionId: uuid('region_id').references(() => regions.id),
    farmId: uuid('farm_id').references(() => farms.id),
    processId: uuid('process_id').references(() => coffeeProcesses.id),
    altitude: integer(),
    notes: text(),
    ...timestamps,
  },
  (table) => [
    index('green_coffees_user_idx').on(table.userId),
    uniqueIndex('green_coffees_user_name_idx').on(table.name, table.userId),
    index('green_coffees_user_process_id_idx').on(
      table.processId,
      table.userId,
    ),
    index('green_coffees_user_country_idx').on(table.countryId, table.userId),
  ],
)

export const roasters = pgTable(
  'roasters',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('roasters_name_idx').on(table.name)],
)

export const coffees = pgTable(
  'coffees',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    roasterId: uuid('roaster_id').references(() => roasters.id),
    roastLevelId: uuid('roast_level_id').references(() => roastLevels.id),
    countryId: uuid('country_id').references(() => countries.id),
    regionId: uuid('region_id').references(() => regions.id),
    processId: uuid('process_id').references(() => coffeeProcesses.id),
    notes: text(),
    isActive: boolean('is_active'),
    ...timestamps,
  },
  (table) => [
    index('coffees_user_idx').on(table.userId),
    index('coffees_user_name_idx').on(table.name, table.userId),
    index('coffees_user_process_id_idx').on(table.processId, table.userId),
    index('coffees_user_country_idx').on(table.countryId, table.userId),
  ],
)

export const varieties = pgTable(
  'varieties',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('varieties_name_idx').on(table.name)],
)

export const coffeesVarieties = pgTable(
  'coffees_varieties',
  {
    varietyId: uuid('variety_id')
      .references(() => varieties.id, { onDelete: 'cascade' })
      .notNull(),
    coffeeId: uuid('coffee_id')
      .references(() => coffees.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.coffeeId, table.varietyId],
    }),
  ],
)

export const greenCoffeesVarieties = pgTable(
  'green_coffees_varieties',
  {
    varietyId: uuid('variety_id')
      .references(() => varieties.id, { onDelete: 'cascade' })
      .notNull(),
    greenCoffeeId: uuid('green_coffee_id')
      .references(() => greenCoffees.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.greenCoffeeId, table.varietyId],
    }),
  ],
)

export const coffeeProcesses = pgTable(
  'coffee_processes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('coffee_processes_name_idx').on(table.name)],
)

export const grinders = pgTable(
  'grinders',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    brand: text().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    uniqueIndex().on(table.name, table.userId),
  ],
)

export const brewingDeviceTypes = pgTable(
  'brewing_device_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('brewing_device_types_name_idx').on(table.name)],
)

export const brewingDevices = pgTable(
  'brewing_devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    brand: text().notNull(),
    typeId: uuid('type_id')
      .references(() => brewingDeviceTypes.id)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    uniqueIndex().on(table.name, table.userId),
  ],
)

// Columns shared by every brewing-method table. Each method gets its own table
// (espresso_shots, and future pour_over_brews, etc.) so it can store its own
// typed settings; these base columns are spread in like `timestamps`.
const brewBase = {
  id: uuid().primaryKey().defaultRandom(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
  coffeeId: uuid('coffee_id')
    .references(() => coffees.id, { onDelete: 'cascade' })
    .notNull(),
  roastDate: date('roast_date'),
  grinderId: uuid('grinder_id')
    .references(() => grinders.id, { onDelete: 'cascade' })
    .notNull(),
  brewingDeviceId: uuid('brewing_device_id')
    .references(() => brewingDevices.id, { onDelete: 'cascade' })
    .notNull(),
  grindSetting: text('grind_setting'),
  notes: text(),
  isDialedIn: boolean('is_dialed_in').notNull().default(false),
  ...timestamps,
}

export const espressoShots = pgTable(
  'espresso_shots',
  {
    ...brewBase,
    dose: numeric(),
    yield: numeric(),
    time: integer(),
  },
  (table) => [
    index('espresso_shots_user_idx').on(table.userId),
    index('espresso_shots_user_coffee_idx').on(table.userId, table.coffeeId),
    // At most one dialed-in espresso shot per coffee.
    uniqueIndex('espresso_shots_dialed_in_idx')
      .on(table.coffeeId)
      .where(sql`is_dialed_in`),
  ],
)

// AeroPress brew method (e.g. Standard, Inverted). A system-defaults + user
// lookup, mirroring brewingDeviceTypes: rows with a null userId are shared
// defaults; users can add their own. Kept as a lookup (not an enum) so it stays
// user-extensible.
export const aeropressMethods = pgTable(
  'aeropress_methods',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('aeropress_methods_name_idx').on(table.name)],
)

export const aeropressBrews = pgTable(
  'aeropress_brews',
  {
    ...brewBase,
    methodId: uuid('method_id')
      .references(() => aeropressMethods.id)
      .notNull(),
    // Weights are grams, stored as numeric (decimal strings) like espresso
    // dose/yield. water is the brew water weight; ratio (water / dose) is
    // derived in the app, not stored.
    dose: numeric(),
    water: numeric(),
    steepTime: integer('steep_time'),
  },
  (table) => [
    index('aeropress_brews_user_idx').on(table.userId),
    index('aeropress_brews_user_coffee_idx').on(table.userId, table.coffeeId),
    // At most one dialed-in aeropress brew per coffee *per method* — so a coffee
    // can have both a dialed-in Standard and a dialed-in Inverted brew.
    // Independent of the dialed-in espresso shot as well.
    uniqueIndex('aeropress_brews_dialed_in_idx')
      .on(table.coffeeId, table.methodId)
      .where(sql`is_dialed_in`),
  ],
)

// Pour Over brew method (e.g. Standard). Same system-defaults + user lookup as
// aeropressMethods: rows with a null userId are shared defaults; users can add
// their own. Kept as a lookup (not an enum) so it stays user-extensible.
export const pouroverMethods = pgTable(
  'pourover_methods',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('pourover_methods_name_idx').on(table.name)],
)

export const pouroverBrews = pgTable(
  'pourover_brews',
  {
    ...brewBase,
    methodId: uuid('method_id')
      .references(() => pouroverMethods.id)
      .notNull(),
    // Weights are grams, stored as numeric (decimal strings) like aeropress
    // dose/water; ratio (water / dose) is derived in the app, not stored.
    dose: numeric(),
    water: numeric(),
    // brewTime is total drawdown in whole seconds (the pour-over analogue of
    // aeropress steep time). waterTemp is whole degrees Celsius.
    brewTime: integer('brew_time'),
    waterTemp: integer('water_temp'),
  },
  (table) => [
    index('pourover_brews_user_idx').on(table.userId),
    index('pourover_brews_user_coffee_idx').on(table.userId, table.coffeeId),
    // At most one dialed-in pour over brew per coffee *per method*, independent
    // of the dialed-in espresso shot and aeropress brews.
    uniqueIndex('pourover_brews_dialed_in_idx')
      .on(table.coffeeId, table.methodId)
      .where(sql`is_dialed_in`),
  ],
)

// French Press brew method (e.g. Standard), same system-defaults + user lookup
// as aeropressMethods/pouroverMethods.
export const frenchpressMethods = pgTable(
  'frenchpress_methods',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('frenchpress_methods_name_idx').on(table.name)],
)

export const frenchpressBrews = pgTable(
  'frenchpress_brews',
  {
    ...brewBase,
    methodId: uuid('method_id')
      .references(() => frenchpressMethods.id)
      .notNull(),
    dose: numeric(),
    water: numeric(),
    // Immersion brew: steepTime is whole seconds, waterTemp whole degrees C.
    steepTime: integer('steep_time'),
    waterTemp: integer('water_temp'),
  },
  (table) => [
    index('frenchpress_brews_user_idx').on(table.userId),
    index('frenchpress_brews_user_coffee_idx').on(table.userId, table.coffeeId),
    uniqueIndex('frenchpress_brews_dialed_in_idx')
      .on(table.coffeeId, table.methodId)
      .where(sql`is_dialed_in`),
  ],
)

// Relations

export const relations = defineRelations(
  { user, session, account, countries, regions, farms, roasters, roastLevels, coffeeProcesses, varieties, greenCoffees, coffees, coffeesVarieties, greenCoffeesVarieties, grinders, brewingDeviceTypes, brewingDevices, espressoShots, aeropressMethods, aeropressBrews, pouroverMethods, pouroverBrews, frenchpressMethods, frenchpressBrews },
  (r) => ({
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
      greenCoffees: r.many.greenCoffees(),
      coffees: r.many.coffees(),
      countries: r.many.countries(),
      regions: r.many.regions(),
      farms: r.many.farms(),
      roasters: r.many.roasters(),
      roastLevels: r.many.roastLevels(),
      coffeeProcesses: r.many.coffeeProcesses(),
      varieties: r.many.varieties(),
      grinders: r.many.grinders(),
      brewingDeviceTypes: r.many.brewingDeviceTypes(),
      brewingDevices: r.many.brewingDevices(),
      espressoShots: r.many.espressoShots(),
      aeropressMethods: r.many.aeropressMethods(),
      aeropressBrews: r.many.aeropressBrews(),
      pouroverMethods: r.many.pouroverMethods(),
      pouroverBrews: r.many.pouroverBrews(),
      frenchpressMethods: r.many.frenchpressMethods(),
      frenchpressBrews: r.many.frenchpressBrews(),
    },
    countries: {
      user: r.one.user({ from: r.countries.userId, to: r.user.id }),
      regions: r.many.regions(),
      greenCoffees: r.many.greenCoffees(),
      coffees: r.many.coffees(),
    },
    regions: {
      user: r.one.user({ from: r.regions.userId, to: r.user.id }),
      country: r.one.countries({ from: r.regions.countryId, to: r.countries.id }),
      farms: r.many.farms(),
      greenCoffees: r.many.greenCoffees(),
      coffees: r.many.coffees(),
    },
    farms: {
      user: r.one.user({ from: r.farms.userId, to: r.user.id }),
      region: r.one.regions({ from: r.farms.regionId, to: r.regions.id }),
      greenCoffees: r.many.greenCoffees(),
    },
    roasters: {
      user: r.one.user({ from: r.roasters.userId, to: r.user.id }),
      coffees: r.many.coffees(),
    },
    roastLevels: {
      user: r.one.user({ from: r.roastLevels.userId, to: r.user.id }),
      coffees: r.many.coffees(),
    },
    coffeeProcesses: {
      user: r.one.user({ from: r.coffeeProcesses.userId, to: r.user.id }),
      greenCoffees: r.many.greenCoffees(),
      coffees: r.many.coffees(),
    },
    varieties: {
      user: r.one.user({ from: r.varieties.userId, to: r.user.id }),
      coffeesVarieties: r.many.coffeesVarieties(),
      greenCoffeesVarieties: r.many.greenCoffeesVarieties(),
    },
    greenCoffees: {
      user: r.one.user({ from: r.greenCoffees.userId, to: r.user.id }),
      country: r.one.countries({ from: r.greenCoffees.countryId, to: r.countries.id }),
      region: r.one.regions({ from: r.greenCoffees.regionId, to: r.regions.id }),
      farm: r.one.farms({ from: r.greenCoffees.farmId, to: r.farms.id }),
      process: r.one.coffeeProcesses({ from: r.greenCoffees.processId, to: r.coffeeProcesses.id }),
      greenCoffeesVarieties: r.many.greenCoffeesVarieties(),
    },
    coffees: {
      user: r.one.user({ from: r.coffees.userId, to: r.user.id }),
      roaster: r.one.roasters({ from: r.coffees.roasterId, to: r.roasters.id }),
      country: r.one.countries({ from: r.coffees.countryId, to: r.countries.id }),
      region: r.one.regions({ from: r.coffees.regionId, to: r.regions.id }),
      roastLevel: r.one.roastLevels({ from: r.coffees.roastLevelId, to: r.roastLevels.id }),
      process: r.one.coffeeProcesses({ from: r.coffees.processId, to: r.coffeeProcesses.id }),
      coffeesVarieties: r.many.coffeesVarieties(),
      espressoShots: r.many.espressoShots(),
      aeropressBrews: r.many.aeropressBrews(),
      pouroverBrews: r.many.pouroverBrews(),
      frenchpressBrews: r.many.frenchpressBrews(),
    },
    coffeesVarieties: {
      coffee: r.one.coffees({ from: r.coffeesVarieties.coffeeId, to: r.coffees.id }),
      variety: r.one.varieties({ from: r.coffeesVarieties.varietyId, to: r.varieties.id }),
    },
    greenCoffeesVarieties: {
      greenCoffee: r.one.greenCoffees({ from: r.greenCoffeesVarieties.greenCoffeeId, to: r.greenCoffees.id }),
      variety: r.one.varieties({ from: r.greenCoffeesVarieties.varietyId, to: r.varieties.id }),
    },
    grinders: {
      user: r.one.user({ from: r.grinders.userId, to: r.user.id, optional: false }),
      espressoShots: r.many.espressoShots(),
      aeropressBrews: r.many.aeropressBrews(),
      pouroverBrews: r.many.pouroverBrews(),
      frenchpressBrews: r.many.frenchpressBrews(),
    },
    brewingDeviceTypes: {
      user: r.one.user({ from: r.brewingDeviceTypes.userId, to: r.user.id }),
      brewingDevices: r.many.brewingDevices(),
    },
    brewingDevices: {
      user: r.one.user({ from: r.brewingDevices.userId, to: r.user.id, optional: false }),
      type: r.one.brewingDeviceTypes({ from: r.brewingDevices.typeId, to: r.brewingDeviceTypes.id, optional: false }),
      espressoShots: r.many.espressoShots(),
      aeropressBrews: r.many.aeropressBrews(),
      pouroverBrews: r.many.pouroverBrews(),
      frenchpressBrews: r.many.frenchpressBrews(),
    },
    espressoShots: {
      user: r.one.user({ from: r.espressoShots.userId, to: r.user.id, optional: false }),
      coffee: r.one.coffees({ from: r.espressoShots.coffeeId, to: r.coffees.id, optional: false }),
      grinder: r.one.grinders({ from: r.espressoShots.grinderId, to: r.grinders.id, optional: false }),
      brewingDevice: r.one.brewingDevices({ from: r.espressoShots.brewingDeviceId, to: r.brewingDevices.id, optional: false }),
    },
    aeropressMethods: {
      user: r.one.user({ from: r.aeropressMethods.userId, to: r.user.id }),
      aeropressBrews: r.many.aeropressBrews(),
    },
    aeropressBrews: {
      user: r.one.user({ from: r.aeropressBrews.userId, to: r.user.id, optional: false }),
      coffee: r.one.coffees({ from: r.aeropressBrews.coffeeId, to: r.coffees.id, optional: false }),
      grinder: r.one.grinders({ from: r.aeropressBrews.grinderId, to: r.grinders.id, optional: false }),
      brewingDevice: r.one.brewingDevices({ from: r.aeropressBrews.brewingDeviceId, to: r.brewingDevices.id, optional: false }),
      method: r.one.aeropressMethods({ from: r.aeropressBrews.methodId, to: r.aeropressMethods.id, optional: false }),
    },
    pouroverMethods: {
      user: r.one.user({ from: r.pouroverMethods.userId, to: r.user.id }),
      pouroverBrews: r.many.pouroverBrews(),
    },
    pouroverBrews: {
      user: r.one.user({ from: r.pouroverBrews.userId, to: r.user.id, optional: false }),
      coffee: r.one.coffees({ from: r.pouroverBrews.coffeeId, to: r.coffees.id, optional: false }),
      grinder: r.one.grinders({ from: r.pouroverBrews.grinderId, to: r.grinders.id, optional: false }),
      brewingDevice: r.one.brewingDevices({ from: r.pouroverBrews.brewingDeviceId, to: r.brewingDevices.id, optional: false }),
      method: r.one.pouroverMethods({ from: r.pouroverBrews.methodId, to: r.pouroverMethods.id, optional: false }),
    },
    frenchpressMethods: {
      user: r.one.user({ from: r.frenchpressMethods.userId, to: r.user.id }),
      frenchpressBrews: r.many.frenchpressBrews(),
    },
    frenchpressBrews: {
      user: r.one.user({ from: r.frenchpressBrews.userId, to: r.user.id, optional: false }),
      coffee: r.one.coffees({ from: r.frenchpressBrews.coffeeId, to: r.coffees.id, optional: false }),
      grinder: r.one.grinders({ from: r.frenchpressBrews.grinderId, to: r.grinders.id, optional: false }),
      brewingDevice: r.one.brewingDevices({ from: r.frenchpressBrews.brewingDeviceId, to: r.brewingDevices.id, optional: false }),
      method: r.one.frenchpressMethods({ from: r.frenchpressBrews.methodId, to: r.frenchpressMethods.id, optional: false }),
    },
    session: {
      user: r.one.user({ from: r.session.userId, to: r.user.id }),
    },
    account: {
      user: r.one.user({ from: r.account.userId, to: r.user.id }),
    },
  }),
)
