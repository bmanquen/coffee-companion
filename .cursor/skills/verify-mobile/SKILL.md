---
name: verify-mobile
description: Drive the Coffee Companion mobile app (apps/mobile, Expo) the way a user does — launch a dedicated Metro bundler, exercise screens through React Native Testing Library, and on a machine with the Android SDK and an AVD (default verify-pixel, override with VERIFY_AVD), drive the same handles through Maestro. Use when you need to prove a mobile UI change, reproduce a user-facing mobile bug, or verify a mapped mobile feature.
---

# Verify Coffee Companion mobile

Coffee Companion is a personal coffee-brewing tracker. The surface this skill drives is the **Expo mobile app** (`apps/mobile`, SDK 57). iOS and Android only — there is no Expo web target. The web UI has its own skill (`.cursor/skills/verify-coffee-companion`).

This skill is for the next agent, mid-task. Drive the running app. Do not substitute a `welcomeMessage()` unit assertion, a Metro log line, or a source-file read for a screen-tree or device proof. Native Google and Apple sheets are not this harness — those still need a development build and a real device or simulator.

Read `features/README.md` before driving. Use the matching feature file as the recipe.

## Platforms this skill can drive

| Platform | Where | Proven here? |
| --- | --- | --- |
| In-process host tree (React Native Testing Library) | Linux, macOS, CI | Yes. This is the gate everywhere. |
| Android emulator (AVD `verify-pixel` on `emulator-5554`, or `VERIFY_AVD`) | Machine with Android SDK and that AVD. Linux also needs usable `/dev/kvm` | Only on a machine that has that SDK and AVD. Required wherever the AVD exists. This VM has no Android SDK, so the device tier was not run here. |
| iOS Simulator or device | macOS + Xcode only | No. This is Linux |

The RNTL tier is the gate on every machine. If an Android AVD exists, also run the Maestro device tier before you call the change verified. Default AVD name is `verify-pixel`; set `VERIFY_AVD` to an installed name from `emulator -list-avds` when that default is missing. Do not claim an Android device run unless you attached `emulator-5554` and drove it.

```bash
# RNTL (every machine)
.cursor/skills/verify-mobile/helpers/control launch
.cursor/skills/verify-mobile/helpers/control doctor
.cursor/skills/verify-mobile/helpers/control drive welcome
.cursor/skills/verify-mobile/helpers/control drive sign-in
.cursor/skills/verify-mobile/helpers/control cleanup

# Device (only where SDK + an AVD exist; default name is verify-pixel)
# Dedicated web port is 3910 (VERIFY_PORT) so it does not collide with pnpm dev on 3000.
VERIFY_AVD=Pixel_7 .cursor/skills/verify-mobile/helpers/control launch-device
.cursor/skills/verify-mobile/helpers/control doctor
.cursor/skills/verify-mobile/helpers/control drive-device sign-in-and-out
.cursor/skills/verify-mobile/helpers/control cleanup
```

## Launch

Start a dedicated Metro. Never reuse a process already bound to port 8081 — that is a human `expo start` / `pnpm --filter @coffee-companion/mobile start`.

From the repo root:

```bash
.cursor/skills/verify-mobile/helpers/control launch
```

Launch does all of this, in order:

1. Refuses if `.run/state.json` already records a live pid, or if `VERIFY_METRO_PORT` (default `8081`) is taken.
2. Runs `pnpm install --frozen-lockfile` when `node_modules` is missing.
3. Starts `pnpm exec expo start --port $PORT --localhost` from `apps/mobile` with `CI=1` (non-interactive). Stdout/stderr go to `.run/metro.log`.
4. Waits until `GET http://localhost:$PORT/status` is `packager-status:running`.
5. Fetches the app bundle (`/apps/mobile/index.bundle?platform=android&dev=true&minify=false` — Metro's project root is the pnpm workspace). Requires the body to mention `Coffee Companion`.
6. Writes `.cursor/skills/verify-mobile/.run/state.json`.

Ready signal: launch prints JSON with `ok: true`, `baseUrl`, `metroPid`, and `bundleUrl`. Default URL is `http://localhost:8081`. Expo `--localhost` binds IPv6 `::1` here; `127.0.0.1` does not reach it.

Isolation:

- One verification instance at a time. A second `launch` or `launch-device` must fail closed rather than attach to the first.
- Side-by-side Metro runs need a distinct `VERIFY_METRO_PORT`. Default is to refuse, not to share.

Human-facing `pnpm --filter @coffee-companion/mobile start` is the wrong process: interactive, easy to confuse with another checkout.

If launch fails after Metro has started (timeout or a bundle that is not this app), it stops the process it spawned before exiting. Teardown for a recorded instance is `helpers/control cleanup` (see Cleanup). Run cleanup after every failed iteration too.

### Launch the Android device tier

Mac / Linux prerequisites:

- Android Studio SDK at `~/Library/Android/sdk` (macOS) or `~/Android/Sdk` (Linux). `ANDROID_HOME` / `ANDROID_SDK_ROOT` win when they point at that full SDK. Homebrew `android-commandlinetools` (`/opt/homebrew/share/android-commandlinetools`) is skipped — it has no AVD system images.
- Create the AVD in Android Studio Device Manager (API 36 / arm64 is fine). Default name is `verify-pixel`.
- Java 17–21 for the Gradle build. Android Studio's bundled JBR (Java 25) crashes `compileKotlin`. `launch-device` uses `JAVA_HOME` when it is 17–21, otherwise `/usr/libexec/java_home -v 17` on macOS. Install with `brew install --cask temurin@17` if that lookup fails.

On a machine that already has that SDK and an AVD. If `emulator -list-avds` does not include `verify-pixel`, set `VERIFY_AVD` to one of the listed names (for example `Pixel_7`):

```bash
VERIFY_AVD=Pixel_7 .cursor/skills/verify-mobile/helpers/control launch-device
```

The device tier starts its own web app on port `3910` so it does not collide with `pnpm dev` on `3000`. Override with `VERIFY_PORT` if that port is taken.

`launch-device` does all of this, in order:

1. Refuses if `.run/state.json` already records a live pid, if port 8081 is taken, or if the dedicated web port (`3910`, or `VERIFY_PORT`) is taken. If `emulator-5554` is already `device`, launch attaches to it (and adopts its AVD name unless `VERIFY_AVD` disagrees). It does not refuse a healthy emulator that was started outside the script.
2. Resolves the Studio SDK (never Homebrew commandlinetools), prints the emulator binary, and requires Java 17–21 (or macOS `java_home -v 17`). When it must boot, it runs `emulator -list-avds` and dies immediately if the chosen AVD is missing, listing the installed names and telling you to set `VERIFY_AVD`. Before booting, compares JS-imported Expo native modules (including `@better-auth/expo`'s `import("expo-network")`) to `expo-modules-autolinking resolve -p android`. A module that JS can import but autolinking omitted fails closed — under pnpm that usually means it is not a direct `apps/mobile` dependency.
3. Boots that AVD on console port `5554` (serial `emulator-5554`) with `-no-boot-anim` and, on macOS, `-gpu host` (`VERIFY_EMULATOR_GPU` overrides), unless it attached in step 1. Waits up to five minutes (`EMULATOR_BOOT_TIMEOUT_MS`) and prints `booting…` elapsed seconds on stderr. If the emulator process exits early, it fails with the tail of `.run/emulator.log` instead of waiting out the timeout.
4. Starts the web app on that dedicated port (`VERIFY_PORT` / `BETTER_AUTH_URL` / `SITE_URL` pinned so a leftover `3000` from `pnpm dev` cannot leak through) with `E2E_BYPASS_AUTH=true` (same seed and bypass as `.cursor/skills/verify-coffee-companion`).
5. Stamps `VERIFY_APK_VERSION=<git SHA>` into `apps/mobile/android/gradle.properties` and `versionName` in `app/build.gradle` (so `processDebugMainManifest` cannot stay UP-TO-DATE on a stale SHA), then runs `expo run:android --device <AVD name>` (Expo 57 matches `device.name`, not the adb serial) with that env. If the installed APK `versionName` is missing or not `git rev-parse --short=7 HEAD`, it uninstalls and passes `--no-build-cache`. The install wait prints why it is still waiting. `BUILD SUCCESSFUL` with a stale `versionName` fails immediately (expo stays alive for Metro, so "still building" is a lie). A timeout names the actual `versionName` versus the expected SHA. adb and Maestro still use `emulator-5554`. Env: `EXPO_PUBLIC_E2E_USER=e2e-user-with-data` and `EXPO_PUBLIC_API_URL=http://localhost:<port>`.
6. After install: `adb reverse` the Metro port and the web port, then `am start` `exp+<slug>://expo-development-client/?url=<encoded http://127.0.0.1:METRO_PORT>` — the same `exp+coffee-companion` scheme Expo opens, not the auth scheme `coffeecompanion`. The slug is read from app config. Waits until `sign-in-screen` or `welcome-screen` is in the UI dump — the Expo "Development servers" launcher is not ready.
7. Records every started pid, the serial, the actual `avdName`, `attachedEmulator`, Metro URL, and `webPort` in `.run/state.json`. Cleanup does not kill an emulator it did not start.

Package id: `dev.offbyonelabs.coffeecompanion`. Do not run `launch-device` on a machine that lacks the SDK or any AVD.

## Doctor

Read-only. Run this first whenever anything looks off, and again after a failed drive.

```bash
.cursor/skills/verify-mobile/helpers/control doctor
```

After `launch`, doctor is green only when all of these hold:

- The recorded `metroPid` in `.run/state.json` is alive.
- That instance owns `VERIFY_METRO_PORT` (`lsof -t -iTCP:$PORT -sTCP:LISTEN`; `ss` is a fallback). Process-group ownership only identifies the port listener.
- `GET $baseUrl/status` returns 2xx/3xx and the body is `packager-status:running`.
- The app bundle mentions `Coffee Companion`.

After `launch` or `launch-device`, doctor also compares JS-imported Expo native modules to `expo-modules-autolinking resolve -p android`. A missing autolink (the `ExpoNetwork` crash: `@better-auth/expo` imports `expo-network`, but pnpm only autolinks direct `apps/mobile` deps) fails closed.

After `launch-device`, doctor also checks:

- Recorded emulator / web / expo pids are alive and `emulator-5554` is attached. An attached (not spawned) emulator has no `emulatorPid`.
- `GET` on the recorded `webBaseUrl` (default `http://127.0.0.1:3910`) answers.
- Host Metro answers and `adb reverse` maps the Metro port and the web port. A device-side GET of `http://127.0.0.1:<metro>/status` must be `packager-status:running` when wget/curl exists on the image.
- The UI dump is the app (`sign-in-screen` or `welcome-screen`), not the Expo "Development servers" launcher.
- `adb shell dumpsys package dev.offbyonelabs.coffeecompanion` `versionName` matches `git rev-parse --short=7 HEAD`.
- The Java Gradle will use is 17–21 (same preflight as `launch-device`).

Doctor prints JSON. Exit code `2` means do not drive — relaunch, or stop: something else is on the port or serial.

## Drive

The RNTL harness is the gate on every machine. Selectors below are the same `testID`s, `accessibilityRole`, and `accessibilityLabel` the screen modules export.

```bash
.cursor/skills/verify-mobile/helpers/control drive welcome
.cursor/skills/verify-mobile/helpers/control drive sign-in
```

Each drive first confirms the recorded Metro is up and answering — the same pid, port-ownership, `/status`, and bundle checks as `doctor`. A dead Metro or a leftover `.run/state.json` fails with exit `2` and does not run the screen test. When that check is green, drive renders the screen in-process and writes the host tree under `artifacts/<runId>/<feature>/`.

Stable handles (use these, not coordinates or visible text):

- Welcome (signed in): `testID=welcome-screen`, `accessibilityLabel=Welcome`. Heading `Coffee Companion` (`testID=welcome-heading`). Button `testID=sign-out`.
- Sign-in (signed out): `testID=sign-in-screen`, `accessibilityLabel=Sign in`. Brand header `Coffee Companion`. Heading `Sign in` (`testID=sign-in-heading`). Buttons `testID=sign-in-google`, `testID=sign-in-apple` (iOS), `testID=sign-in-toggle`. Error `testID=sign-in-error`. Dev-only E2E handle `testID=e2e-sign-in` when `EXPO_PUBLIC_E2E_USER` is set.

The same queries as a raw Jest file. This renders in-process and does not check Metro — only `helpers/control drive <feature>` does:

```bash
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/welcome \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/welcome.test.tsx
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/sign-in \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/auth/sign-in.test.tsx
```

One-shot RNTL recipes: `drive welcome` and `drive sign-in`. A missing `drive <name>` stub is not a skip and not a pass.

CI runs those same screen tests without Metro (`pnpm --filter @coffee-companion/mobile test`). That is cheap and is wired in the unit job. CI does **not** launch Metro or an emulator.

### Drive the Android device tier

Where an AVD exists (default `verify-pixel`, or `VERIFY_AVD`), after `launch-device` and a green `doctor`:

```bash
.cursor/skills/verify-mobile/helpers/control drive-device sign-in-and-out
```

That runs `maestro --device emulator-5554 test -e EXPO_DEV_CLIENT_URL=… flows/<flow>.yaml`. Selectors are `testID`s only. Never use coordinates or visible text. The first flow is `flows/sign-in-and-out.yaml`: `launchApp` with `clearState` → `openLink` the expo-development-client URL (so clearState cannot leave the launcher) → `sign-in-screen` → tap `e2e-sign-in` → `welcome-screen` → tap `sign-out` → `sign-in-screen`. Screenshots and `proof.json` (`harness: maestro`) land under `artifacts/<runId>/<flow>/`.

## Evidence

Proof lives under `.cursor/skills/verify-mobile/artifacts/<runId>/`. That directory is not deleted on cleanup. `.run/` is.

Standards:

- Exercise the real user path through the screen tree or the device. Do not assert `welcomeMessage()` in isolation and call it a screen proof.
- Capture the action and the resulting state. Opening signed-out is the sign-in screen; opening signed-in is the welcome heading plus Sign Out.
- RNTL artifact sets include a host-tree dump that shows `Coffee Companion` and the screen `testID`s. Maestro artifact sets include screenshots plus `proof.json`.
- Side effects: session tokens belong in `expo-secure-store` and are cleared on Sign Out. The device tier writes `e2e_auth` through that same cookie store, then `get-session` resolves the persona.
- Mocks: RNTL uses Test Renderer in Node. Native Google/Apple sheets and the status bar are not a device. Do not mock the heading to "make the tree look right".
- Record the feature file and harness (`rntl` or `maestro`) with every artifact.

`artifacts/` is gitignored. Leave it on disk for the human; do not commit binaries.

## Cleanup

```bash
.cursor/skills/verify-mobile/helpers/control cleanup
```

Kills only the pids recorded in `.run/state.json` (Metro, expo, web, emulator). If a serial is recorded, uninstalls `dev.offbyonelabs.coffeecompanion` from that device. Then deletes `.run/`. It does **not** kill by process name, does **not** touch other emulators, and does **not** delete `artifacts/`.

If launch failed part-way, run cleanup anyway so a half-written state file cannot mask a stray pid.

After cleanup, confirm the proof files still exist at the paths printed during Drive.

## Helpers

All scripts are executable. Run them from anywhere; they resolve the repo root themselves.

| Command | What it does |
| --- | --- |
| `helpers/control launch` | Dedicated Expo Metro → wait for `/status` → require `Coffee Companion` in the bundle |
| `helpers/control launch-device` | Attach or boot `emulator-5554`, start the web app on port `3910` (`VERIFY_PORT`), rebuild if `versionName` ≠ git HEAD, reverse Metro/web, open the expo-development-client deep link, wait for `sign-in-screen` |
| `helpers/control doctor` | Metro checks after `launch`; after `launch-device` also APK SHA, adb reverse, device Metro, and no Expo launcher in the foreground |
| `helpers/control drive welcome` | Confirm Metro is answering, then the signed-in welcome screen |
| `helpers/control drive sign-in` | Confirm Metro is answering, then the signed-out sign-in screen |
| `helpers/control drive-device <flow>` | Maestro `flows/<flow>.yaml` on `emulator-5554`; copy screenshots to `artifacts/` |
| `helpers/control cleanup` | Stop recorded pids; uninstall the package from the recorded serial; keep artifacts |
| `helpers/metro.test.mjs` | Node tests for the Metro / bundle markers |
| `helpers/device.test.mjs` | Node tests for adb / dumpsys / AVD list / boot-wait / pid / screenshot helpers |

```bash
.cursor/skills/verify-mobile/helpers/control launch
.cursor/skills/verify-mobile/helpers/control doctor
.cursor/skills/verify-mobile/helpers/control drive welcome
.cursor/skills/verify-mobile/helpers/control drive sign-in
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/sign-in/proof.json
.cursor/skills/verify-mobile/helpers/control cleanup
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/sign-in/proof.json
```
