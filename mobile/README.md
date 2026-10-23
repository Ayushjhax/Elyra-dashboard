# Elyra for Android

The Expo app published on the Solana dApp Store. It talks only to Elyra's API
(this repo's Next app) and shares the pure modules in `../lib` through the
`@/` alias. Rules live in the repo's `CLAUDE.md` ("The Android dApp") and in
`AGENTS.md` here.

## Run it

```bash
pnpm install                 # in mobile/
cp .env.example .env         # set EXPO_PUBLIC_API_URL
pnpm android                 # builds and installs a development build on the emulator
pnpm start                   # the dev server, for a development build already installed
```

The app needs a development build, not Expo Go: Mobile Wallet Adapter and the
other native modules are not in Expo Go.

### On a phone over USB

With USB debugging on and the phone plugged in, run `pnpm dev` in the repo
root (the API on port 3000), then in `mobile/`:

```bash
pnpm phone                   # forwards ports 8081 and 3000 over the cable, then starts Metro
```

Set `EXPO_PUBLIC_API_URL=http://localhost:3000` in `.env`; the forwarded port
makes the phone's `localhost` reach the Mac. Install the development build
once with `pnpm android` (or `adb install` an APK built for arm64-v8a), then
open Elyra on the phone. The forwarding is lost when the cable is unplugged,
so run `pnpm phone` again after reconnecting.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```
