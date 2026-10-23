# Mobile dev setup

## 1. Env variables

All Google clients must be in the **same** Google Cloud project (APIs & Services → Credentials).

**`apps/mobile/.env`**
- `EXPO_PUBLIC_API_URL=http://localhost:3000`. The app rewrites `localhost` to `10.0.2.2` for the Android emulator in a dev build.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the Web application client ID. It must exactly match `GOOGLE_CLIENT_ID` in `apps/web/.env`.
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`: the iOS client ID.
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`: the iOS URL scheme shown on the iOS client (`com.googleusercontent.apps.…`).

**`apps/web/.env`** (keep your existing `DATABASE_URL`, auth secret, and so on)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Web application client.
- `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`
- `APPLE_BUNDLE_ID=dev.offbyonelabs.coffeecompanion`
- `APPLE_TEAM_ID`: Apple Developer → Membership details.
- `APPLE_KEY_ID`: Apple Developer → Certificates, Identifiers & Profiles → Keys → your Sign in with Apple key.
- `APPLE_PRIVATE_KEY`: the `.p8` contents on one line, with `\n` between lines.

Never commit `.env` files or the `.p8`, and never paste them into chat. Don't keep a `.env` at the repo root.

## 2. Google Cloud Android client
- Package name: `dev.offbyonelabs.coffeecompanion`
- SHA-1: the one under "Variant: debug" from `cd apps/mobile/android && ./gradlew signingReport`
- Each Android client holds only one SHA-1. Create another client for another machine's keystore or for release builds. Play Store builds use the app signing SHA-1 from Play Console → App integrity.
- If the OAuth consent screen is in Testing, add your Google account as a test user.
- Changes can take 5–10 minutes to apply.

## 3. Run it
- Database: `pnpm db:migrate`
- API and Metro together: `pnpm dev:mobile`. Or run them separately: `pnpm dev` in `apps/web`, then `npx expo start --clear` in `apps/mobile`.
- Run `--clear` after any `EXPO_PUBLIC_*` change, because those values are read when Metro starts.
- Testing on a real phone on your Wi-Fi: `pnpm dev:lan`. The default dev server only listens on `127.0.0.1`. On a physical phone set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000` and restart Expo with `--clear`. `localhost` is the phone itself; only the Android emulator rewrites `localhost` to `10.0.2.2`.
- Native Google sign-in needs a dev build, not Expo Go.
- The Android emulator needs a **Google Play** image (one with the Play Store icon).

Before running `prebuild --clean`, back up `apps/mobile/android/app/debug.keystore` and restore it afterwards. Otherwise your SHA-1 changes.

## 4. Troubleshooting
Dev builds log the real error as one `[auth]` line. It shows up in the Metro terminal, or you can run:
`adb logcat *:S ReactNativeJS:V | grep '\[auth\]'`

`pnpm dev:mobile` and `pnpm dev:lan` name each missing required variable and the `.env` file it belongs in. They never print the value.

| What you see | Cause | Fix |
|---|---|---|
| `Mobile sign-in is missing required environment variables` | A required value is unset | Set each named variable in the file the message names |
| Code `10` (`DEVELOPER_ERROR`), no account picker | Package name, SHA-1, or project mismatch | Recheck section 2 |
| Code `12500` | Emulator has no Play services | Use a Google Play image |
| Code `7` | Can't reach Google | Check the emulator's network |
| `Failed to connect to /10.0.2.2:3000` | API not running, or only listening on IPv6 localhost | Run `lsof -nP -iTCP:3000 -sTCP:LISTEN`. You want `127.0.0.1:3000`, so start the API with the repo's dev script |
| Audience error in the API terminal | Web client ID mismatch | Make `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` equal `GOOGLE_CLIENT_ID` |
| Error says a column such as `deleted_at` is missing | Migrations haven't been run | `pnpm db:migrate` |
