# Dashboard

The dashboard is the signed-in home: one method picker and that method's brew feed, with a link to log the next Shot or Brew.

## Sub-features

- `dashboard-open` renders at `/dashboard` and is where `/` sends a signed-in visitor.
- `dashboard-chrome` shows the signed-in shell (Open menu, Account menu) and not `Sign in with Google`.
- `dashboard-picker` lists every method alphabetically and switches the feed.
- `dashboard-deeplink` honours `?method=` on load and keeps it across reload and back.
- `dashboard-log` points Log Shot / Log Brew at the selected method's new-brew route.

## How to get to it (user POV)

- Open `/dashboard` while signed in.
- Open `/` while signed in (redirects).
- Choose `Home` in the desktop `Open menu` sheet or the mobile `Primary` nav.
- Open `/dashboard?method=espresso` (or `pourover`, `frenchpress`, `aeropress`, `coldbrew`).

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `data`.
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Open dashboard.** Run `helpers/control browser as data` and `helpers/control browser goto --path /dashboard`. The heading is `Dashboard`. Button `Sign in with Google` has count `0`.
- **Redirect from root.** Run `helpers/control browser goto --path /`. The URL ends with `/dashboard` and the heading is still `Dashboard`.
- **Chrome.** `button[aria-label="Account menu"]` is attached. Run `helpers/control browser click --role button --name "Open menu"`. Link `Home` (exact) has `href` `/dashboard`. Links `Coffee`, `Brews`, and `Equipment` are visible.
- **List methods.** Run `helpers/control browser goto --path /dashboard?method=espresso`. Click the picker trigger `Espresso` (exact). Options read AeroPress, Cold Brew, Espresso, French Press, Pour Over, in that order.
- **Switch to AeroPress.** Choose option `/AeroPress/`. Text `Standard` is visible and link `/Log Brew/i` has `href` `/aeropress/new`.
- **Switch back to Espresso.** Click the `AeroPress` trigger, then option `/Espresso/`. Link `/Log Shot/i` has `href` `/espresso/new`.
- **Deep link Cold Brew.** Run `helpers/control browser goto --path /dashboard?method=coldbrew`. Trigger `Cold Brew` is visible and `/Log Brew/i` has `href` `/cold-brew/new`.
- **URL write.** From `?method=espresso`, choose Cold Brew. The URL matches `[?&]method=coldbrew`.
- **Reload and back.** Open `?method=pourover`, reload: trigger still `Pour Over`. From `espresso`, switch to Cold Brew, then go back: trigger is `Espresso` again.
- **Proof.** On `/dashboard?method=espresso` with the picker closed, run `helpers/control browser screenshot --path artifacts/<run>/dashboard/espresso.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/dashboard/espresso.aria.txt`. Both show heading `Dashboard` and a Log Shot link.

## Gotchas

- The picker trigger's accessible name is the current method, not "Method". After a switch you must click the new name.
- Options include last-brewed relative time (`just now`, `2d ago`, `No brews yet`). Match option names with `/AeroPress/` (or the method word), not the exact full string.
- Cold Brew has no seeded brews on `data`. Deep-link it; do not expect a row.
- `Open menu` is desktop-only (`hidden lg:inline-flex`). At a mobile viewport use `Primary` nav or `Account menu` instead.
- The feed pages at five. Sealed Free brews are not on page one — that proof belongs in [Plans and Shelf](./plans-and-shelf.md).
- Dashboard feeds are reference-only. Edit, delete, and Dialed-in toggles live on Brews.
