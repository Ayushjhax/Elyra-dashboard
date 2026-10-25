# Releasing the Android app

The app ships through the Solana dApp Store, signed with Elyra's own key
(EAS `dapp-store` profile). The API is the website's Next app on Vercel and
ships on every push to `main`; this document is about the app, and about
keeping the API safe for every app version still in people's hands.

## Shipping a new version

### 1. Decide the version

- Semantic versioning on `version` in `mobile/app.config.ts`:
  **patch** (1.0.1) for fixes, **minor** (1.1.0) for features, **major**
  (2.0.0) only when the app changes what it asks of the person (new
  permissions, a new sign-in rule).
- The **versionCode** is EAS's, not ours: `eas.json` has
  `"appVersionSource": "remote"` and the `dapp-store` profile has
  `"autoIncrement": true`, so every build gets the next code. The portal
  rejects an APK whose versionName and versionCode aren't both higher than
  the live one.

### 2. Write it down

- Move the `Unreleased` entries in `CHANGELOG.md` under the new version and
  date.
- Draft the store's **What's New** from `docs/release-notes-template.md`.

### 3. Make sure the API is ready first

If this version needs anything new from the API, it must be **deployed to
production before the app is submitted** — review can take days, and the
approved build goes live by itself (see "Keeping the API compatible").

### 4. Build

```sh
cd mobile
pnpm typecheck && pnpm lint && pnpm test
eas build -p android --profile dapp-store
```

- **Same keystore, always.** EAS uses the `dapp-store` credentials it
  already holds. If it ever asks to "Generate a new Android Keystore", stop:
  a new key means the store can't update the app, and every App Link stops
  verifying. Restore the backed-up keystore with `eas credentials`.
- Check the APK before going further:

```sh
apksigner verify --print-certs elyra.apk | grep SHA-256
# must equal ANDROID_CERT_SHA256 in Vercel (what /.well-known/assetlinks.json serves)
aapt dump badging elyra.apk | grep -E "package:|versionCode|versionName"
# package: name='xyz.getelyra.app', versionCode higher than the live one
```

### 5. QA

Run `docs/QA.md` on this APK — not on a development build — and the Maestro
flows (`mobile/.maestro`). Record it in `docs/verification/<date>-qa.md`.
Ship nothing with an open failure on sign-in, signing, push or deletion.

### 6. Submit in the Publisher Portal

1. Open **publish.solanamobile.com** and connect the publisher wallet.
2. Open the app (**Elyra**) → **Releases** → **New Version**.
3. Upload the APK (or give its URL).
4. Fill in **What's New** from the release notes.
5. Press **Submit**, then **approve every signature the wallet asks for** —
   the release is minted on-chain, and it takes several transactions.
   Keep the publisher wallet funded with a little SOL for them.
6. The release enters review. Results come by email from
   publishersupport@dappstore.solanamobile.com, usually within 1–2 business
   days; an approved release **goes live immediately**. After 5 business days
   with no answer, ask in Solana Mobile's Discord, `#dev-answers`.

To change only the listing (text, screenshots), use **Store Listing**:
publishing listing changes alone mints a release that reuses the current APK.

### 7. After it's live

- Set `APP_LATEST_VERSION` to the new version in Vercel (Production) and
  **redeploy** — Vercel applies an env change only to a new deployment. Older
  builds then mention that an update exists.
- Tag the commit: `git tag mobile-v1.2.0 && git push --tags`.
- Watch crash reports (if enabled) and the inbox delivery logs for a day.

## Keeping the API compatible

Every app version at or above `minSupportedVersion` is still talking to
production, and an app update reaches people over days or weeks. So:

- **Additive changes only.** Add fields, routes and enum values; never
  rename or remove one a supported version reads, and never change what an
  existing field means.
- **New request fields are optional** with a server-side default, so an older
  build that doesn't send them still works.
- **Unknown values must stay harmless.** The app ignores fields it doesn't
  know. A new notification `kind` shows in an older build's inbox with the
  default bell (`mobile/src/app/notifications.tsx`), but its **push must use
  an Android channel older builds already created** (`ANDROID_CHANNEL` in
  `lib/notifications/types.ts`): Android drops a notification posted to a
  channel the app never made. Add a new channel only together with a
  `minSupportedVersion` that creates it, or map the new kind to an existing
  one.
- **Branch on the version when you must.** Every request names its build in
  the `x-elyra-app` header; a route that has to answer an old build
  differently compares it with `compareVersions` (`lib/appVersion.ts`). No
  route needs to yet.
- **Remove old behaviour only after** `minSupportedVersion` has passed every
  version that used it.
- **Test against the oldest supported build.** Keep its APK; install it on a
  test phone before a breaking-looking API change ships.

### Raising minSupportedVersion

`/api/app/config` serves `APP_MIN_SUPPORTED_VERSION` (Vercel env). A build
below it shows a blocking "Update Elyra" screen before anything else.

Raise it **only when an older build would break** — a security fix it lacks,
an API change it can't survive — never to push people onto a new feature.

1. Ship and get approved the version that fixes the problem; wait until it's
   live in the store (a blocked person must be able to update).
2. Set `APP_MIN_SUPPORTED_VERSION` in Vercel (Production) and **redeploy**.
3. The answer is cached for 60 seconds; within minutes older builds block.
4. Note it in `CHANGELOG.md` under the version that raised it.

## When a release goes wrong

There is no rollback in the dApp Store: a new release must have a **higher**
versionCode. So:

1. **Contain it from the server.** `/api/app/config` `features` switches off a
   broken feature in every build; an API fix ships in minutes.
2. **Ship a fix forward** as a patch version (rebuild the last good commit
   if needed — it gets a new versionCode) and submit it; mention the fix in
   What's New.
3. Only if the bad build is dangerous (it could lose funds or leak data):
   once the fix is live, raise `minSupportedVersion` past the bad version.

## Over-the-air updates (EAS Update): off

**Status: not enabled.** `expo-updates` is not installed, and nothing in the
app downloads JavaScript.

What the dApp Store's terms say, as read on 2026-10-24:

- The **Publisher Policy** (last updated 21 Jul 2026) does not mention
  over-the-air updates, dynamic code loading or remote code. Its nearest
  rules forbid "dApps that install other dApps or any other Content on a
  device without the user's prior consent" and WebViews that load
  "untrusted web Content".
- The **Developer Agreement** (last updated 30 Jun 2026) counts "bug fixes,
  updates, upgrades" as part of the Developer Application, and §2.1 says
  delivery "will be made by electronic transmission to the dApp Publishing
  Platform" — which reads as: updates go through the portal and its review.
- The **Submit an Update** guide describes only portal releases.

That is unclear, so it stays off. **To settle it**, ask in Solana Mobile's
Discord `#dev-answers`:

> Elyra (xyz.getelyra.app) is an Expo app. May we ship JavaScript-only fixes
> with EAS Update (expo-updates) between reviewed releases — same native
> code and permissions, signed and served by Expo — or must every change go
> through a New Version in the Publisher Portal?

Record the answer, with a link, here before changing anything.

### If Solana Mobile allows it

Only for **JavaScript-only fixes within the same runtime version** — never
for anything that changes native code, permissions, the signing flow's
behaviour, or what the store reviewed the app as.

1. `cd mobile && npx expo install expo-updates`, then
   `eas update:configure` (adds the update URL and project id).
2. In `app.config.ts`: `runtimeVersion: { policy: "fingerprint" }`. The
   fingerprint changes whenever native code or config does, so an update can
   never reach a build whose native side it doesn't match. (Read the
   installed `expo-updates` docs first, per CLAUDE.md.)
3. Channels in `eas.json`: `"channel": "production"` on the `dapp-store`
   profile and `"channel": "preview"` on `preview`.
4. Ship to preview first: `eas update --channel preview --message "…"`, run
   the relevant QA items on a preview build, then
   `eas update --channel production --message "…"`.
5. Record each update in `CHANGELOG.md` under the store version it patches.
6. **Roll back** a bad update with `eas update:rollback` (choose the
   production channel and the previous good update), or republish the last
   good group with `eas update:republish --group <id>`. Confirm on a phone
   that the next cold start runs the restored bundle.
7. Add the update host to the privacy policy (Expo serves the bundle and
   sees the phone's IP) and to `docs/QA.md`.

## Crash reporting (Sentry)

Built in, **off until configured**: the app reports only when
`EXPO_PUBLIC_SENTRY_DSN` is set, and never from a development build
(`mobile/src/lib/crash`). Every event is scrubbed on the phone before it is
sent — wallet addresses, signatures, tokens, Privy ids, emails and URL query
strings are removed, the user and request headers dropped
(`scrub.ts`, tested in `scrub.test.ts`). `sendDefaultPii` is off; no
screenshots, view tree, sessions or performance traces.

To turn it on:

1. Make sure the privacy policy published at getelyra.xyz/privacy lists
   Sentry (the draft in `docs/legal/privacy-policy.md` does). **Don't set the
   DSN before it is published.**
2. Create a Sentry project (React Native). In its settings:
   - **Security & Privacy → Prevent Storing of IP Addresses: on**;
   - **Data Scrubber** and **Use Default Scrubbers: on**;
   - **Advanced Data Scrubbing**: replace, in all event fields, matches of
     `[1-9A-HJ-NP-Za-km-z]{32,90}` (Solana addresses and signatures),
     `0x[a-fA-F0-9]{40}` (EVM addresses), `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
     (tokens) and `did:privy:[A-Za-z0-9]+`. The app scrubs every JavaScript
     event itself, but a crash inside Android's own code is captured natively
     and only this server-side rule reaches its text;
   - data retention as short as the plan allows, and the region (EU/US)
     the privacy policy names.
3. EAS environment variables for the `production` environment:
   `EXPO_PUBLIC_SENTRY_DSN` (plain), `SENTRY_ORG`, `SENTRY_PROJECT`, and
   `SENTRY_AUTH_TOKEN` as a **secret** (it uploads source maps during the
   build; without it the build still succeeds, with unreadable stacks).
4. Build, install, and confirm a test error arrives scrubbed (throw from a
   development-only button on a preview build, then remove it).

## Release record

### 1.0.0 (versionCode 3) — built 2026-10-25

| | |
|---|---|
| EAS build | `d30d4c16-9403-4994-99b1-78e0d15a59c4` — https://expo.dev/accounts/kunalempire/projects/elyra/builds/d30d4c16-9403-4994-99b1-78e0d15a59c4 |
| APK | https://expo.dev/artifacts/eas/O50TxKqXIPoH4mdYBttY-u_VyS3DzkFKBUsh9izxmb4.apk — 59,924,249 bytes (57.1 MB) |
| APK SHA-256 (file) | `cfb3a343792b4873f40a3ac9a0c3fd726d941727bd81ed719b170b05cd8b74df` |
| Package | `xyz.getelyra.app`, versionName `1.0.0`, versionCode `3` |
| SDK | minSdk 24, targetSdk 36, compileSdk 37 |
| ABI | `arm64-v8a` only |
| Debuggable / backup | no / no (`pkgFlags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]`) |
| Signing | APK Signature Scheme v2, one signer; EAS credentials "Build Credentials giFL0d8b5-" (the project's default keystore) |
| **Signing certificate SHA-256** | **`05:7B:CA:59:84:DA:86:52:61:E8:5B:3C:A1:CE:B0:6E:C3:21:47:B6:A9:E1:3A:75:DB:B6:22:95:7D:AA:CF:5D`** |
| Certificate SHA-1 | `B6:E5:0B:63:B6:76:E4:E1:D2:0D:A5:C9:E2:C9:4E:B3:7B:58:7F:A7` |

Where the SHA-256 goes:
- Vercel `ANDROID_CERT_SHA256` (project `elyra-dashboard-x1jo`) — ✅ set
  and redeployed; `https://api.getelyra.xyz/.well-known/assetlinks.json`
  serves it with both relations.
- `https://getelyra.xyz/.well-known/assetlinks.json` — ❌ getelyra.xyz is the
  `elyra-frontend` project; it must serve the same file (App Links and
  passkeys are checked on getelyra.xyz).
- Privy → Settings → allowed Android key hashes — ⬜ yours.

Earlier versionCodes: 2 was build `cb989d51`, which failed at "Install
dependencies" (EAS's default pnpm 11 refuses unapproved build scripts and
ignores `node-linker=hoisted`); `eas.json` now pins pnpm 10.19.0 for every
profile. versionCode 1 was never built for the store.

Permissions in the APK (aapt): INTERNET, POST_NOTIFICATIONS, CAMERA,
RECORD_AUDIO, USE_BIOMETRIC — plus, from libraries and kept on purpose,
ACCESS_NETWORK_STATE, WAKE_LOCK, c2dm RECEIVE (push), USE_FINGERPRINT
(biometrics on Android 7–8), VIBRATE (haptics), MODIFY_AUDIO_SETTINGS
(dictation) and AndroidX's own DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION. The
rest are blocked in `app.config.ts`, with the reason for each.

### Checklist results (docs/QA.md on this APK, against production)

| Check | Result |
|---|---|
| `apksigner verify` | ✅ v2, one signer, the certificate above |
| `aapt dump badging` | ✅ package, versionName/Code, target SDK 36, arm64-v8a |
| Installs on the Seeker (replacing the debug-signed development build) | ✅ |
| Cold launch | ✅ JS runs (`Running "main"`), no crash in logcat |
| Production API smoke (`pnpm smoke`) | ✅ 6 pass, 2 skipped (token, cron secret) |
| Sign-in, signing (swap/transfer), push, links, resilience, layout, deletion | ⬜ pending — the phone was locked; needs an unlock and a sign-in |

## Backing up the dApp Store keystore

The keystore lives in your EAS account (`kunalempire`). The dApp Store will
only accept updates signed with it — lose it and Elyra can never be updated.

```sh
cd mobile
eas credentials -p android
#  → build profile: dapp-store
#  → Keystore: Manage everything needed to build your project
#  → Download existing keystore
```

It saves a `.jks` file and prints the keystore password, key alias and key
password. Store all four together **offline** — e.g. an encrypted USB drive
plus your password manager — and never in this repo or a cloud folder that
syncs it unencrypted. Check the backup: `keytool -list -v -keystore
<file>.jks` must show SHA-256 `05:7B:CA:…:CF:5D`.

Every EAS profile (development, preview, dapp-store) signs with this same
default keystore, so preview APKs share the store signature. That's fine;
just never publish a preview APK.
