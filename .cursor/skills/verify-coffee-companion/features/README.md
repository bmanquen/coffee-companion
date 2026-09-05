# Coffee Companion verification map

This directory is the maintained source for verifying the user-facing behavior of Coffee Companion. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.cursor/skills/verify-coffee-companion/helpers/control launch`.
- Require `helpers/control doctor` to report `ok: true`, `baseUrl` `http://127.0.0.1:3000` (or the `VERIFY_PORT` you set), database `coffee_companion_test`, and app marker `Coffee Companion`.
- Never drive an instance that was not started by this verification run. A server already on port 3000 is the development app.
- Public routes use identity `public` (no `e2e_auth` cookie). Signed-in routes use `data`, `empty`, or `free` as the feature file says.
- Seeded `data` / `free` library (most recently brewed first): Kenya Nyeri, Guatemala Huehuetenango, Rwanda Kivu, Peru Cajamarca, Burundi Kayanza, Sumatra Lintong, Brazil Cerrado. Extra on `data` only: Ethiopia Guji (most recent Shot), roaster Sey, Niche Zero, Linea Mini, AeroPress Go / Standard dialed-in brew.
- Restore seeded data with `helpers/control seed` after a mutation. Do not remove proof artifacts during cleanup.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run browser actions through `helpers/control browser`.
- The desktop table and the mobile card stack both render the same Coffee/Brew names. Scope list assertions to `div.lg\\:block table` (or use `.first()`) so one row does not count as two.
- After a `page.goto`-style navigation, the first click can land before hydration. The control daemon retries; a raw Playwright spec must use `clickUntil` from `apps/web/e2e/helpers.ts`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with Coffee Companion chrome visible (marketing header or a signed-in page heading).
- Mutation proof includes a read-only second view of the stored value (list or detail after navigate-away).
- Record the feature ID, identity, and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Marketing site](./marketing.md) covers the public home pitch, the hero brew table, and pricing (plans, period toggle, FAQ). This is the only feature with a `helpers/control drive marketing` shortcut.
- [Dashboard](./dashboard.md) covers the signed-in home, method picker, and per-method log links. Mapped; drive with `browser` commands — no `drive dashboard` stub yet.
- [Coffees](./coffees.md) covers the Coffee list and create / edit / delete. Mapped; drive with `browser` commands — no `drive coffees` stub yet.
- [Brews](./brews.md) covers the brew log tabs and logging an Espresso Shot or AeroPress brew. Mapped; drive with `browser` commands — no `drive brews` stub yet.
- [Plans and Shelf](./plans-and-shelf.md) covers Pro vs Free reading, Sealed brews, and the account Plan. Mapped; drive with `browser` commands — no `drive plans-and-shelf` stub yet.
