# Welcome screen

Opening the Coffee Companion mobile app while signed in shows a centered heading with the app name and a Sign Out button. Signed-out users land on [Sign-in](./sign-in.md) instead.

## Sub-features

- `welcome-name` shows the heading `Coffee Companion` on the welcome screen.
- `welcome-sign-out` offers `Sign Out`, which returns the user to the sign-in screen.

## How to get to it (user POV)

- Open the app with a stored session.
- Sign in with Google or Apple from the sign-in screen.

## Driving it with control

Preconditions:

- Coffee Companion Metro is healthy at `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set).
- `helpers/control doctor` reports the expected URL, `packager-status:running`, and app marker `Coffee Companion`.
- `drive welcome` re-checks that Metro is answering before it renders. A state file alone is not enough.
- Drive is React Native Testing Library in-process. No device is attached.

- **Read the heading.** Run `helpers/control drive welcome`. The host tree contains a `header` whose name is `Coffee Companion`, on a view labelled `Welcome` with `testID=welcome-screen`. The heading node has `testID=welcome-heading`. Button `Sign Out` is present.
- **Proof.** `drive welcome` writes `artifacts/<run>/welcome/tree.txt`, `tree.json`, and `proof.json`. `tree.txt` must show `Coffee Companion`. There is no device screenshot from this harness.

## Gotchas

- This is not an iOS Simulator or Android emulator run. A green `drive welcome` does not prove pixels on a phone.
- iOS requires macOS + Xcode. This Linux verification environment cannot start `expo start --ios`.
- Android needs an SDK/AVD (or a USB device) plus KVM on Linux. This skill does not install those. `expo start --android` is the local attach command once an emulator or device is already up.
- `testID` and `accessibilityLabel` live in `apps/mobile/src/welcome.ts`. Drive those handles, not coordinates.
- Icon and adaptive-icon files under `apps/mobile/assets/` are Expo template artwork. `android.adaptiveIcon.backgroundColor` is `#FFFFFF` (neutral, same as the welcome screen). Do not treat them as brand. Real artwork comes before any store build.
- Metro on 8081 that you did not launch is the wrong instance. `launch` refuses a busy port rather than attaching.
