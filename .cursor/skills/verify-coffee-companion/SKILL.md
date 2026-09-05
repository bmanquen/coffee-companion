---
name: verify-coffee-companion
description: Drive the Coffee Companion web UI the way a user does — launch a disposable test-database instance, exercise marketing and signed-in flows through Playwright, and capture proof. Use when you need to prove a UI change, reproduce a user-facing bug, or verify a mapped feature live.
---

# Verify Coffee Companion

Coffee Companion is a personal coffee-brewing tracker. The surface a user touches is the **web UI** (`apps/web`, TanStack Start). The API is tRPC inside that same process, not a separate service. There is no CLI product.

This skill is for the next agent, mid-task. Drive the running app. Do not substitute unit tests, tRPC calls, or direct database writes for a user-path proof.

Read `features/README.md` before driving. Use the matching feature file as the recipe.

## Launch

Start a dedicated verification instance. Never reuse a process already bound to port 3000 — that is a `pnpm dev` server on the development database, without the e2e auth bypass.

From the repo root:

```bash
.cursor/skills/verify-coffee-companion/helpers/control launch
```

Launch does all of this, in order:

1. Refuses if `.run/state.json` already records a live pid, or if `VERIFY_PORT` (default `3000`) is taken.
2. Runs `pnpm install --frozen-lockfile` when `node_modules` is missing.
3. Ensures a local Postgres database named `coffee_companion_test` via `helpers/ensure-postgres.sh`. That script is **verification scaffolding**: it may install Postgres and create the throwaway database. It starts whichever cluster `pg_lsclusters` lists (the Ubuntu `postgresql` package here is 16; CI's service container is 17 — majors may differ, the throwaway `*_test` database is what matters). Auth is `VERIFY_DATABASE_URL`, or `VERIFY_DB_PASSWORD`, or an ephemeral password generated at runtime. The connection string is written to `.run/database.url` (gitignored, mode 600). Stdout is only `ok host:port/db` — never a URI with a password. **Boundary (same as `packages/api/test/database.ts`):** host must be loopback (`127.0.0.1`, `localhost`, `::1`) and the database name must end with `_test`. `VERIFY_DATABASE_URL` and `VERIFY_DB_NAME` / `VERIFY_DB_HOST` are refused otherwise — a reachable non-test URL is not used.
4. Applies migrations with `pnpm db:migrate` against that URL.
5. Seeds the e2e bypass users (`e2e-user-with-data` on a Pro Grant, `e2e-user-free` on Free, same library). The empty identity is left unseeded.
6. Always rebuilds `apps/web` with `pnpm --filter coffee-companion build`. Existence of `.output` is not enough: a leftover build from another branch would invalidate the proof. The production build is short (~15s here); launch does not reuse a stale artifact.
7. Starts `node apps/web/.output/server/index.mjs` with `DATABASE_URL`, `PORT`, and `E2E_BYPASS_AUTH=true`. `BETTER_AUTH_SECRET` and `GOOGLE_CLIENT_SECRET` come from the environment or are generated for this process; they are not literals in the skill. Billing stays off (no `STRIPE_SECRET_KEY`).
8. Waits until `GET http://127.0.0.1:$PORT` answers. Writes `.cursor/skills/verify-coffee-companion/.run/state.json`.

Ready signal: launch prints JSON with `ok: true`, `baseUrl`, and `serverPid`. Default URL is `http://127.0.0.1:3000`.

Isolation:

- One verification instance at a time on a given port. A second `launch` must fail closed rather than attach to the first.
- Side-by-side runs need both `VERIFY_PORT` and a distinct `VERIFY_DB_NAME` (still ending in `_test`). Default is to refuse, not to share.
- Do not export a development `DATABASE_URL`. Launch refuses anything that is not loopback + `*_test`, matching `loadTestDatabaseUrl`.

Human-facing `pnpm dev` (turbo, Vite on port 3000, `.env.local`) is the wrong server for this skill: no auth bypass, development data.

Teardown is `helpers/control cleanup` (see Cleanup). Run cleanup after every failed iteration too.

## Doctor

Read-only. Run this first whenever anything looks off, and again after a failed drive.

```bash
.cursor/skills/verify-coffee-companion/helpers/control doctor
```

Doctor is green only when all of these hold:

- The pid in `.run/state.json` is alive.
- That pid owns `VERIFY_PORT` (`lsof -t -iTCP:$PORT -sTCP:LISTEN`; `ss` is a fallback — some images have neither, in which case HTTP + a live pid is the check).
- `GET $baseUrl` returns 2xx/3xx and the body mentions `Coffee Companion`.

Doctor prints JSON (`ok`, `baseUrl`, `serverPid`, `portOwners`, `database`, `identity`, `httpStatus`, `appMarker`, `problems`). Exit code `2` means do not drive — relaunch, or stop: something else is on the port.

## Drive

Prefer this repo's Playwright harness. Selectors below are the same roles and names `apps/web/e2e/*.spec.ts` already uses. The control CLI talks to a headed-off Chromium daemon started on first browser command.

Identities (the `e2e_auth` cookie; server must have `E2E_BYPASS_AUTH=true`):

| `--as` / `browser as` | Cookie value | What you get |
| --- | --- | --- |
| `public` | none | Marketing site. `/` stays on the pitch. |
| `data` | `e2e-user-with-data` | Pro Grant, seeded library + Ethiopia Guji, Niche Zero, Linea Mini, Sey, AeroPress Go / Standard. |
| `empty` | `e2e-user-empty` | Signed in, no rows. |
| `free` | `e2e-user-free` | Same library as `data`, no Grant. Shelf is five; Sumatra Lintong and Brazil Cerrado are Sealed. |

```bash
.cursor/skills/verify-coffee-companion/helpers/control browser as public
.cursor/skills/verify-coffee-companion/helpers/control browser goto --path /
.cursor/skills/verify-coffee-companion/helpers/control browser click --role link --name Pricing
.cursor/skills/verify-coffee-companion/helpers/control browser fill --placeholder Name --value "Kenya Nyeri"
.cursor/skills/verify-coffee-companion/helpers/control browser press --key Enter
.cursor/skills/verify-coffee-companion/helpers/control browser expect --role heading --name Dashboard
.cursor/skills/verify-coffee-companion/helpers/control browser screenshot --path artifacts/<run>/page.png
.cursor/skills/verify-coffee-companion/helpers/control browser snapshot --aria --path artifacts/<run>/page.aria.txt
```

Regex names are `/pattern/i` strings. Scope a click to the marketing header with `--` plus the daemon's `nav: Marketing` (the `drive marketing` recipe does this). For ad-hoc header clicks, prefer:

```bash
.cursor/skills/verify-coffee-companion/helpers/control browser click --role link --name Pricing
```

Pricing also appears in the footer; if both match, click the header one by going through the mapped marketing recipe.

Stable handles (use these, not CSS or coordinates):

- Marketing header: `navigation` named `Marketing`; links `Pricing`, brand `Coffee Companion`; button `Sign in`.
- Home CTA: button `/save your first brew/i`.
- Home hero table: `role=table`, `getByLabel('Dialed in')`, text `Ethiopia Guji`.
- Pricing H1: `/keep your history/i`. Plan H2s: `Free`, `Pro`, `Pro+` (exact). Period toggle: button `Monthly` / default annual `$44.99`.
- Signed-in chrome: button `Open menu` (desktop sheet); `navigation` named `Primary` (mobile bottom nav). Links `Home` (`/dashboard`), `Coffee`, `Brews`, `Equipment`. Button `Account menu`. Button `Sign Out`.
- Dashboard H1 `Dashboard`. Method picker is the button whose exact name is the current method (`Espresso`, `AeroPress`, …). Options are `role=option`. Log links: `/Log Shot/i` → `/espresso/new`, `/Log Brew/i` → the method's `/…/new`.
- Brews H1 `Brews`. Tabs: `Espresso`, `Pour Over`, `French Press`, `AeroPress`, `Cold Brew`.
- Coffees H1 `Coffees`. Link/button `Add Coffee`. Row actions `Edit coffee`, `Delete coffee`. Confirm `Delete` (exact).
- Equipment H1 `Equipment`. Tabs `Grinders` (default) and `Brewing Devices`. Actions `Edit grinder`, `Delete grinder`, `Edit brewing device`, `Delete brewing device`.

First click after a navigation can land before hydration (`apps/web/e2e/helpers.ts` `clickUntil`). The daemon retries clicks. When you write a one-off Playwright spec instead, use `clickUntil` from that file.

Only one one-shot recipe is wired: `drive marketing`. Dashboard, coffees, brews, and plans-and-shelf are mapped under `features/` and are driven with `browser as` / `goto` / `click` from those files — a missing `drive <name>` stub is not a skip and not a pass.

```bash
.cursor/skills/verify-coffee-companion/helpers/control drive marketing
```

Reseed after a mutation that dirties the shared library:

```bash
.cursor/skills/verify-coffee-companion/helpers/control seed
```

Seed deletes and re-inserts the `data` and `free` users. Do not seed against anything but the test database.

Existing specs remain valid: with this instance up, `E2E_BASE_URL=$baseUrl pnpm --filter coffee-companion exec playwright test e2e/marketing.spec.ts` runs the public project against it (Playwright will not start a second server when `E2E_BASE_URL` is set). Prefer the control CLI for evidence capture; use the specs when you want the suite's assertions.

## Evidence

Proof lives under `.cursor/skills/verify-coffee-companion/artifacts/<runId>/`. That directory is not deleted on cleanup. `.run/` is.

Standards:

- Exercise the real user path in the browser. Do not call tRPC mutations, do not insert rows, do not set Dialed-in in the database to "make the screenshot look right".
- Capture the action and the resulting state. A final screen alone is not enough: keep the screenshot from before the click when the click's effect is the claim.
- Every artifact set includes an ARIA snapshot and a full-page screenshot that shows Coffee Companion chrome (marketing header or the signed-in `Dashboard` / `Brews` / `Coffees` heading).
- Mutations need a second user-facing read (navigate away and back, or open the list) plus the visible value. Seeded names to look for: `Ethiopia Guji`, `Kenya Nyeri`, `Niche Zero`, `Linea Mini`, `Sey`, grind settings `21`–`27`.
- Side effects: a new Coffee appears on `/coffees`; a logged Shot lands on `/brews` with the grind you typed; Sealed rows show `Sealed` and hide grind/dose.
- Mocks: billing is already off without Stripe env. Do not press `Subscribe` expecting a Checkout session in this instance. Google sign-in is not the path — use the bypass cookie. Outbound mail is off without `RESEND_API_KEY`.
- Record the feature file and identity (`public` / `data` / `empty` / `free`) with every artifact. `drive marketing` writes `proof.json` that does this.

`artifacts/` is gitignored. Leave it on disk for the human; do not commit binaries.

## Cleanup

```bash
.cursor/skills/verify-coffee-companion/helpers/control cleanup
```

Kills only the server pid and browser-daemon pid recorded in `.run/state.json`. Then deletes `.run/`. It does **not** kill by process name, does **not** drop `coffee_companion_test`, and does **not** delete `artifacts/`.

If launch failed part-way, run cleanup anyway so a half-written state file cannot mask a stray pid.

After cleanup, confirm the proof files still exist at the paths printed during Drive.

## Helpers

All scripts are executable. Run them from anywhere; they resolve the repo root themselves.

| Command | What it does |
| --- | --- |
| `helpers/control launch` | Postgres (test DB, loopback + `*_test`) → migrate → seed → always rebuild → `node .output/server/index.mjs` |
| `helpers/control doctor` | Pid, port ownership, HTTP + `Coffee Companion` marker |
| `helpers/control seed` | `helpers/seed.mjs` → `seedE2eUsers()` |
| `helpers/control browser …` | Playwright daemon (see Drive) |
| `helpers/control drive marketing` | The only wired one-shot recipe (public home + pricing). Other map entries use `browser` commands |
| `helpers/control cleanup` | Stop recorded pids; keep artifacts |
| `helpers/ensure-postgres.sh` | Create/start local `coffee_companion_test` (scaffolding) |
| `helpers/seed.mjs` | Seed runner imported by `control seed` |

```bash
.cursor/skills/verify-coffee-companion/helpers/control launch
.cursor/skills/verify-coffee-companion/helpers/control doctor
.cursor/skills/verify-coffee-companion/helpers/control drive marketing
ls .cursor/skills/verify-coffee-companion/artifacts/*/marketing/proof.json
.cursor/skills/verify-coffee-companion/helpers/control cleanup
ls .cursor/skills/verify-coffee-companion/artifacts/*/marketing/proof.json
```
