# Equipment

Equipment is the user's Grinders and Brewing Devices. A user adds, renames, and deletes gear here. Free caps how many they may hold; logging is never limited.

## Sub-features

- `equipment-grinders` lists grinders on `/equipment` (default tab) and creates / edits / deletes one.
- `equipment-devices` switches to `Brewing Devices` and creates a device with a type.
- `equipment-free-cap` replaces `Add Grinder` with a limit sentence and `See plans` when Free already holds one Grinder.

## How to get to it (user POV)

- Choose `Equipment` in the desktop `Open menu` sheet or the mobile `Primary` nav.
- Open `/equipment`.
- Choose `Add Grinder` or `Add Brewing Device`, or open `/equipment/grinders/new` or `/equipment/brewing-devices/new`.
- Choose `Edit grinder` / `Edit brewing device` on a row.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `data` for CRUD (Pro Grant, unlimited gear). Identity is `free` for the cap.
- No leftover Grinder or device titled with the `E2E Grinder` / `E2E Device` prefixes from a broken earlier run (seed if unsure).
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **List grinders.** Run `helpers/control browser as data` and `helpers/control browser goto --path /equipment`. Heading `Equipment` is visible, tab `Grinders` is selected, and `Niche Zero` appears (`expect --text "Niche Zero" --exact`).
- **List devices.** Click tab `Brewing Devices`. `Linea Mini` is visible (`expect --text "Linea Mini" --exact`).
- **Create grinder.** Run `helpers/control browser goto --path /equipment/grinders/new`. Fill `--label Name` and `--label Brand` with a unique name and `Test Brand`. Click button `Add` (exact). The URL is `/equipment` and the unique name is visible (`expect --text "<unique>" --exact` — without `--exact` the desktop cell and the mobile `Brand Name` card both match).
- **Edit / delete grinder.** After create, click `Edit grinder` on the row named the unique name (`click --role button --name "Edit grinder" --row "<unique>"`). Heading `Edit Grinder`, rename, `Save`. The new name is visible (`expect --text "<renamed>" --exact`). Click `Delete grinder` on the row named the current unique name (`click --role button --name "Delete grinder" --row "<unique>"`), confirm `Delete` (exact). The unique name is gone (`expect --text "<renamed>" --count 0`).
- **Create device.** Run `helpers/control browser goto --path /equipment/brewing-devices/new`. Fill Name and Brand. Click `Select Type`, then option `Espresso` (exact). Click `Add`. Land on `/equipment` (Grinders tab). Click tab `Brewing Devices`; the unique name is visible (`expect --text "<unique>" --exact`). Delete it with `Delete brewing device` on the row named the unique name (`click --role button --name "Delete brewing device" --row "<unique>"`) then `Delete`.
- **Free cap.** Run `helpers/control browser as free` and `helpers/control browser goto --path /equipment`. `Comandante C40` is visible. Text `Free holds 1 Grinder. Subscribe to add more.` and link `See plans` (`href` `/pricing`) replace `Add Grinder`.
- **Proof.** On `/equipment` as `data` (Grinders) run `helpers/control browser screenshot --path artifacts/<run>/equipment/grinders.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/equipment/grinders.aria.txt`. Both show heading `Equipment` and a grinder name. As `free`, capture the cap sentence on the same path.

## Gotchas

- `/equipment` always opens on Grinders. A new brewing device is created on `/equipment/brewing-devices/new` but the landing list is the Grinders tab — switch tabs to see it.
- Exact name match: the mobile card renders `Brand Name`, so a substring of the name can hit two elements.
- Free already holds one Grinder (`Comandante C40`), which is the cap. Do not treat a missing `Add Grinder` as a bug on `free`. Free may still add Brewing Devices (cap is three; the seed has one).
- Grinders and Brewing Devices sort by name, not recency. `--first` on `Edit` / `Delete` can hit seeded gear (`Comandante C40`, `AeroPress Go`). Scope those actions with `--row` and the unique name you just created (same handle as `apps/web/e2e/grinder.data.spec.ts`).
- Do not edit or delete seeded gear (`Niche Zero`, `Linea Mini`, `AeroPress Go`, `Comandante C40`, `Flair 58`). Create your own, then remove them.
- SearchSelect on device type: click `Select Type`, then the option. Picking the selected option again clears it.
