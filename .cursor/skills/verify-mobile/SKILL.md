---
name: verify-mobile
description: Drive the Coffee Companion mobile app (apps/mobile, Expo) the way a user does — launch a dedicated Metro bundler, exercise the welcome screen through React Native Testing Library, and capture proof. Use when you need to prove a mobile UI change, reproduce a user-facing mobile bug, or verify a mapped mobile feature.
---

# Verify Coffee Companion mobile

Coffee Companion is a personal coffee-brewing tracker. The surface this skill drives is the **Expo mobile app** (`apps/mobile`, SDK 57). iOS and Android only — there is no Expo web target. The web UI has its own skill (`.cursor/skills/verify-coffee-companion`).

This skill is for the next agent, mid-task. Drive the running app. Do not substitute a `welcomeMessage()` unit assertion, a Metro log line, or a source-file read for a screen-tree proof.

Read `features/README.md` before driving. Use the matching feature file as the recipe.

## Platforms this skill can drive

| Platform | Where | Proven here? |
| --- | --- | --- |
| In-process host tree (React Native Testing Library) | Linux, macOS, CI | Yes — this is the Drive harness |
| Android emulator or device | Machine with Android SDK + an AVD or USB device. Linux also needs usable `/dev/kvm` | No. This VM had KVM at `/dev/kvm` but no Android SDK, and launch does not install one |
| iOS Simulator or device | macOS + Xcode only | No. This is Linux |

Do not claim an iOS or Android device run unless you attached one and drove it. The recipe below is what was executed.

Local attach (not run by this skill; for a Mac or Android Studio machine that already has the toolchain):

```bash
# After `helpers/control launch` (Metro on 8081):
pnpm --filter @coffee-companion/mobile ios      # macOS + Xcode + Simulator
pnpm --filter @coffee-companion/mobile android  # Android Studio AVD or USB device + adb
```

Then open the project from Expo Go or the native run, and confirm the centered heading `Coffee Companion`. A Simulator/`adb` screenshot may go under `artifacts/` (gitignored). Maestro, Detox, and Appium are not wired — they were not installed or executed here.

## Launch

Start a dedicated Metro. Never reuse a process already bound to port 8081 — that is a human `expo start` / `pnpm --filter @coffee-companion/mobile start`.

From the repo root:

```bash
.cursor/skills/verify-mobile/helpers/control launch
```

Launch does all of this, in order:

1. Refuses if `.run/state.json` already records a live Metro pid, or if `VERIFY_METRO_PORT` (default `8081`) is taken.
2. Runs `pnpm install --frozen-lockfile` when `node_modules` is missing.
3. Starts `pnpm exec expo start --port $PORT --localhost` from `apps/mobile` with `CI=1` (non-interactive). Stdout/stderr go to `.run/metro.log`.
4. Waits until `GET http://127.0.0.1:$PORT/status` is `packager-status:running`.
5. Fetches the app bundle (`/index.bundle?platform=android&dev=true&minify=false`, falling back to `/index.ts.bundle?…`) and requires the body to mention `Coffee Companion`.
6. Writes `.cursor/skills/verify-mobile/.run/state.json`.

Ready signal: launch prints JSON with `ok: true`, `baseUrl`, `metroPid`, and `bundleUrl`. Default URL is `http://127.0.0.1:8081`.

Isolation:

- One verification Metro at a time on a given port. A second `launch` must fail closed rather than attach to the first.
- Side-by-side runs need a distinct `VERIFY_METRO_PORT`. Default is to refuse, not to share.

Human-facing `pnpm --filter @coffee-companion/mobile start` is the wrong process: interactive, easy to confuse with another checkout.

Teardown is `helpers/control cleanup` (see Cleanup). Run cleanup after every failed iteration too.

## Doctor

Read-only. Run this first whenever anything looks off, and again after a failed drive.

```bash
.cursor/skills/verify-mobile/helpers/control doctor
```

Doctor is green only when all of these hold:

- The pid in `.run/state.json` is alive (or owns the process group listening on the port).
- That instance owns `VERIFY_METRO_PORT` (`lsof -t -iTCP:$PORT -sTCP:LISTEN`; `ss` is a fallback).
- `GET $baseUrl/status` returns 2xx/3xx and the body is `packager-status:running`.
- The app bundle mentions `Coffee Companion`.

Doctor prints JSON (`ok`, `baseUrl`, `metroPid`, `portOwners`, `httpStatus`, `metroMarker`, `bundleUrl`, `appMarker`, `problems`). Exit code `2` means do not drive — relaunch, or stop: something else is on the port.

## Drive

Prefer this repo's React Native Testing Library harness. Selectors below are the same `testID`s, `accessibilityRole`, and `accessibilityLabel` `apps/mobile/src/welcome.ts` exports and `apps/mobile/src/welcome.test.tsx` uses.

```bash
.cursor/skills/verify-mobile/helpers/control drive welcome
```

`drive welcome` renders `<App />` in-process and writes the host tree under `artifacts/<runId>/welcome/`.

Stable handles (use these, not coordinates):

- Welcome screen: `testID=welcome-screen`, `accessibilityLabel=Welcome`.
- Heading: `accessibilityRole=header`, name `Coffee Companion`, `testID=welcome-heading`.

The same queries, as a raw Jest file against a launched instance:

```bash
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/welcome \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/welcome.test.tsx
```

Only one one-shot recipe is wired: `drive welcome`. A missing `drive <name>` stub is not a skip and not a pass.

CI runs that same welcome test without Metro (`pnpm --filter @coffee-companion/mobile test`). That is cheap and is wired in the unit job. CI does **not** launch Metro or an emulator: iOS needs macOS, and an Android AVD is not cheap on `ubuntu-latest`.

## Evidence

Proof lives under `.cursor/skills/verify-mobile/artifacts/<runId>/`. That directory is not deleted on cleanup. `.run/` is.

Standards:

- Exercise the real user path through the screen tree. Do not assert `welcomeMessage()` in isolation and call it a screen proof.
- Capture the action and the resulting state. Today the only action is "open the app"; the resulting state is the welcome heading. `tree.txt` is that state.
- Every artifact set includes a host-tree dump that shows `Coffee Companion` and the welcome `testID`s. This harness cannot capture a device screenshot.
- Side effects: none yet (no navigation, no API, no persistence). When a later feature writes something, prove it with a second user-facing read.
- Mocks: RNTL uses Test Renderer in Node. Native views and the status bar are not a device. Do not mock the welcome heading to "make the tree look right".
- Record the feature file and harness (`rntl`) with every artifact. `drive welcome` writes `proof.json` that does this.

`artifacts/` is gitignored. Leave it on disk for the human; do not commit binaries.

## Cleanup

```bash
.cursor/skills/verify-mobile/helpers/control cleanup
```

Kills only the Metro pid (and its process group) recorded in `.run/state.json`. Then deletes `.run/`. It does **not** kill by process name, does **not** uninstall anything, and does **not** delete `artifacts/`.

If launch failed part-way, run cleanup anyway so a half-written state file cannot mask a stray pid.

After cleanup, confirm the proof files still exist at the paths printed during Drive.

## Helpers

All scripts are executable. Run them from anywhere; they resolve the repo root themselves.

| Command | What it does |
| --- | --- |
| `helpers/control launch` | Dedicated Expo Metro → wait for `/status` → require `Coffee Companion` in the bundle |
| `helpers/control doctor` | Pid, port ownership, Metro `/status`, bundle + `Coffee Companion` marker |
| `helpers/control drive welcome` | The only wired one-shot recipe (RNTL welcome screen) |
| `helpers/control cleanup` | Stop recorded Metro pid; keep artifacts |
| `helpers/metro.test.mjs` | Node tests for the Metro / bundle markers |

```bash
.cursor/skills/verify-mobile/helpers/control launch
.cursor/skills/verify-mobile/helpers/control doctor
.cursor/skills/verify-mobile/helpers/control drive welcome
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
.cursor/skills/verify-mobile/helpers/control cleanup
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
```
