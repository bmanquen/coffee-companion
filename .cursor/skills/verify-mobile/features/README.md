# Coffee Companion mobile verification map

This directory is the maintained source for verifying the user-facing behavior of the Coffee Companion mobile app (`apps/mobile`, Expo). Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.cursor/skills/verify-mobile/helpers/control launch`.
- Require `helpers/control doctor` to report `ok: true`, `baseUrl` `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set), Metro marker `packager-status:running`, and app marker `Coffee Companion`.
- Never drive an instance that was not started by this verification run. A process already on port 8081 is likely `pnpm --filter @coffee-companion/mobile start`.
- Signed-out identity is the sign-in screen. Signed-in identity is the welcome screen with Sign Out. Drive mocks the session; it does not mint a real Google or Apple token.
- Drive uses React Native Testing Library in-process. It does not attach an iOS simulator or Android emulator.
- Do not remove proof artifacts during cleanup.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer `testID`, `accessibilityRole`, and `accessibilityLabel` over coordinates or tree position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run screen assertions through `helpers/control drive welcome` or `helpers/control drive sign-in` (or the same RNTL queries those tests use).

## Proof and skip reporting

- Capture the user-visible tree after the render, not only a pass/fail.
- UI proof includes a host-tree dump (`tree.txt`) that shows the `header` named `Coffee Companion` and the welcome `testID`s.
- This harness cannot take a device screenshot. On a Mac or Android Studio machine, a Simulator/`adb` screenshot may be added under `artifacts/` (gitignored) and posted on the PR — it is extra evidence, not a substitute for the tree dump.
- Record the feature ID, harness (`rntl`), and entry point with every artifact.
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

- [Welcome screen](./welcome.md) is the signed-in home: the `Coffee Companion` heading and `Sign Out`. Shortcut: `helpers/control drive welcome`.
- [Sign-in screen](./sign-in.md) is the signed-out home: Google, Apple on iOS, sign-up, and the error copy. Shortcut: `helpers/control drive sign-in`.
