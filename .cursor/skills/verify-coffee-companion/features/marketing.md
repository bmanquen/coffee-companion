# Marketing site

The public site pitches Coffee Companion and sells Plans. A signed-out visitor sees the home page and pricing; a signed-in visitor is redirected from `/` to `/dashboard` but can still open `/pricing`.

## Sub-features

- `marketing-home` shows the pitch, a way in, and a hero table with a Dialed-in brew.
- `marketing-pricing-nav` reaches pricing from the marketing header.
- `marketing-plans` renders Free, Pro, and Pro+ with the period toggle.
- `marketing-faq` opens the sealing answer.
- `marketing-checkout-return` keeps a pre-signin Subscribe press on the period it was pressed on, without buying anything.

## How to get to it (user POV)

- Open `/` while signed out.
- Choose `Pricing` in the header navigation named `Marketing`.
- Open `/pricing` directly.
- Open `/pricing?checkout=pro&period=monthly` after pressing Subscribe before signing in.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `public`.
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Open home.** Run `helpers/control browser as public` and `helpers/control browser goto --path /`. The heading reads `Dial it in once. Never guess again.` and a button matching `/save your first brew/i` is visible.
- **Hero table.** The page `role=table` is visible, contains `Ethiopia Guji`, and exposes an accessible name `Dialed in`.
- **Header pricing.** Choose `Pricing` in the marketing header. Run `helpers/control browser click --role link --name Pricing`. The URL ends with `/pricing` and the heading matches `/keep your history/i`.
- **Plans.** Every plan heading is visible. Run `helpers/control browser expect --role heading --name Free --exact`, then the same for `Pro` and `Pro+`.
- **Period toggle.** Annual `$44.99` is visible first. Run `helpers/control browser click --role button --name Monthly --exact`. `$4.99` appears and `$44.99` is gone.
- **FAQ.** Open `/pricing` and choose the question about old brews. Run `helpers/control browser goto --path /pricing` then `helpers/control browser click --role button --name "/what happens to my old Brews/i"`. Text matching `/your Shelf/i` and `/Nothing is ever deleted/i` is visible.
- **Checkout return.** Run `helpers/control browser goto --path "/pricing?checkout=pro&period=monthly"`. `$4.99` is visible, the `Monthly` button has `aria-pressed=true`, the URL has dropped the query, and a `Subscribe` button remains (nothing is bought).
- **Proof.** Capture home and pricing. Run `helpers/control drive marketing`, or `helpers/control browser screenshot --path artifacts/<run>/marketing/home.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/marketing/home.aria.txt` on `/`, then the same pair on `/pricing`. Both screenshots show the marketing header `Coffee Companion`.

## Gotchas

- Identity `data` or `free` on `/` redirects to `/dashboard`. Prove marketing as `public`.
- `Pricing` is in the header and the footer. Click the header (`navigation` named `Marketing`) or you may scroll the footer instead.
- DataTable renders a desktop table and a mobile card stack. At 1280px the table is the one to assert; a loose `getByText('Ethiopia Guji')` matches both.
- Default billing period is annual (`$44.99`). Assert `$4.99` only after pressing `Monthly`.
- `Subscribe` on this instance does not open Stripe Checkout (no `STRIPE_SECRET_KEY`). Do not treat a missing redirect as a product bug here.
- Canonical/social tags and `/sitemap.xml` are public too; they are not this feature's user path. Drive them only when the change is about those tags.
