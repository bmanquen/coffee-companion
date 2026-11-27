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
- Tap a Coffee to open it. `Back` (or Android hardware back) returns to the list with the search kept.
- Tap `Espresso` to return to the Espresso list.

## Driving it with control

Preconditions:

- Coffee Companion Metro is healthy at `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set), and `helpers/control doctor` is green.
- Drive is React Native Testing Library in-process with an injected session and a fake Coffees API. It does not call the live API.

- **Search and open a Coffee.** Run `helpers/control drive coffees`. The drive taps `testID=tab-coffees`, types each searchable field into `testID=coffee-search`, opens `testID=coffee-row-coffee-lintong`, and reads the Brews on `testID=coffee-detail`. `tree.txt` must show `Sumatra Lintong`, `Indonesia, Lintong, Wet-Hulled`, `Grind 24 · Dose 15g · Water 250g · Ratio 1:16.67 · Time 2m 45s`, and the Sealed copy.
- **Device (iOS Simulator or Android emulator).** Start the web app on `VERIFY_PORT` with the e2e seed (as `launch-device` does), then start Metro as the Free persona and run the flow from the sign-in screen:
  - `cd apps/mobile && CI=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:3910 EXPO_PUBLIC_E2E_USER=e2e-user-free pnpm exec expo start --dev-client --port 8081 --clear`
  - `maestro --device <simulator UDID or emulator-5554> test .cursor/skills/verify-mobile/flows/browse-coffees.yaml`
  - It searches `wet-hulled`, opens Sumatra Lintong, and expects its seeded Shot to be Sealed, since that Coffee is off Free's Shelf. Back keeps the search; searching `kenya` and opening Kenya Nyeri shows a readable Shot. Screenshots `coffees-list`, `coffees-search`, `coffee-detail-sealed` and `coffee-detail-readable` are the proof.

## Gotchas

- Search reads only the Coffee's own fields, never its Brews.
- `launch-device` and `verify-device` always sign in as `e2e-user-with-data`, which holds a Grant, so nothing is Sealed for it, and the device recipe above fails on purpose there. Start Metro yourself as shown. `launch-device` also writes `apps/mobile/.env.development.local`, which wins over the shell's `EXPO_PUBLIC_E2E_USER`; run `helpers/control cleanup` first. Cleanup restores a developer's own copy of that file, so then check that `apps/mobile/.env.development.local` is absent or sets no `EXPO_PUBLIC_E2E_USER` other than `e2e-user-free`.
- On iOS, a tap on a row under the keyboard types a letter, and Maestro's `hideKeyboard` can open another row. Narrow the search so the row sits above the keyboard.
- Handles live in `apps/mobile/src/coffees/copy.ts`.
