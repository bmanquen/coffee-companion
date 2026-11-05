# Coffee Companion mobile verification map

This directory is the maintained source for verifying the user-facing behavior of the Coffee Companion mobile app (`apps/mobile`, Expo). Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.cursor/skills/verify-mobile/helpers/control launch`.
- Require `helpers/control doctor` to report `ok: true`, `baseUrl` `http://127.0.0.1:8081` (or the `VERIFY_METRO_PORT` you set), Metro marker `packager-status:running`, and app marker `Coffee Companion`.
- Never drive an instance that was not started by this verification run. A process already on port 8081 is likely `pnpm --filter @coffee-companion/mobile start`.
- Signed-out identity is the sign-in screen. Signed-in identity is the welcome screen with Sign Out. Drive mocks the session; it does not mint a real Google or Apple token.
- Drive uses React Native Testing Library in-process on every machine. That tier is the gate.
- On a machine that has the Android Studio SDK and an AVD, also run `launch-device` and `drive-device`. Default AVD name is `verify-pixel`; set `VERIFY_AVD` when that name is missing from `emulator -list-avds`. The device web app listens on port `3910` (`VERIFY_PORT`) so it does not collide with `pnpm dev` on `3000`. Gradle needs Java 17–21. This VM has no SDK, so that tier is not available here.
- Coffee, brew, equipment, and shelf features are web-only today. Add a mobile feature file here when that surface ships.
- Do not remove proof artifacts during cleanup.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer `testID`, `accessibilityRole`, and `accessibilityLabel` over coordinates or tree position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run screen assertions through `helpers/control drive welcome` or `helpers/control drive sign-in` (or the same RNTL queries those tests use).
- Where an AVD exists, run `helpers/control verify-device` (cleanup → launch-device → doctor → drive-device). Maestro selectors are `testID`s only, except `runFlow when visible` Continue / Close / Back that dismiss Expo developer-menu overlays.

## Proof and skip reporting

- Capture the user-visible tree after the render, not only a pass/fail.
- RNTL proof includes a host-tree dump (`tree.txt`) that shows the `header` named `Coffee Companion`. A welcome tree must include `welcome-screen` and `welcome-heading`. A sign-in tree must include `sign-in-screen` and `sign-in-heading`.
- Maestro proof from `drive-device` includes screenshots under `artifacts/<runId>/<flow>/` plus `proof.json` with harness `maestro`. RNTL cannot take a device screenshot; Maestro does not write `tree.txt`.
- Record the feature ID, harness (`rntl` or `maestro`), and entry point with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped platform (iOS simulator, Android emulator) as verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Welcome screen](./welcome.md) is the signed-in home: the `Coffee Companion` heading and Sign Out. Shortcut: `helpers/control drive welcome`. Device: `helpers/control drive-device sign-in-and-out`.
- [Sign-in screen](./sign-in.md) is the signed-out home: Google, Apple on iOS, sign-up, the error copy, and the hidden E2E handle. Shortcut: `helpers/control drive sign-in`. Device: `helpers/control drive-device sign-in-and-out`.
