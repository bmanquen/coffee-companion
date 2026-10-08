# Plans and Shelf

A Plan decides how much of the user's own past is readable. Free's Shelf is the five most-recently-brewed Coffees; the rest Seal. Pro (including a Grant) reads the whole library. Logging is never limited. The account page shows the Plan a Grant confers, exports the library — including Sealed Brews — as JSON, and deletes the account behind a confirmation. Confirming deletion with identity `delete` offers restore on `/restore-account` for 30 days.

## Sub-features

- `plans-pricing` is the public catalogue of Free, Pro, and Pro+ (see [Marketing site](./marketing.md)).
- `plans-account` shows the Plan a Grant confers on `/account` as added to the account, with no `See plans` and no `Manage subscription`.
- `account-export` offers `Export data` on `/account` (a JSON download of Coffees and Brews, including Sealed ones).
- `account-delete` offers `Delete account` on `/account`. The delete card says account data is kept for 30 days. The confirmation says account data is kept for 30 days and that it can be restored, and puts `Export data` in the dialog. A live Subscription adds that it is cancelled now and paid time will not be refunded. A Grant adds that the Plan comes back on restore. It does not promise a PostHog person delete — that call is skipped when PostHog is not configured. Do not confirm it against `data`, `free`, or `empty`. Use identity `delete`.
- `account-restore` is offered after signing in during the 30-day window (the e2e bypass cookie still present is enough). `/restore-account` names the restore deadline as a calendar day in the browser's timezone, says account data is deleted on or after that day, says the Subscription stays cancelled, that restore does not start a new one, and that paid time will not be refunded. Confirming restore returns to the Dashboard. Live routes such as `/coffees` redirect here while pending.
- `shelf-pro` reads grind settings for every Coffee in the seeded library, including the two that would fall off Free.
- `shelf-free-sealed` marks off-Shelf brews `Sealed`, hides their settings, and links `Unlock` to `/pricing`.
- `shelf-free-on` keeps an on-Shelf Coffee fully readable.
- `shelf-log-off` still lets a Free user log a new Shot against an off-Shelf Coffee; the new Shot is readable and the old ones stay Sealed.

## How to get to it (user POV)

- Open `/pricing` (signed out or signed in).
- Choose `Account` from `Account menu` or the desktop `Open menu` sheet (`/account`).
- Confirm `Delete account` as identity `delete`, then land on `/restore-account` (live routes such as `/coffees` redirect here while pending).
- Open `/brews`, `/dashboard`, or `/coffees` as a Free user and read a Coffee that has fallen off the Shelf.
- Choose `Unlock` or `See plans` on a Sealed row.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- The shared library is the seeded E2E_LIBRARY. Off-Shelf (Free): Sumatra Lintong (dialed-in) and Brazil Cerrado. On-Shelf: Kenya Nyeri (most recent of the seven).
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Granted account.** Run `helpers/control browser as data` and `helpers/control browser goto --path /account`. Heading `Account` and exact text `Pro` are visible. Text `You're on Pro. This plan was added to your account, so there's no billing to manage.` is visible. Button `Manage subscription` has count `0`. Link `See plans` has count `0`. Button `Export data` is visible. Button `Delete account` is visible. The delete card says account data is kept for 30 days (`expect --text "/Export a copy first. Your account data is kept for 30 days, then deleted./"`) and that the Pro plan comes back on restore (`expect --text "/If you restore your account before .+ your Pro plan comes back with it/"`). Click `Delete account`. The dialog says account data is kept for 30 days (`expect --text "/account data is kept for 30 days/" --first` — the card and the dialog both contain that phrase), that it can be restored (`expect --text "/restore it during that time/"`), and that the Pro plan comes back (`expect --text "/your Pro plan comes back with it/" --first`). It does not say the Subscription is cancelled now (`expect --text "/Subscription is cancelled now/" --count 0`) or that paid time will not be refunded (`expect --text "/will not be refunded/" --count 0`). It does not mention PostHog (`expect --text PostHog --count 0`) and contains button `Export data`. Do not press the dialog's `Delete account` against `data`. Close with Escape.
- **Delete and restore.** Run `helpers/control browser as delete` and `helpers/control browser goto --path /account`. Click `Delete account` to open the dialog, then click `Delete account` again to confirm. The URL is `/restore-account` and heading `Restore account` is visible. Text matching `/Restore your account before [A-Za-z]+ [0-9]{1,2}, [0-9]{4} to keep it/` is visible, as is `/Your account data will be deleted on or after that day/`, `/Your Subscription stays cancelled/`, `/does not start a new one/`, and `/will not be refunded/`. Open `/coffees`: the URL is `/restore-account` again. Click `Restore account`. The URL is `/dashboard` and heading `Dashboard` is visible. Run `helpers/control seed` afterwards so the identity is not left pending, then `helpers/control browser as data` (`seed` restores rows; it does not switch the browser cookie).
- **Granted library.** Run `helpers/control browser as data` and `helpers/control browser goto --path /brews`. For each of Kenya Nyeri / Guatemala Huehuetenango / Rwanda Kivu / Peru Cajamarca / Burundi Kayanza / Sumatra Lintong / Brazil Cerrado, the row contains that coffee's grind setting (`21`–`27`). No `Sealed` text on `/dashboard`, `/brews`, or `/coffees`.
- **Granted dial-in.** On `/coffees`, expand Sumatra Lintong's desktop name cell (`click --role cell --name "Sumatra Lintong" --exact`). `Yes` is visible (`expect --text Yes --first`).
- **Free sealed brew.** Run `helpers/control browser as free` and `helpers/control browser goto --path /brews`. Sumatra Lintong's row shows `/^Sealed/` (`expect --text "/^Sealed/" --first`), link `Unlock` has `href` `/pricing` (`expect --role link --name Unlock --first`), and grind `26` is absent.
- **Free dashboard.** Run `helpers/control browser goto --path /dashboard?method=espresso`. Click `All coffees`, then option `Sumatra Lintong`. The row shows `Sealed` (`--first`) and not grind `26`. (The feed pages at five; filter rather than paging.)
- **Free on-Shelf.** On `/brews` as `free`, Kenya Nyeri's row shows grind `21` and no `Sealed`.
- **Free sealed dial-in.** On `/coffees` as `free`, expand Sumatra Lintong. `Yes` is still visible — membership remains when the Brew is Sealed.
- **Log still works.** As `free`, open `/espresso/new`. Pick coffee `Brazil Cerrado`. Off-Shelf shots do not prefill grinder or device — the triggers stay `Select Grinder` and `Select Brewing Device`. Click `Select Grinder`, then `Comandante C40` (exact). Click `Select Brewing Device`, then `Flair 58` (exact). Skip a pick when the trigger already shows that value — picking again clears it. Fill `--label "Dose (g)"` `18`, `--label "Yield (g)"` `36`, `--label "Time (s)"` `30`, `--label "Grind Setting"` with a unique marker. Click `Log`. On `/brews` the new grind is readable and not Sealed; a Brazil Cerrado row still shows `Sealed`.
- **Proof.** Capture `/brews` once as `data` and once as `free`. Run `helpers/control browser screenshot --path artifacts/<run>/plans/pro-brews.png` (identity `data`) and `helpers/control browser screenshot --path artifacts/<run>/plans/free-brews.png` (identity `free`), plus matching `--aria` snapshots. The pair must disagree on Sumatra Lintong: settings vs `Sealed`.

## Gotchas

- `data` and `free` hold the same library. The only difference is the Grant. If both identities read the same Sealed state, the seed is dirty — run `helpers/control seed`.
- Free's last test promotes Brazil Cerrado back onto the Shelf and displaces the fifth Coffee. Nothing else in this file should read the displaced Coffee. Re-seed before a second pass.
- SearchSelect: if the trigger already contains the target option, do not click it again. An off-Shelf Coffee's sealed shots do **not** prefill grinder or device — `Select Grinder` and `Select Brewing Device` stay until you pick `Comandante C40` and `Flair 58`. There is no `Select Device` placeholder.
- `Manage subscription` appears only for a live Stripe subscription. The `data` user has a Grant and no Subscription; its absence is correct.
- Subscribe / Join Waitlist on `/pricing` need Stripe or Resend. This instance has neither. Prove catalogue copy and the Free/Pro reading split, not a real purchase.
- Row matchers use the accessible name of the whole row (cells joined). A Coffee's name survives Sealing, so `row` + coffee name still addresses a Sealed row.
- `expect --text Sealed` without `--first` fails strict mode (desktop table + mobile card, and two off-Shelf Coffees).
- `expect --text "/account data is kept for 30 days/"` without `--first` fails strict mode: the delete card and the open dialog both contain that phrase.
- The delete dialog says paid time `will not be refunded`. `unused prepaid time is not refunded` is privacy-page copy, not the dialog.
- `/restore-account` formats the deadline after mount in the browser timezone (the day varies by zone; match the month-name pattern, not a fixed date).
- `Export data` starts a JSON download (`coffee-companion-export.json`). The control CLI does not assert file contents; visibility of the button plus the click is the user path. Equipment gear caps live in [Equipment](./equipment.md).
- Do not confirm `Delete account` against `data`, `free`, or `empty`. Those identities are shared. Open the dialog, read the copy, close it. Identity `delete` is the one that may confirm, restore, and be reseeded. `helpers/control seed` does not change the browser identity — run `browser as data` before Granted library / dial-in.
