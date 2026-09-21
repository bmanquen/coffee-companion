// The library the e2e seed gives both library identities — the granted one and
// the Free one — so the only thing separating what they can read is the Grant.
//
// Listed most recently brewed first. Free's Shelf holds five, so the last two
// have fallen off it and a Free reader finds their Brews Sealed. Kept free of
// database access so a browser test can address a Coffee by its position
// relative to the Shelf without importing the seed.

export const E2E_LIBRARY = [
  {
    name: 'Kenya Nyeri',
    grindSetting: '21',
    country: 'Kenya',
    region: 'Nyeri',
    process: 'Washed',
  },
  {
    name: 'Guatemala Huehuetenango',
    grindSetting: '22',
    country: 'Guatemala',
    region: 'Huehuetenango',
    process: 'Washed',
  },
  {
    name: 'Rwanda Kivu',
    grindSetting: '23',
    country: 'Rwanda',
    region: 'Kivu',
    process: 'Washed',
  },
  {
    name: 'Peru Cajamarca',
    grindSetting: '24',
    country: 'Peru',
    region: 'Cajamarca',
    process: 'Washed',
  },
  {
    name: 'Burundi Kayanza',
    grindSetting: '25',
    country: 'Burundi',
    region: 'Kayanza',
    process: 'Washed',
  },
  {
    name: 'Sumatra Lintong',
    grindSetting: '26',
    country: 'Indonesia',
    region: 'Lintong',
    process: 'Wet-Hulled',
  },
  {
    name: 'Brazil Cerrado',
    grindSetting: '27',
    country: 'Brazil',
    region: 'Cerrado',
    process: 'Natural',
  },
]

// The most recently brewed Coffee, so it sits on the Shelf under either Plan.
export const ON_SHELF_COFFEE = E2E_LIBRARY[0]

// Off the Shelf, and its Shot is the Coffee's dial-in reference — the settings
// the Coffees list would otherwise leak past the paywall.
export const OFF_SHELF_DIALED_IN_COFFEE = E2E_LIBRARY[5]

// Off the Shelf, and the one a Free reader logs a fresh Brew against. Chosen as
// the oldest so promoting it displaces the fifth Coffee rather than either of
// the two the other tests read.
export const OFF_SHELF_COFFEE = E2E_LIBRARY[6]

// The gear the Free identity's library is brewed on — one Grinder and one
// Brewing Device, inside what Free allows. Named here because a browser test
// logging a Brew has to pick them, and only the seed otherwise knows them.
export const FREE_GEAR = {
  grinder: 'Comandante C40',
  brewingDevice: 'Flair 58',
}
