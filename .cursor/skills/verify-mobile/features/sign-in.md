# Sign-in screen

Opening the Coffee Companion mobile app while signed out shows Sign in, with Google on both platforms and Sign in with Apple on iOS. The same providers create an account on first success. A signed-in session is stored in the device keychain and Sign Out clears it.

## Sub-features

- `sign-in-google` offers `Sign in with Google` (or `Sign up with Google` after the no-account line).
- `sign-in-apple` offers `Sign in with Apple` on iOS only.
- `sign-in-signup` switches the heading and button labels via `Don't have an account? Sign up`.
- `sign-in-errors` shows `We couldn't sign you in. Try again.`, `Sign-in isn't available right now. Try again later.`, or `To sign in with Google, this phone needs Google Play services.`
- `sign-out` returns a signed-in user to this screen and clears the secure session.
- `e2e-sign-in` is a hidden handle (`testID=e2e-sign-in`) shown only in a development build when `EXPO_PUBLIC_E2E_USER` is set. It is not email/password auth.

## How to get to it (user POV)

- Open the app with no stored session. This is the first screen.
- Press Sign Out from the signed-in welcome screen.
- On a device launch, the hidden E2E handle signs in as `EXPO_PUBLIC_E2E_USER` and Sign Out returns here.

## Driving it with control

Preconditions:

- Coffee Companion Metro is healthy at `http://localhost:8081` (or the `VERIFY_METRO_PORT` you set).
- `helpers/control doctor` reports the expected URL, `packager-status:running`, and app marker `Coffee Companion`.
- `drive sign-in` re-checks that Metro is answering before it renders. A state file alone is not enough.
- Drive is React Native Testing Library in-process unless you also ran `launch-device`. The native Google and Apple sheets cannot be presented in RNTL.

- **Read the signed-out screen.** Run `helpers/control drive sign-in`. The host tree contains brand `Coffee Companion`, heading `Sign in`, `testID=sign-in-google`, `testID=sign-in-apple`, and `testID=sign-in-toggle`.
- **Proof.** `drive sign-in` writes `artifacts/<run>/sign-in/tree.txt`, `tree.json`, and `proof.json`. `tree.txt` must show `Sign in` and `Coffee Companion`.
- **Device (where an AVD exists).** After `launch-device`, run `helpers/control drive-device sign-in-and-out`. Maestro taps `e2e-sign-in`, then `sign-out`, and writes screenshots plus `proof.json` (`harness: maestro`) under `artifacts/<run>/sign-in-and-out/`.

## Gotchas

- This is not an iOS Simulator or Android emulator run. A green `drive sign-in` does not prove the native Google or Apple UI, a development build, or a real session cookie.
- `@react-native-google-signin/google-signin` needs a development build (`expo-dev-client`). Expo Go cannot obtain a Google ID token. That pulls the dev-client build forward from the IAP stage.
- Sign in with Apple needs an App ID `dev.offbyonelabs.coffeecompanion` with the capability enabled, and a real device or Simulator signed into an Apple ID. This Linux VM cannot do that.
- Server token verification (Apple JWKS, authorization-code exchange, refresh-token persist) is covered by `packages/api` integration tests, not this drive.
- Session tokens live in `expo-secure-store`, not AsyncStorage. Sign-out deletes them. RNTL mocks SecureStore.
- `testID` and `accessibilityLabel` live in `apps/mobile/src/auth/SignInScreen.tsx` and `apps/mobile/src/auth/copy.ts`. Drive those handles, not coordinates or visible text.
- The E2E handle writes `e2e_auth` through the expoClient cookie store and then calls `get-session`. It is stripped from production builds.
- `@better-auth/expo` dynamically imports `expo-network`. Under pnpm, Expo autolinking only links direct `apps/mobile` dependencies, so `expo-network` must be listed there. A missing autolink crashes at launch with `Cannot find native module 'ExpoNetwork'`. `expo prebuild --clean` does not add a module that is only a transitive peer.
