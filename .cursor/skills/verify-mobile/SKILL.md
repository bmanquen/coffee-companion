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
# One command: cleanup → launch-device → doctor → drive-device. Stays up if a later step fails.
.cursor/skills/verify-mobile/helpers/control verify-device
# If `verify-pixel` is missing from `emulator -list-avds`, name an installed AVD:
VERIFY_AVD=Pixel_7 .cursor/skills/verify-mobile/helpers/control verify-device
```

## Launch

Start a dedicated Metro. Never reuse a process already bound to `VERIFY_METRO_PORT` (default `8081`) — that is a human `expo start` / `pnpm --filter @coffee-companion/mobile start`.

From the repo root:

```bash
.cursor/skills/verify-mobile/helpers/control launch
```

Launch does all of this, in order:

1. Refuses if `.run/state.json` already records a live pid, or if `VERIFY_METRO_PORT` (default `8081`) is taken.
2. Runs `pnpm install --frozen-lockfile` when `node_modules` is missing.
3. Starts `pnpm exec expo start --port $PORT` from `apps/mobile` with `CI=1` (non-interactive). Stdout/stderr go to `.run/metro.log`. The Metro pid is written to `.run/state.json` as soon as the process is spawned, before the `/status` wait, so an interrupted launch can still be cleaned up.
4. Waits until `GET /status` on `127.0.0.1`, `::1`, or `localhost` is `packager-status:running`. Prints elapsed seconds while waiting. If Metro exits, fails with the tail of `metro.log`.
5. Fetches the app bundle (`/apps/mobile/index.bundle?platform=android&dev=true&minify=false&lazy=false` first — Expo's Metro server root in this pnpm workspace is the repo root, which is the path the dev client requests — then `/index.bundle` and `/.expo/.virtual-metro-entry.bundle`). Requires the body to mention `Coffee Companion`.
6. Completes `.cursor/skills/verify-mobile/.run/state.json` with `baseUrl` and `bundleUrl`.

Ready signal: launch prints JSON with `ok: true`, `baseUrl`, `metroPid`, and `bundleUrl`. `baseUrl` is whichever loopback answered `/status` (prefer `http://127.0.0.1:8081` so `adb reverse` can reach it).

Isolation:

- One verification instance at a time. A second `launch` or `launch-device` must fail closed rather than attach to the first.
- Side-by-side Metro runs need a distinct `VERIFY_METRO_PORT`. Default is to refuse, not to share.

Human-facing `pnpm --filter @coffee-companion/mobile start` is the wrong process: interactive, easy to confuse with another checkout.

If launch fails after Metro has started (timeout or a bundle that is not this app), it stops the process it spawned before exiting. Teardown for a recorded instance is `helpers/control cleanup` (see Cleanup). Run cleanup after every failed iteration too.

### Launch the Android device tier

Mac / Linux prerequisites:

- Android Studio SDK at `~/Library/Android/sdk` (macOS) or `~/Android/Sdk` (Linux). `ANDROID_HOME` / `ANDROID_SDK_ROOT` win when they point at that full SDK. Homebrew trees (`/opt/homebrew/...`, linuxbrew) are skipped — including `android-commandlinetools`, which has no AVD system images. A complete Studio SDK is accepted even if an ancestor folder uses that formula name.
- Create the AVD in Android Studio Device Manager (API 36 / arm64 is fine). Default name is `verify-pixel`.
- Java 17–21 for the Gradle build. Android Studio's bundled JBR (Java 25) crashes `compileKotlin`. `launch-device` uses `JAVA_HOME` when it is 17–21, otherwise `/usr/libexec/java_home -v 17` on macOS. Install with `brew install --cask temurin@17` if that lookup fails.

On a machine that already has that SDK and an AVD:

```bash
.cursor/skills/verify-mobile/helpers/control launch-device
# If `verify-pixel` is missing from `emulator -list-avds`, name an installed AVD:
VERIFY_AVD=Pixel_7 .cursor/skills/verify-mobile/helpers/control launch-device
```

The device tier starts its own web app on port `3910` so it does not collide with `pnpm dev` on `3000`. Override with `VERIFY_PORT` if that port is taken.

`helpers/control verify-device [flow]` is the one command: `cleanup` → `launch-device` → `doctor` → `drive-device` (default flow `sign-in-and-out`). After attach, if that flow sets `clearState` and the app was already on the emulator, it refuses before starting the web app or Expo — `drive-device` is not left to refuse after a Gradle install. Standalone `launch-device` and flows that do not clear state still run. If `doctor` or `drive-device` fails, the instance stays up for inspection. If `launch-device` fails, its own teardown runs (step 6). Do not insert manual waits between those steps.

`launch-device` does all of this, in order:

1. Refuses if `.run/state.json` already records a live pid. A non-integer or out-of-range `VERIFY_METRO_PORT` / `VERIFY_PORT` fails immediately. Ports `VERIFY_METRO_PORT` (default `8081`) and `VERIFY_PORT` (default `3910`) are waited on briefly after cleanup — a leftover listener is not an immediate error. If `emulator-5554` is `offline` / `unauthorized` / otherwise not `device`, launch waits for it to become `device` or leave `adb devices`, and `adb emu kill`s it if it stays stale (then waits for that pid/group to exit, escalating SIGTERM to SIGKILL, and for the AVD `*.lock` files to release). It never exits on a transient serial. If the serial is already `device`, launch attaches (and adopts its AVD name unless `VERIFY_AVD` disagrees). It does not refuse a healthy emulator that was started outside the script. Before booting a new emulator it waits for any leftover process on that AVD to exit; a still-running foreign instance fails with that pid named. If no emulator or qemu process still holds the AVD, leftover `*.lock` files under the AVD directory (`ANDROID_AVD_HOME`, else `$ANDROID_USER_HOME/avd`, else `~/.android/avd`) are removed and named on stderr before the lock wait. A live holder is left in place; a lock-wait timeout names its pid and command. It does not pass `-read-only`.
2. Resolves the Studio SDK (never a Homebrew tree), prints the emulator binary, and requires Java 17–21 (or macOS `java_home -v 17`). When it must boot, it runs `emulator -list-avds` and dies immediately if the chosen AVD is missing, listing the installed names and telling you to set `VERIFY_AVD`. Before booting, compares JS-imported Expo native modules (including `@better-auth/expo`'s `import("expo-network")`) to `expo-modules-autolinking resolve -p android`. A module that JS can import but autolinking omitted fails closed — under pnpm that usually means it is not a direct `apps/mobile` dependency.
3. Boots that AVD on console port `5554` (serial `emulator-5554`) with `-no-boot-anim` and, on macOS, `-gpu host` (`VERIFY_EMULATOR_GPU` overrides), unless it attached in step 1. Waits up to five minutes (`EMULATOR_BOOT_TIMEOUT_MS`) and prints `booting…` elapsed seconds on stderr. If the emulator process exits early, it fails with the tail of `.run/emulator.log` instead of waiting out the timeout.
4. Starts the web app on that dedicated port (`VERIFY_PORT` / `BETTER_AUTH_URL` / `SITE_URL` pinned so a leftover `3000` from `pnpm dev` cannot leak through) with `E2E_BYPASS_AUTH=true` (same seed and bypass as `.cursor/skills/verify-coffee-companion`) and `STRIPE_SECRET_KEY` empty so a shell export cannot enable billing. `webLaunchEnv` does not set `NODE_ENV`. The web launch pins `NODE_ENV=production` on `pnpm build` so a shell `NODE_ENV=test` cannot leak into the client bundle. The spawned production *server* is then started with `NODE_ENV=test` so the bypass allow-list can fire.
5. Stamps `VERIFY_APK_VERSION=<git SHA>` into `apps/mobile/android/gradle.properties` and `versionName` in `app/build.gradle` (so `processDebugMainManifest` cannot stay UP-TO-DATE on a stale SHA), then runs `expo run:android --device <AVD name> --no-bundler` (Expo 57 matches `device.name`, not the adb serial; `--port` would start Metro without `--clear` and cannot combine with `--no-bundler`). If the installed APK `versionName` is present and not `git rev-parse --short=7 HEAD`, and this run owns that install (it was missing before attach, or this script booted the emulator), it uninstalls and passes `--no-build-cache`. An APK already on an attached emulator is left in place; `expo run:android` still runs on standalone `launch-device`. `verify-device` with a `clearState` flow refuses before Expo instead. A missing APK still runs `expo run:android` but keeps the Gradle cache. The install wait prints why it is still waiting. A matching HEAD SHA is not proof this Expo run installed: wait for `BUILD SUCCESSFUL`, then dumpsys. Expo failing (exit without `BUILD SUCCESSFUL`) is an error even if a leftover APK already matches HEAD. An attached preexisting APK (`ownedPackage` is false) may keep that matching SHA without this run installing. `BUILD SUCCESSFUL` with a stale `versionName` fails immediately. After `--no-bundler`, expo may exit once that confirmed install is in dumpsys, and doctor does not require the expo pid when our Metro pid is recorded. A timeout names the actual `versionName` versus the expected SHA. adb and Maestro still use `emulator-5554`. Env: `EXPO_PUBLIC_E2E_USER=e2e-user-with-data` and `EXPO_PUBLIC_API_URL=http://127.0.0.1:<port>` (left as 127.0.0.1 so the bundle uses `adb reverse`; `localhost` is the guest and would be rewritten to `10.0.2.2`).
6. After install: using the Metro-port pid snapshot taken before `expo run:android`, stop only a leftover that appeared on the port after that command (the process `--port` can leave). If another listener is still there, refuse and name its pids — do not kill an unowned Metro. Then stamp `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_E2E_USER` into `apps/mobile/.env.development.local` (Expo's client `expo/virtual/env` merges `.env*` over `process.env`, so spawn env alone loses to a developer `.env`), then from `apps/mobile` start `pnpm exec expo start --port $VERIFY_METRO_PORT --dev-client --clear` (default `8081`) with `CI=1` and that same `EXPO_PUBLIC_*` env (Node `@expo/env` leaves existing process env in place; no `--localhost`: that flag binds only one of IPv4/IPv6 and hides the other from `adb reverse`). The Metro pid is written to `.run/state.json` as soon as the process is spawned, before the `/status` wait, so an interrupted launch can still be cleaned up. Wait until `/status` is `packager-status:running` on `127.0.0.1`, `::1`, or `localhost`, printing elapsed seconds; if Metro exits or never comes up, fail with the tail of `metro.log`. Then fetch `/apps/mobile/index.bundle?…&lazy=false` (the workspace-root entry the dev client requests) so doctor and the client share one bundle URL. Never reuse a Metro that `expo run:android --port` left running — Metro's transform cache and `.env` overlay keep `localhost:3000` (rewritten to `10.0.2.2:3000`, the human `pnpm dev`) and the 500 never hits the dedicated web log. Then `adb reverse` the Metro port and the web port, then `am start` `exp+<slug>://expo-development-client/?url=<encoded http://127.0.0.1:METRO_PORT>&disableAutoLaunch=1&disableOnboarding=1` — Expo 57's flags sit next to `url`, not inside it. The URL is single-quoted for `adb shell` so `/system/bin/sh` does not split on `&`. "Activity not started, intent has been delivered to currently running top-most instance" is success. The app config sets `expo-dev-client` `showMenuAtLaunch: false` / `skipOnboarding: true` (AndroidManifest `EXDevMenuShowsAtLaunch`), and launch-device stamps that into an existing `android/` tree. If the regular developer menu or the first-run Continue sheet still covers the app, `launch-device` dismisses Close / Continue via `adb input` (Back if Close is missing). Ready means `sign-in-screen` / `welcome-screen` or visible Sign in copy — the Expo "Development servers" launcher is not ready. A timeout writes `failure.png` and `window_dump.xml` under `artifacts/launch-wait-*`. Failed launch-device teardown stops pids, restores `.env.development.local`, and clears reverses; it does **not** uninstall the APK.
7. Records every started pid, the serial, the actual `avdName`, `attachedEmulator`, `ownedPackage`, Metro URL, and `webPort` in `.run/state.json`. Cleanup does not kill an emulator it did not start.

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

After `launch` or `launch-device`, doctor also compares JS-imported Expo native modules to `expo-modules-autolinking resolve -p android`. A missing autolink (the `ExpoNetwork` crash: `@better-auth/expo` imports `expo-network`, but pnpm only autolinks direct `apps/mobile` deps) fails closed. On Maestro or device runs, doctor requires `maestro check-syntax` on every file in `flows/` (CLI from `VERIFY_MAESTRO` or `~/.maestro/bin/maestro`) so an unknown property cannot wait for a device to fail. RNTL-only doctor skips that check when the CLI is absent.

After `launch-device`, doctor also checks:

- Recorded emulator / web pids are alive and `emulator-5554` is attached. An attached (not spawned) emulator has no `emulatorPid`. The expo pid may already be gone after `--no-bundler`; Metro pid is the one that must stay alive.
- `GET` on the recorded `webBaseUrl` (default `http://127.0.0.1:3910`) answers.
- Host Metro answers `/status` on `127.0.0.1`, `::1`, or `localhost` (`packager-status:running`) and the app bundle at `/apps/mobile/index.bundle?…&lazy=false` (Expo's Metro server root is the pnpm workspace) mentions `cc-api-url:` plus the client `EXPO_PUBLIC_API_URL` value `http://127.0.0.1:<web>` (serializer polyfill / `.env.development.local`, not `extra.apiUrl` alone) plus `e2e-user-with-data`. A miss prints whichever `EXPO_PUBLIC_API_URL` / `cc-api-url:` value is in the body. `adb reverse --list` maps the Metro and web ports (defaults `tcp:8081` and `tcp:3910`). That reverse list is the device-side reachability check. A device wget/curl/nc of Metro or get-session is optional: API 36 Google images often have no HTTP client.
- Host GET of `http://127.0.0.1:<web>/api/auth/get-session` with the same headers native E2E sign-in sends (`Cookie: e2e_auth=…`, `x-e2e-auth`, `expo-origin`, `x-skip-oauth-proxy`) must return a body that contains `e2e-user-with-data` (not merely HTTP 200). A missing device HTTP body prints `preflight device SKIP (no http client on device)` and does not block Maestro.
- The UI dump is the app (`sign-in-screen` or `welcome-screen`), not the Expo "Development servers" launcher and not the developer menu.
- `adb shell dumpsys package dev.offbyonelabs.coffeecompanion` `versionName` matches `git rev-parse --short=7 HEAD`.
- The Java recorded at launch is 17–21. Doctor does not re-resolve `JAVA_HOME` on the current shell.

Doctor prints `preflight host OK/FAIL (…)` and `preflight device OK/SKIP/WARN (…)` before JSON. Host preflight and missing `adb reverse` mappings fail closed (exit `2`). A device HTTP skip or warn does not. `verify-device` prints `Running Maestro flow …` after host preflight is OK and reverses are listed.

## Drive

The RNTL harness is the gate on every machine. Selectors below are the same `testID`s, `accessibilityRole`, and `accessibilityLabel` the screen modules export.

```bash
.cursor/skills/verify-mobile/helpers/control drive welcome
.cursor/skills/verify-mobile/helpers/control drive sign-in
.cursor/skills/verify-mobile/helpers/control drive espresso
```

Each drive first confirms the recorded Metro is up and answering — the same pid, port-ownership, `/status`, and bundle checks as `doctor`. A dead Metro or a leftover `.run/state.json` fails with exit `2` and does not run the screen test. When that check is green, drive renders the screen in-process and writes the host tree under `artifacts/<runId>/<feature>/`.

Stable handles (use these, not coordinates or visible text):

- Welcome (signed in): `testID=welcome-screen`, `accessibilityLabel=Welcome`. Heading `Coffee Companion` (`testID=welcome-heading`). Button `testID=sign-out`. Espresso list `testID=shot-list`.
- Sign-in (signed out): `testID=sign-in-screen`, `accessibilityLabel=Sign in`. Brand header `Coffee Companion`. Heading `Sign in` (`testID=sign-in-heading`). Buttons `testID=sign-in-google`, `testID=sign-in-apple` (iOS), `testID=sign-in-toggle`. Error `testID=sign-in-error`. Dev-only E2E handle `testID=e2e-sign-in` when `EXPO_PUBLIC_E2E_USER` is set.
- Espresso (signed in): `testID=shot-list`, button `Log Shot`, form `testID=shot-form` heading `Log Espresso Shot`. Fields `Coffee`, `Grinder`, `Brewing Device`, `Dose (g)`, `Yield (g)`, `Time (s)`, `Grind Setting`. Submit `Log`. Sealed row copy `Sealed — Subscribe to Pro to read this brew`.

The same queries as a raw Jest file. This renders in-process and does not check Metro — only `helpers/control drive <feature>` does:

```bash
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/welcome \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/welcome.test.tsx
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/sign-in \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/auth/sign-in.test.tsx
VERIFY_MOBILE_ARTIFACTS=.cursor/skills/verify-mobile/artifacts/<run>/espresso \
  pnpm --filter @coffee-companion/mobile exec jest --ci src/espresso/espresso.test.tsx
```

One-shot RNTL recipes: `drive welcome`, `drive sign-in`, and `drive espresso`. A missing `drive <name>` stub is not a skip and not a pass.

CI runs those same screen tests without Metro (`pnpm --filter @coffee-companion/mobile test`). That is cheap and is wired in the unit job. CI does **not** launch Metro or an emulator.

### Drive the Android device tier

Where an AVD exists (default `verify-pixel`, or `VERIFY_AVD`), one command:

```bash
.cursor/skills/verify-mobile/helpers/control verify-device
# If `verify-pixel` is missing from `emulator -list-avds`, name an installed AVD:
VERIFY_AVD=Pixel_7 .cursor/skills/verify-mobile/helpers/control verify-device
```

That is `cleanup` → `launch-device` → `doctor` → `drive-device sign-in-and-out`. The instance stays up if a later step fails. To drive a launched instance again: `helpers/control drive-device sign-in-and-out`.

That re-applies `adb reverse` for Metro and the web port, then re-runs the doctor preflight. Stdout names each stage: `preflight host OK/FAIL (e2e-user-with-data|null|empty)`, `preflight device OK/SKIP/WARN (…)`, then `Running Maestro flow sign-in-and-out` after host preflight is OK and `adb reverse --list` shows the Metro and web ports (defaults `tcp:8081` and `tcp:3910`), then `PASS artifacts at …` or `FAIL artifacts at …` (exit non-zero on fail). A device HTTP skip does not block Maestro; welcome-screen wait plus `web-server.log` / logcat / `window_dump.xml` are the proof. Failure logcat is `ReactNativeJS:V *:S` scoped to the app pid (`pidof -s`), so `[auth] api-url` and `[auth] request … status=` lines from a dev bundle show up. Selectors are `testID`s only, except Expo overlays: `runFlow when visible` for Continue / Close, and Back only while "Go home" is showing. Never use coordinates. A flow that sets `clearState: true` is refused when `ownedPackage` is false (the app was already on an attached emulator). Boot an isolated AVD (default `verify-pixel`) instead. The first flow is `flows/sign-in-and-out.yaml`: `launchApp` with `clearState` → wait for "Fetch development servers" → `openLink` the expo-development-client URL (with `disableAutoLaunch=1`) → `openLink` once more if the launcher is still showing → `extendedWaitUntil` `notVisible` "Fetch development servers" (30s; a timeout fails that step) → repeat: dismiss Continue / Close / Back whenever those overlays appear until `sign-in-screen` is visible → copy heading text and require it equals `Sign in` → tap `e2e-sign-in` → `extendedWaitUntil` `welcome-screen` (60s, not an immediate assert) → copy heading text and require it equals `Coffee Companion` → tap `sign-out` → `extendedWaitUntil` `sign-in-screen` → copy heading text and require it equals `Sign in` → `launchApp` without `clearState` → wait for `sign-in-screen` and require heading `Sign in` again (session restore). Screenshots and `proof.json` (`harness: maestro`) land under `artifacts/<runId>/<flow>/`. On failure, `drive-device` prints the failing Maestro step, an auth-error summary (including `get-session 200 but null session` when the app stayed on `sign-in-screen` after a 200), and the log tail, and writes `maestro.log`, `failure.png`, `window_dump.xml`, `web-server.log`, and `logcat.txt` there.

## Evidence

Proof lives under `.cursor/skills/verify-mobile/artifacts/<runId>/`. That directory is not deleted on cleanup. `.run/` is.

Standards:

- Exercise the real user path through the screen tree or the device. Do not assert `welcomeMessage()` in isolation and call it a screen proof.
- Capture the action and the resulting state. Opening signed-out is the sign-in screen; opening signed-in is the welcome heading, Espresso list, and Sign Out. Logging a Shot ends on the list with the new row. `tree.txt` is that RNTL state.
- RNTL artifact sets include a host-tree dump that shows `Coffee Companion` and the screen `testID`s. Maestro artifact sets include screenshots plus `proof.json`.
- Side effects: session tokens belong in `expo-secure-store` and are cleared on Sign Out. The device tier writes `e2e_auth` through that same cookie store, then `get-session` resolves the persona. The espresso RNTL drive proves the create payload the screen submitted.
- Mocks: RNTL uses Test Renderer in Node. Native Google/Apple sheets and the status bar are not a device. Do not mock the heading to "make the tree look right".
- Record the feature file and harness (`rntl` or `maestro`) with every artifact. `drive welcome`, `drive sign-in`, and `drive espresso` write RNTL `proof.json`.

`artifacts/` is gitignored. Leave it on disk for the human; do not commit binaries.

## Cleanup

```bash
.cursor/skills/verify-mobile/helpers/control cleanup
```

Kills the pids recorded in `.run/state.json` (Metro, expo, web, emulator). Leftover listeners on those ports are stopped only when they still belong to the recorded Metro or web process (the recorded pid or a helper in its process group). A later process on the same port is reported and left running. When `.run/state.json` is missing, cleanup does not touch listeners on `VERIFY_METRO_PORT` or `VERIFY_PORT`. An emulator this script started is stopped with `adb -s <serial> emu kill`, then SIGTERM on the process group, then a bounded wait that escalates to SIGKILL if the pid is still alive. Cleanup then waits until that serial leaves `adb devices` and until AVD `*.lock` files are gone (stale locks are removed when no emulator or qemu still holds the AVD; a live holder is not deleted). If a serial is recorded and this run owns the package (explicit `ownedPackage: true`, or missing `ownedPackage` when this script booted the emulator), uninstalls `dev.offbyonelabs.coffeecompanion`. Missing `ownedPackage` on an attached emulator is treated as not owned. A package that was already on an attached emulator is left in place, including its data. `drive-device` also refuses a flow that sets `clearState: true` when `ownedPackage` is false or missing on an attached emulator, so Maestro cannot wipe that leftover data. Restores `apps/mobile/.env.development.local` from the first backup when that file already existed, or deletes it only when this helper created it. Then deletes `.run/`. It does **not** kill by process name, does **not** touch other emulators, does **not** pass `-read-only`, and does **not** delete `artifacts/`.

If launch failed part-way, run cleanup anyway so a half-written state file cannot mask a stray pid.

After cleanup, confirm the proof files still exist at the paths printed during Drive.

## Helpers

All scripts are executable. Run them from anywhere; they resolve the repo root themselves.

| Command | What it does |
| --- | --- |
| `helpers/control launch` | Dedicated Expo Metro → wait for `/status` → require `Coffee Companion` in the bundle |
| `helpers/control launch-device` | Attach or boot `emulator-5554` (AVD `verify-pixel` unless `VERIFY_AVD` is set), start the web app on `VERIFY_PORT` (default `3910`), rebuild if `versionName` ≠ git HEAD (uninstall a stale APK only when this run owns it), `expo run:android --no-bundler`, start `expo start --dev-client --clear` from `apps/mobile`, wait for `/status`, reverse Metro/web, open the expo-development-client deep link with `disableAutoLaunch=1`, dismiss a leftover developer menu, wait for `sign-in-screen` |
| `helpers/control doctor` | Metro checks after `launch`; `maestro check-syntax` on `flows/`; after `launch-device` also APK SHA, bundle `cc-api-url:http://127.0.0.1:<web>`, `adb reverse --list` for the Metro and web ports (defaults 8081 and 3910), host `get-session` with native E2E headers whose body contains the e2e user, and no Expo launcher or developer menu in the foreground |
| `helpers/control drive welcome` | Confirm Metro is answering, then the signed-in welcome screen |
| `helpers/control drive sign-in` | Confirm Metro is answering, then the signed-out sign-in screen |
| `helpers/control drive espresso` | Confirm Metro is answering, then pick a Coffee, log a Shot, and read it on the list |
| `helpers/control drive-device <flow>` | Re-apply adb reverse, refuse a `clearState` flow when `ownedPackage` is false, print host preflight OK/FAIL and device OK/SKIP/WARN, then `Running Maestro flow <flow>` on `emulator-5554`; copy screenshots to `artifacts/`; print `PASS`/`FAIL artifacts at …` (exit non-zero on fail) |
| `helpers/control verify-device [flow]` | One shot: cleanup → launch-device → doctor → drive-device. Refuses a `clearState` flow on an attached preexisting install before Expo. Leaves the instance up if doctor or drive-device fails. |
| `helpers/control cleanup` | Stop recorded pids and leftover listeners that still belong to this helper; report a later process on those ports without signalling it; `emu kill`, wait for the pid/group (SIGTERM then SIGKILL), wait for the serial and AVD locks; uninstall the package only when this run owns it; keep artifacts |
| `helpers/metro.test.mjs` | Node tests for the Metro / bundle markers |
| `helpers/device.test.mjs` | Node tests for adb / dumpsys / AVD list / boot-wait / pid / screenshot helpers and `maestro check-syntax` on `flows/` |

```bash
.cursor/skills/verify-mobile/helpers/control launch
.cursor/skills/verify-mobile/helpers/control doctor
.cursor/skills/verify-mobile/helpers/control drive welcome
.cursor/skills/verify-mobile/helpers/control drive sign-in
.cursor/skills/verify-mobile/helpers/control drive espresso
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/sign-in/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/espresso/proof.json
.cursor/skills/verify-mobile/helpers/control cleanup
ls .cursor/skills/verify-mobile/artifacts/*/welcome/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/sign-in/proof.json
ls .cursor/skills/verify-mobile/artifacts/*/espresso/proof.json
```
