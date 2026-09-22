# Privacy

The public privacy page names every company Coffee Companion sends data to, what each one receives, and how a user can export their own data. A signed-out visitor reaches it from the marketing footer; `/privacy` is public even when signed in.

## Sub-features

- `privacy-open` renders at `/privacy` with heading `What we collect, and who we send it to`.
- `privacy-footer` reaches it from the marketing footer `Privacy` link.
- `privacy-recipients` lists Sentry, PostHog, Google, Stripe, and Resend, each with a policy link.
- `privacy-own-data` states that account export covers Sealed Brews and that there is no self-serve delete yet.

## How to get to it (user POV)

- Choose `Privacy` in the footer navigation named `Footer` (home or pricing).
- Open `/privacy` directly.

## Driving it with control

Preconditions:

- Coffee Companion is healthy at `http://127.0.0.1:3000`.
- Identity is `public`.
- `helpers/control doctor` reports the expected URL and `coffee_companion_test`.

- **Footer.** Run `helpers/control browser as public` and `helpers/control browser goto --path /`. Click link `Privacy`. The URL ends with `/privacy` and the heading matches `/what we collect/i`.
- **Recipients.** Every recipient heading is visible. Run `helpers/control browser expect --role heading --name Sentry --exact`, then the same for `PostHog`, `Google`, `Stripe`, and `Resend`.
- **Own data.** Text matching `/exported from your account page/i` is visible. Heading `Your own data` is visible.
- **Direct.** Run `helpers/control browser goto --path /privacy`. The same heading is visible. Both screenshots show the marketing header `Coffee Companion`.
- **Proof.** Run `helpers/control browser screenshot --path artifacts/<run>/privacy/page.png` and `helpers/control browser snapshot --aria --path artifacts/<run>/privacy/page.aria.txt` on `/privacy`.

## Gotchas

- Identity `data` or `free` still can open `/privacy` (it is not behind auth). Prove the footer path as `public` so `/` is the marketing home rather than a dashboard redirect.
- `Privacy` lives in the footer, not the marketing header. The header's links are `Pricing` and `Sign in`.
- A bare `expect --text Sentry` matches the heading, the retention sentence, the policy link, and session-replay copy. Address recipients as headings (`--role heading --name Sentry --exact`).
- Canonical/social tags and `/sitemap.xml` (which lists `/privacy`) are not this feature's user path.
