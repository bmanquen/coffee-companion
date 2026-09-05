# Brews

Brews is the log of every Shot and Brew, tabbed by brewing method. A user reads history here and logs the next one from the method's `/…/new` form.

## Sub-features

- `brews-espresso` shows the Espresso tab (default) with Ethiopia Guji on `data`.
- `brews-aeropress` switches to the AeroPress tab and shows the Standard dialed-in brew.
- `brews-log-espresso` logs a Shot from `/espresso/new` (coffee select prefills grinder and device).
- `brews-log-aeropress` logs an AeroPress brew from `/aeropress/new`.
- `brews-roast-date` picks a roast date on the espresso form calendar.

## How to get to it (user POV)

- Choose `Brews` in the desktop `Open menu` sheet or the mobile `Primary` nav.
- Open `/brews`.
- Choose `Log Shot` or `Log Brew` on the dashboard feed.
- Open `/espresso/new`, `/aeropress/new`, `/pourover/new`, `/frenchpress/new`, or `/cold-brew/new`.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `data`.
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Espresso log.** Run `helpers/control browser as data` and `helpers/control browser goto --path /brews`. Heading `Brews` is visible and `Ethiopia Guji` appears (`.first()` — create-espresso can add more rows for the same coffee).
- **AeroPress tab.** Click tab `AeroPress`. Wait for `Standard` (that word is not on the Espresso tab, so it proves the switch). `Ethiopia Guji` remains visible.
- **Log espresso.** Run `helpers/control browser goto --path /espresso/new`. Click text `Select Coffee`, then `Ethiopia Guji` (exact). `Niche Zero` and `Linea Mini` replace the Select placeholders. Fill placeholders `18.0` → `18` and `36.0` → `36`. Click button `Log` (exact). The URL is `/brews` and heading `Brews` is visible.
- **Log AeroPress.** Run `helpers/control browser goto --path /aeropress/new`. Select `Ethiopia Guji`. `Standard`, `Niche Zero`, and `AeroPress Go` prefill. Fill `15.0` → `15` and `220` → `220`. Click `Log`. Land on `/brews`.
- **Roast date.** On `/espresso/new` with no coffee selected, click `Pick a date`, then a day button matching `/15th/`. `Pick a date` is gone.
- **Proof.** After logging, on `/brews` run `helpers/control browser screenshot --path artifacts/<run>/brews/espresso.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/brews/espresso.aria.txt`. Both show heading `Brews` and `Ethiopia Guji`. Extra shots from this run may remain; do not delete seeded rows to tidy the screenshot.

## Gotchas

- Gate the AeroPress switch on `Standard`, not on `Ethiopia Guji` — that coffee is also on the Espresso tab.
- SearchSelect: clicking the already-selected option clears the field. If the value is already right, leave it.
- Espresso submit is `Log`, not `Save`. Edit routes use `Save`.
- Pour Over, French Press, and Cold Brew have `/…/new` forms too; this map's live recipe starts with Espresso and AeroPress because those are what the seed fills. Drive the others when the change is about those methods.
- Identity `free` Seals off-Shelf rows on this page. Do not treat missing grind settings on Sumatra Lintong / Brazil Cerrado as a logging bug — see [Plans and Shelf](./plans-and-shelf.md).
- `clickUntil` applies on `/espresso/new`: `Select Coffee` is in the SSR HTML before the handler attaches.
