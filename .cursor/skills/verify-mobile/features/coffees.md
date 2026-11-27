# Browse Coffees

A signed-in user opens the Coffees tab, searches their Coffees, and opens one to read its details and its Brews of every method. Search matches the same fields as the web Coffees page (name, roaster, roast level, origin country, region and process, varieties, notes) on every Plan. It never reads a Coffee's Brews, so a Sealed Brew's settings cannot surface a Coffee. On the detail screen a Sealed Brew shows `Sealed — Subscribe to Pro to read this brew` instead of its settings.

## Sub-features

- `coffees-list` lists the user's Coffees with roaster and origin, or `No coffees yet. Add them on the web for now.` when empty.
- `coffees-search` narrows the list as the user types; `No coffees match your search.` when nothing matches.
- `coffees-detail` shows roaster, roast level, origins, varieties, notes, `Dialed in`, and every Brew of that Coffee, newest first.
- `coffees-sealed` shows the Sealed copy on a Sealed Brew row instead of grind, dose, output, ratio and time.

## How to get to it (user POV)

- Open the app while signed in and tap `Coffees` above the list.
- Type in `Search coffees...`.
- Tap a Coffee to open it. `Back` (or Android hardware back) returns to the list.
- Tap `Espresso` to return to the Espresso list.

## Driving it with control

Preconditions:

- Coffee Companion Metro is healthy at `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set), and `helpers/control doctor` is green.
- Drive is React Native Testing Library in-process with an injected session and a fake Coffees API. It does not call the live API.

- **Search and open a Coffee.** Run `helpers/control drive coffees`. The drive taps `testID=tab-coffees`, types each searchable field into `testID=coffee-search`, opens `testID=coffee-row-coffee-lintong`, and reads the Brews on `testID=coffee-detail`. `tree.txt` must show `Sumatra Lintong`, `Indonesia, Lintong, Wet-Hulled`, `Grind 24 · Dose 15g · Water 250g · Ratio 1:16.67 · Time 2m 45s`, and the Sealed copy.
- **Device (where an AVD or iOS Simulator exists).** Run Maestro `flows/browse-coffees.yaml` signed in as `e2e-user-free` (set `EXPO_PUBLIC_E2E_USER=e2e-user-free`). It searches `wet-hulled`, opens Sumatra Lintong, and expects its seeded Shot to be Sealed, since that Coffee is off Free's Shelf.

## Gotchas

- The Coffee list does not page. The detail reads each non-Espresso method's whole history and keeps this Coffee's; Espresso pages through this Coffee's Shots only.
- Search is client-side over what `coffee.getAll` returned. Sealing is the server's: a Sealed Brew arrives with its settings blanked.
- `verify-device` defaults to the `sign-in-and-out` flow and `e2e-user-with-data`, which holds a Grant, so nothing is Sealed for it. Use `e2e-user-free` to see Sealed rows.
- Handles live in `apps/mobile/src/coffees/copy.ts`.
