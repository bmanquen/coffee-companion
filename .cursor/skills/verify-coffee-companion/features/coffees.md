# Coffees

Coffees is the user's library of roaster offerings. A user adds a Coffee, edits its name, deletes it, and reads whether it is Dialed-in from the row expander.

## Sub-features

- `coffees-list` lists the seeded library on `/coffees`.
- `coffees-create` saves a new Coffee from `/coffees/new`. Each Origin is a labeled group (country, optional region, optional process). More than one Origin is a blend.
- `coffees-picker-clash` type-creates a Roaster, then in another tab tries the same name in different case. The picker keeps Add (that tab's list is stale) and the alert names the saved casing.
- `coffees-edit` renames a Coffee from that row's `Edit coffee` control, and can add or remove Origin groups.
- `coffees-delete` removes a Coffee after the confirm dialog.
- `coffees-dial-in` shows Yes in the expanded row when the coffee has at least one Dialed-in Brew.

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

- **List.** Run `helpers/control browser as data` and `helpers/control browser goto --path /coffees`. Heading `Coffees` is visible and `Ethiopia Guji` appears (`expect --text "Ethiopia Guji" --first` — desktop row and mobile card both render the name). Country `Ethiopia` and region `Guji` are their own cells (`expect --role cell --name Ethiopia --exact --first`, then the same for `Guji`) — exact so the name cell "Ethiopia Guji" does not count.
- **Create.** Open `/coffees/new`. Run `helpers/control browser goto --path /coffees/new`. Click visible text `Select Roaster`, then `Sey` (exact). Click `Select Roast Level`, then `Medium` (exact). Fill placeholder `Name` with `"E2E Coffee <unique>"`. Click button `Add` (exact). The URL is `/coffees` and the new name is visible (`--first`).
- **Picker clash.** Identity `data`. Run `helpers/control browser goto --path /coffees/new`. Click visible text `Select Roaster` (this tab now holds the list). Run `helpers/control browser tab new`. Run `helpers/control browser goto --path /coffees/new`. Click `Select Roaster`. Fill placeholder `Search...` with `"Kaffa Lab <unique>"`. Click `--role option --name "/Add .+/"`. The Roaster trigger shows that name (`expect --text "Kaffa Lab <unique>" --first` — the option can still be in the closing popover). Run `helpers/control browser tab --index 0`. Fill placeholder `Search...` with the same name in lowercase. Click `--role option --name "/Add .+"`. Alert text is `You already have one called Kaffa Lab <unique>. Pick it there, or give this one a different name.` (`expect --role alert`, then `expect --text "/You already have one called/"` and `expect --text "/Pick it there, or give this one a different name/"` — `expect --role alert --name` does not match this popover alert).
- **Edit.** Create a uniquely named Coffee the same way. It lands as the first row. Run `helpers/control browser click --role button --name "Edit coffee" --first`. Heading `Edit Coffee` appears. Fill placeholder `Name` with the updated title and click `Save`. The list shows the new name and not the exact old one.
- **Delete.** Create a uniquely named Coffee. Run `helpers/control browser click --role button --name "Delete coffee" --first`, then confirm with button `Delete` (exact). The name is gone.
- **Proof.** After create (before delete), run `helpers/control browser screenshot --path artifacts/<run>/coffees/list.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/coffees/list.aria.txt` on `/coffees`. Both show heading `Coffees` and the unique name. Delete the unique Coffee before the next feature; keep the artifacts. After picker clash, capture the open picker with the alert (`artifacts/<run>/coffees/picker-clash.png` and `.aria.txt`).

## Gotchas

- SearchSelect's accessible name is not the visible `Select Roaster` label. Click the visible text, then the option. An empty submit stays on `/coffees/new` and shows `Enter a name`, `Select a roaster`, and `Select a roast level` next to those fields. Pick the SearchSelects before filling `Name` so the first post-navigation action is a click (hydration).
- `Add` (create) and `Save` (edit) are different buttons. `Delete coffee` opens the dialog; the dialog's confirm is exactly `Delete`. Row actions are not unique; after a create the new Coffee is first — use `--first`.
- Name uniqueness is per user per roaster. Timestamp the name so a retry does not collide. A blend occupies that same uniqueness — it cannot share a roaster and name with another Coffee.
- Lookup names (Roaster, Roast Level, Country, Process) are unique per user, ignoring case. After a name is in the loaded list, typing it in a different case offers the saved-casing option and hides Add — that is not the alert. The alert needs a stale list: load the picker, save the name in another tab (`browser tab new`), then Add the lowercase on the first tab (`browser tab --index 0`). `as` resets tabs. After Add, `expect --text "<unique>"` without `--first` fails strict mode: the trigger and the closing popover option both contain the name.
- The picker's Add row is `role=option` whose name is `Add “<typed>”` (curly quotes). `click --role button --name "/Add .*/"` on `/coffees/new` hits `Add origin` or the form `Add`.
- The clash alert is `role=alert` whose accessible name is empty. `expect --role alert --name "/You already have one called/"` times out. Assert `expect --role alert` plus `expect --text` for the sentence.
- Expanding a row to read Dialed-in is a click on the name cell of the desktop table (`apps/web/e2e/helpers.ts` `expandRow`, or `click --role cell --name "Sumatra Lintong" --exact`). On `data`, Sumatra Lintong's expander shows `Yes`. Membership still counts when the Brew is Sealed on `free`.
- A bare `expect --text Ethiopia` matches the name cell "Ethiopia Guji". Address country and region as cells (`expect --role cell --name Ethiopia --exact --first`, then the same for `Guji`).
- Do not edit or delete seeded Coffees (`Ethiopia Guji`, the E2E_LIBRARY names). Create your own, then remove them.
- Roaster `Sey` exists only on `data`. Identity `empty` has no roaster to pick; type-create one or skip the roaster.
