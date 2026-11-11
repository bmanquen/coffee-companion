# Log an Espresso Shot

A signed-in user logs an Espresso Shot from the home list: pick a Coffee, enter Shot settings, save, and see the Shot in the list. Plan limits stay on the shared API, so a Sealed Shot appears in the list with its settings withheld.

## Sub-features

- `espresso-list` shows the Espresso log on signed-in home, or `No espresso shots yet.` when empty.
- `espresso-log` opens `Log Espresso Shot`, prefills grinder and device from the Coffee's latest unsealed Shot, saves with `Log`, and returns to the list.
- `espresso-sealed` shows `Sealed — Subscribe to Pro to read this brew` on a Sealed row instead of grind, dose, yield, and time.

## How to get to it (user POV)

- Open the app while signed in. The Espresso list is the home screen.
- Choose `Log Shot`.
- After save, the new Shot is the first row on that list.

## Driving it with control

Preconditions:

- Coffee Companion Metro is healthy at `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set).
- `helpers/control doctor` reports the expected URL, `packager-status:running`, and app marker `Coffee Companion`.
- `drive espresso` re-checks that Metro is answering before it renders. A state file alone is not enough.
- Drive is React Native Testing Library in-process. No device is attached.
- Drive injects a signed-in session and a fake catalog (Ethiopia Guji, Niche Zero, Linea Mini). It does not mint a real Google or Apple token and does not call the live API.

- **Log a Shot.** Run `helpers/control drive espresso`. The drive opens `testID=select-trigger-coffee`, chooses `testID=select-option-00000000-0000-4000-8000-000000000001` on the sheet, fills the recipe fields, and saves. The host tree after save contains `shot-list`, `Ethiopia Guji`, and `Grind verify-grind-7 · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`. The create payload includes coffee id `00000000-0000-4000-8000-000000000001`, dose `18`, yield `36`, time `30`, and grind `verify-grind-7`.
- **Device (where an AVD exists).** Run `helpers/control drive-device log-espresso`. Maestro opens the Coffee picker by `select-trigger-coffee` and chooses `select-option-00000000-0000-4000-8000-000000000001`.
- **Proof.** `drive espresso` writes `artifacts/<run>/espresso/tree.txt`, `tree.json`, and `proof.json`. `tree.txt` must show `Coffee Companion`, `shot-list`, and `Grind verify-grind-7 · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`. There is no device screenshot from this harness.

## Gotchas

- This is not an iOS Simulator or Android emulator run. A green `drive espresso` does not prove pixels on a phone.
- Native Google and Apple sheets are not presented. The session is the same injected `Auth` the welcome drive uses.
- The live tRPC client is not exercised here. The request proof is the `create` payload the screen submitted to the injected API.
- Prefill only copies grinder, device, and roast date from the latest unsealed Shot. Dose, yield, time, and grind stay blank until typed.
- Brewing Device options are Espresso-type only. An AeroPress device in the catalog must not appear.
- `testID` and `accessibilityLabel` live in `apps/mobile/src/espresso/copy.ts` and `apps/mobile/src/ui/fields.tsx`. Drive those handles, not coordinates. Open a picker by `select-trigger-*`, then choose `select-option-<id>` on the sheet. Coffee options include the roaster when one is set (`Ethiopia Guji · Sey`) so same-named coffees stay distinct.
