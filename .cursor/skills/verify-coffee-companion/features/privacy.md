# Privacy

The public privacy page names every company Coffee Companion sends data to, what each one receives, and how a user can export or delete their own data. A signed-out visitor reaches it from the marketing footer; `/privacy` is public even when signed in.

## Sub-features

- `privacy-open` renders at `/privacy` with heading `What we collect, and who we send it to`.
- `privacy-footer` reaches it from the marketing footer `Privacy` link.
- `privacy-recipients` lists Sentry, PostHog, Google, Apple, Stripe, and Resend, each with a policy link. Apple's retention says we keep Apple’s refresh token for as long as the account exists and for 30 days after you delete it so you can restore it. It does not say deletion revokes the Apple sign-in.
- `privacy-own-data` states that everything the app holds can be exported from the account page on any plan (including what a plan hides from view), and that the account can be deleted from that same page. If you delete your account, we keep your account data for 30 days so you can restore it, then delete it. Deleting cancels a live Subscription immediately, and unused prepaid time is not refunded. It does not promise a PostHog person delete when that call is not configured.

## How to get to it (user POV)

- Choose `Privacy` in the footer navigation named `Footer` (home or pricing).
- Open `/privacy` directly.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `public`.
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Footer.** Run `helpers/control browser as public` and `helpers/control browser goto --path /`. Click link `Privacy`. The URL ends with `/privacy` and the heading matches `/what we collect/i`.
- **Recipients.** Every recipient heading is visible. Run `helpers/control browser expect --role heading --name Sentry --exact`, then the same for `PostHog`, `Google`, `Apple`, `Stripe`, and `Resend`. Under Apple, text matching `/refresh token for as long as the account exists/i` and `/30 days after you delete it so you can restore it/i` is visible. Text matching `/revoke/i` has count `0`.
- **Own data.** Text matching `/exported from your account page/i` is visible. Text matching `/delete the account from that same page/i` is visible. Text matching `/keep your account data for 30 days so you can restore it/i` is visible. Text matching `/Deleting cancels a live Subscription immediately/i` is visible. Text matching `/unused prepaid time is not refunded/i` is visible. Text matching `/no expiry until it is deleted in PostHog/i` is visible (`expect --first` — the PostHog recipient retention and this paragraph both contain that phrase). Heading `Your own data` is visible.
- **Direct.** Run `helpers/control browser goto --path /privacy`. The same heading is visible. Both screenshots show the marketing header `Coffee Companion`.
- **Proof.** Run `helpers/control browser screenshot --path artifacts/<run>/privacy/page.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/privacy/page.aria.txt` on `/privacy`.

## Gotchas

- Identity `data` or `free` still can open `/privacy` (it is not behind auth). Prove the footer path as `public` so `/` is the marketing home rather than a dashboard redirect.
- `Privacy` lives in the footer, not the marketing header. The header's links are `Pricing` and `Sign in`.
- A bare `expect --text Sentry` matches the heading, the retention sentence, the policy link, and session-replay copy. Address recipients as headings (`--role heading --name Sentry --exact`).
- Apple token copy lives under the Apple recipient, not under `Your own data`. Account delete on `/account` does not mention Apple or revoke — that proof stays here. A match for `/revoke/i` is a product regression, not a missing sentence to add.
- A bare `expect --text "/no expiry until it is deleted in PostHog/i"` matches the PostHog recipient retention and the Your own data paragraph. Use `--first`.
- Canonical/social tags and `/sitemap.xml` (which lists `/privacy`) are not this feature's user path.
