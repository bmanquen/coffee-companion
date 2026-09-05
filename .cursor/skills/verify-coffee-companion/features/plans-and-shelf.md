# Plans and Shelf

A Plan decides how much of the user's own past is readable. Free's Shelf is the five most-recently-brewed Coffees; the rest Seal. Pro (including a Grant) reads the whole library. Logging is never limited.

## Sub-features

- `plans-pricing` is the public catalogue of Free, Pro, and Pro+ (see [Marketing site](./marketing.md)).
- `plans-account` shows the Plan a Grant confers on `/account`, with `See plans` and no `Manage subscription`.
- `shelf-pro` reads grind settings for every Coffee in the seeded library, including the two that would fall off Free.
- `shelf-free-sealed` marks off-Shelf brews `Sealed`, hides their settings, and links `Unlock` to `/pricing`.
- `shelf-free-on` keeps an on-Shelf Coffee fully readable.
- `shelf-log-off` still lets a Free user log a new Shot against an off-Shelf Coffee; the new Shot is readable and the old ones stay Sealed.

## How to get to it (user POV)

- Open `/pricing` (signed out or signed in).
- Choose `Account` from `Account menu` or the desktop `Open menu` sheet (`/account`).
- Open `/brews`, `/dashboard`, or `/coffees` as a Free user and read a Coffee that has fallen off the Shelf.
- Choose `Unlock` or `See plans` on a Sealed row.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- The shared library is the seeded E2E_LIBRARY. Off-Shelf (Free): Sumatra Lintong (dialed-in) and Brazil Cerrado. On-Shelf: Kenya Nyeri (most recent of the seven).
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Granted account.** Run `helpers/control browser as data` and `helpers/control browser goto --path /account`. Heading `Account` and exact text `Pro` are visible. Button `Manage subscription` has count `0`. Link `See plans` has `href` `/pricing`.
- **Granted library.** Run `helpers/control browser goto --path /brews`. For each of Kenya Nyeri / Guatemala Huehuetenango / Rwanda Kivu / Peru Cajamarca / Burundi Kayanza / Sumatra Lintong / Brazil Cerrado, the row contains that coffee's grind setting (`21`–`27`). No `Sealed` text on `/dashboard`, `/brews`, or `/coffees`.
- **Granted dial-in.** On `/coffees`, expand Sumatra Lintong's desktop name cell. `18g → 36g` is visible.
- **Free sealed brew.** Run `helpers/control browser as free` and `helpers/control browser goto --path /brews`. Sumatra Lintong's row shows `/^Sealed/`, link `Unlock` has `href` `/pricing`, and grind `26` is absent.
- **Free dashboard.** Run `helpers/control browser goto --path /dashboard?method=espresso`. Click `All coffees`, then option `Sumatra Lintong`. The row shows `Sealed` and not grind `26`. (The feed pages at five; filter rather than paging.)
- **Free on-Shelf.** On `/brews` as `free`, Kenya Nyeri's row shows grind `21` and no `Sealed`.
- **Free sealed dial-in.** On `/coffees` as `free`, expand Sumatra Lintong. `This Brew is Sealed` is visible and `See plans` has `href` `/pricing`.
- **Log still works.** As `free`, open `/espresso/new`. Pick coffee `Brazil Cerrado`, grinder `Comandante C40`, device `Flair 58` (skip a pick when the trigger already shows that value — picking again clears it). Fill dose `18`, yield `36`, grind placeholder `e.g. 2.5` with a unique marker. Click `Log`. On `/brews` the new grind is readable and not Sealed; a Brazil Cerrado row still shows `Sealed`.
- **Proof.** Capture `/brews` once as `data` and once as `free`. Run `helpers/control browser screenshot --path artifacts/<run>/plans/pro-brews.png` (identity `data`) and `helpers/control browser screenshot --path artifacts/<run>/plans/free-brews.png` (identity `free`), plus matching `--aria` snapshots. The pair must disagree on Sumatra Lintong: settings vs `Sealed`.

## Gotchas

- `data` and `free` hold the same library. The only difference is the Grant. If both identities read the same Sealed state, the seed is dirty — run `helpers/control seed`.
- Free's last test promotes Brazil Cerrado back onto the Shelf and displaces the fifth Coffee. Nothing else in this file should read the displaced Coffee. Re-seed before a second pass.
- SearchSelect: if the trigger already contains the target option, do not click it again.
- `Manage subscription` appears only for a live Stripe subscription. The `data` user has a Grant and no Subscription; its absence is correct.
- Subscribe / Join Waitlist on `/pricing` need Stripe or Resend. This instance has neither. Prove catalogue copy and the Free/Pro reading split, not a real purchase.
- Row matchers use the accessible name of the whole row (cells joined). A Coffee's name survives Sealing, so `row` + coffee name still addresses a Sealed row.
