# Coffees

Coffees is the user's library of roaster offerings. A user adds a Coffee, edits its name, deletes it, and reads Dialed-in settings from the row expander.

## Sub-features

- `coffees-list` lists the seeded library on `/coffees`.
- `coffees-create` saves a new Coffee from `/coffees/new`.
- `coffees-edit` renames a Coffee from that row's `Edit coffee` control.
- `coffees-delete` removes a Coffee after the confirm dialog.
- `coffees-dial-in` shows Dialed-in espresso settings in the expanded row (or a Sealed notice on Free).

## How to get to it (user POV)

- Choose `Coffee` in the desktop `Open menu` sheet or the mobile `Primary` nav.
- Open `/coffees`.
- Choose `Add Coffee` on the list, or open `/coffees/new`.
- Choose `Edit coffee` on a row.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `data`.
- No leftover Coffee titled with the `E2E Coffee` / `E2E Edit` / `E2E Delete` prefixes from a broken earlier run (seed if unsure).
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **List.** Run `helpers/control browser as data` and `helpers/control browser goto --path /coffees`. Heading `Coffees` is visible and `Ethiopia Guji` appears (use `.first()` — desktop row and mobile card both render the name).
- **Create.** Open `/coffees/new`. Run `helpers/control browser goto --path /coffees/new`, `helpers/control browser fill --placeholder Name --value "E2E Coffee <unique>"`. Click visible text `Select Roaster`, then `Sey` (exact). Click button `Add` (exact). The URL is `/coffees` and the new name is visible.
- **Edit.** Create a uniquely named Coffee the same way. On its desktop row, click `Edit coffee`. Heading `Edit Coffee` appears. Fill placeholder `Name` with the updated title and click `Save`. The list shows the new name and not the exact old one.
- **Delete.** Create a uniquely named Coffee. On its desktop row, click `Delete coffee`, then confirm with button `Delete` (exact). The name is gone.
- **Proof.** After create (before delete), run `helpers/control browser screenshot --path artifacts/<run>/coffees/list.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/coffees/list.aria.txt` on `/coffees`. Both show heading `Coffees` and the unique name. Delete the unique Coffee before the next feature; keep the artifacts.

## Gotchas

- SearchSelect's accessible name is not the visible `Select Roaster` label. Click the visible text, then the option.
- `Add` (create) and `Save` (edit) are different buttons. `Delete coffee` opens the dialog; the dialog's confirm is exactly `Delete`.
- Name uniqueness is per user. Timestamp the name so a retry does not collide.
- Expanding a row to read Dialed-in settings is a click on the name cell of the desktop table (`apps/web/e2e/helpers.ts` `expandRow`). On `data`, Sumatra Lintong's expander shows `18g → 36g`. On `free`, that same Coffee shows `This Brew is Sealed` — see [Plans and Shelf](./plans-and-shelf.md).
- Do not edit or delete seeded Coffees (`Ethiopia Guji`, the E2E_LIBRARY names). Create your own, then remove them.
- Roaster `Sey` exists only on `data`. Identity `empty` has no roaster to pick; type-create one or skip the roaster.
