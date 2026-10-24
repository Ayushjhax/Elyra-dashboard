# End-to-end flows (Maestro)

| Flow | What it proves |
|---|---|
| `01-sign-in.yaml` | Email sign-in with a Privy test account, from a cleared app |
| `02-alert-to-automation.yaml` | Markets → SOL → set an alert → it is listed in Alerts & automation (then removed) |
| `03-wallet-states.yaml` | The wallet sheet in each state: failed, loading, stale, no SOL price, zero, live (development build only) |
| `04-ask-elyra-stream.yaml` | An Ask Elyra answer streams and finishes |
| `05-inbox.yaml` | The notifications inbox opens and marks everything read |
| `06-delete-account-cancel.yaml` | The delete-account confirmation stays off until DELETE is typed, and is cancelled. It never deletes. |

`02`–`06` need a signed-in session, so run `01` first (or sign in by hand).
`02` and `04` write to the signed-in account: an alert that is removed at the
end, and one Ask Elyra conversation. Use a test account.

## Install Maestro

Maestro needs Java 17+.

```sh
curl -fsSL -o /tmp/maestro.zip https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip
unzip -q /tmp/maestro.zip -d ~/.maestro-dl
export PATH="$HOME/.maestro-dl/maestro/bin:$PATH"
maestro --version
```

## A Privy test account

Privy dashboard → User management → Authentication → Advanced → **Test
accounts**: enable it. It gives an email and a fixed one-time code that work
without a real inbox. Keep them out of the repo; pass them with `-e`.

## Run on the emulator

```sh
# 1. Boot an emulator (Android Studio → Device Manager, or:). Use an API 34
#    or 35 image: on the API 36.1 image the emulator warns its graphics layer
#    is "still unstable for API > 35", and on 2026-10-24 it repeatedly lost
#    its package service, so Maestro could not install its driver.
~/Library/Android/sdk/emulator/emulator -avd <an API 35 AVD> &
adb wait-for-device

# 2. Install the development build and point it at your machine
cd mobile
pnpm exec expo prebuild -p android --no-install     # after config changes only
(cd android && ./gradlew assembleDebug)
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 reverse tcp:8081 tcp:8081     # Metro
adb -s emulator-5554 reverse tcp:3000 tcp:3000     # the local API (EXPO_PUBLIC_API_URL=http://localhost:3000)

# 3. Start the API (repo root) and Metro (mobile/), each in its own terminal
pnpm dev
pnpm start

# 4. Run every flow, in order
maestro --device emulator-5554 test \
  -e EMAIL=<test email> -e OTP=<test code> \
  .maestro
```

One flow: `maestro --device emulator-5554 test .maestro/05-inbox.yaml`.
Watch and build flows interactively: `maestro studio`.

### Against a preview or release build

Flows default to the development build (they open it on Metro). For an APK
with its own bundle, pass `-e DEV_CLIENT=false`. `03-wallet-states.yaml`
needs the development build's tool screen and is skipped there:

```sh
maestro test -e DEV_CLIENT=false --exclude-tags dev-build -e EMAIL=… -e OTP=… .maestro
```

### On a phone

The same commands with the phone's serial (`adb devices`) instead of
`emulator-5554`. Keep the phone unlocked, or the app opens behind the lock
screen and every flow fails at launch.
