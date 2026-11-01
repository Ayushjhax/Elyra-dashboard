# Elyra Android — manual QA

What automation can't check. Unit tests (`pnpm test` in both projects) and
the Maestro flows (`mobile/.maestro`, see its README) cover the rest. Run
this list on a release candidate before every dApp Store submission, on a
**preview or dapp-store build** — not the development client, whose dev menu
and LogBox change what you see.

Record each run in `docs/verification/<date>-qa.md`: the build, the device,
each item's result, and a screenshot for anything that failed.

**Devices:** a Solana Seeker (or Saga) for Seed Vault; any Android 13+
phone with Phantom and Solflare installed; an Android tablet or a tablet
emulator. Fund each test wallet with ~0.05 SOL and a little USDC.

**Never** use a wallet holding real savings. Swaps and transfers below move
real funds on mainnet; keep them to cents.

## 1. Wallet sign-in (Mobile Wallet Adapter)

For each wallet: **Seed Vault** (Seeker), **Phantom**, **Solflare**.

- [ ] Signed out, tap **Connect a Solana wallet**. The wallet app opens and
      names the app as "Elyra" with its icon.
- [ ] Approve the connection, then the sign-in message. The app lands on
      Markets, signed in; Account shows "Wallet sign-in" and that wallet's
      address.
- [ ] Decline the connection: the sign-in screen says it was cancelled and
      nothing else happens.
- [ ] Decline the message signature: same, and no account is created.
- [ ] Sign out, then sign in with the same wallet: the same account (same
      alerts and conversations).

## 2. Signing: a swap and a transfer with each signer

Signers: the **embedded wallet** (sign in with email or Google), **Seed
Vault**, **Phantom**, **Solflare**.

For each signer:

- [ ] **Swap** 0.01 USDC → SOL. Review shows the route, the amounts and the
      fee; Confirm hands it to the wallet to approve. The result says Confirmed with a
      Solscan link, and the balance updates.
- [ ] **Transfer** 0.001 SOL to a second address you own (try **Scan** with
      its QR code). Same review, confirm, and a confirmed result.
- [ ] Decline in the wallet: "Cancelled — nothing was signed." No pending
      transaction appears in Activity.
- [ ] External wallets only: connect the wallet app with a **different
      account** than the one signed in, then try to sign. The app refuses
      ("connected with a different address … Nothing was signed") and the
      wallet never shows the transaction.
- [ ] Leave a swap quote open for over 20 seconds, then confirm: the app
      re-quotes and shows the new numbers before anything is signed.

## 3. Permissions

- [ ] `aapt2 dump permissions` on the release APK lists only INTERNET,
      CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, POST_NOTIFICATIONS,
      VIBRATE, and Firebase's ACCESS_NETWORK_STATE, WAKE_LOCK and c2dm
      RECEIVE — no SYSTEM_ALERT_WINDOW, storage, USE_BIOMETRIC or
      USE_FINGERPRINT (the dApp Store's PER-001).

## 4. Push notifications

- [ ] Fresh install, signed in: notifications are asked for in context
      (after setting the first alert, or in Account → Notifications), not at
      launch.
- [ ] **Killed app:** swipe Elyra away from recents. Set a price alert just
      past the current price beforehand. The push arrives; tapping it
      cold-starts the app straight onto the asset.
- [ ] App in the background: the push arrives; tapping it opens the screen.
- [ ] App open: the inbox badge counts up; no duplicate system notification
      for something already on screen.
- [ ] Turn the **Price alerts** channel off in Android's app settings: the
      app says pushes are off for price alerts and the inbox still gets them.
- [ ] Sign out: no further pushes arrive for that account on this phone.

## 5. Links

App Links need `assetlinks.json` live on getelyra.xyz with the release
fingerprint (see `docs/PORTING_MAP.md`, Release).

- [ ] `adb shell pm verify-app-links --re-verify xyz.getelyra.app`, then
      `adb shell pm get-app-links xyz.getelyra.app`: getelyra.xyz is
      **verified**.
- [ ] Tap `https://getelyra.xyz/r/<code>` in a chat app or email: Elyra
      opens (not the browser). Signed out, the sign-in screen says "Invited
      by a friend · CODE".
- [ ] Fresh install from that link, then sign up with a new email: the
      referral appears in the inviter's Account → Referrals.
- [ ] Open a second, different referral link before signing up: the first
      code is kept.
- [ ] `elyra://asset/SOL`, `elyra://wallet`, `elyra://notifications`,
      `elyra://research/report/<id>`: each opens its screen, signed in and
      from a killed app.
- [ ] `elyra://swap?amount=999`, `elyra://dev`, `elyra://asset/%3Cscript%3E`:
      the app opens on Markets and nothing else happens.
- [ ] Open a getelyra.xyz link that isn't `/r/…` (e.g. `/privacy`): it opens
      in the browser, not the app.

## 6. Resilience

- [ ] **Background restore under low memory:** open an asset screen and
      start an Ask Elyra answer. In Developer options set **Background
      process limit → No background processes** (or run
      `adb shell am kill xyz.getelyra.app` while it's in the background).
      Open a few other apps, then return. The app restores signed in, on a
      sensible screen, with no crash; the answer either finished or says it
      was interrupted with Retry. Reset the limit afterwards.
- [ ] Rotate-lock off and change the system font size while the app is open:
      it re-lays out without losing the screen you were on.
- [ ] **Airplane mode** on, then pull to refresh on Portfolio, open Markets
      and send an Ask Elyra question: each says it can't reach Elyra, shows
      the last reading labelled stale (never $0.00), and recovers on its own
      when the network returns.
- [ ] Airplane mode **during** a swap's confirm: the app says it couldn't
      submit and doesn't claim success; Activity shows the real outcome once
      online.
- [ ] **Slow network:** Developer options → Networking, or a throttled
      Wi-Fi (e.g. 3G profile on a router / Charles). Every screen shows a
      loading state rather than empty or zero values; Ask Elyra still
      streams; requests time out with words, not a spinner forever.
- [ ] Leave the app in the background for 10+ minutes: polling stopped
      (battery stats), and returning refreshes every visible figure.

## 7. Layout

- [ ] **360dp phone** (`adb shell wm density` so the width is 360dp, e.g.
      533 on a 1200px-wide screen; reset with `wm density reset`): Markets,
      Portfolio, Elyra, Research (every tab), Account, Settings, Wallet,
      Swap, Transfer, an asset, the inbox. Nothing is cut off or overlaps;
      the bottom tabs read in full.
- [ ] **Font size 1.3** (Display size and text → Font size): the same
      screens are usable; dense rows (tabs, tables) stay on one line.
- [ ] **Tablet** (a real tablet, or `wm size 1600x2560` + `wm density 320`):
      tables show more columns instead of cards; sheets are sized sensibly;
      the asset screen keeps the chart as the focus.
- [ ] **TalkBack** on: walk sign-in, Markets → asset → set an alert, Ask
      Elyra, the wallet sheet, a swap review, Settings. Every control reads
      its name and state; nothing is "unlabelled button"; the swap review's
      amounts are read in full.

## 8. Account and store policy

- [ ] Account → Help & legal: the privacy policy and terms open at
      getelyra.xyz; Email support opens the mail app with the version and
      device model and nothing about the account.
- [ ] Delete account (on a throwaway account): both steps, type DELETE;
      the app signs out and says the account was deleted; signing in with
      the same email creates a new, empty account; the website shows it
      gone too.
- [ ] No mention of Telegram anywhere in the app, and nothing implies
      endorsement by Solana Mobile or any venue.
