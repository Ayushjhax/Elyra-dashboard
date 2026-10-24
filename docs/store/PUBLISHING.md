# Publishing Elyra on the Solana dApp Store

Your checklist, in order. Part A must be all green before Part B. Sources:
Solana Mobile's "Submit a New App" and Listing Page Guidelines (read
2026-10-24), the Publisher Policy (21 Jul 2026) and the Developer Agreement
(30 Jun 2026). Copy for every field is in `docs/store/listing.md`.

---

## Part A — Before you open the portal

Status as of 2026-10-24. ✅ done · ❌ blocking · ⬜ yours to do.

### A1. The API the release build talks to

- ❌ **`api.getelyra.xyz` has no DNS record**, and **getelyra.xyz runs an
  older deployment** without the app's routes (`/api/health`,
  `/api/app/config` and `DELETE /api/account` answer 404). A dApp Store build
  would open to a dead API.
  1. Deploy the current `main` to the Vercel project (Production).
  2. Vercel → Project → Settings → Domains → add `api.getelyra.xyz`; at your
     DNS provider add the CNAME record Vercel shows.
  3. Production env vars in Vercel, from `.env.example`: everything the
     website already has, plus `APP_MIN_SUPPORTED_VERSION` (leave unset for
     1.0.0), `APP_LATEST_VERSION=1.0.0`, `EXPO_ACCESS_TOKEN` (optional), and
     `ANDROID_CERT_SHA256` (after A3). Redeploy after any change.
  4. Supabase: the production project has migrations `0014`–`0016` and the
     private `research-reports` bucket (report PDFs).
  5. Check: `curl https://api.getelyra.xyz/api/health` → JSON with
     `"ok": true`; `curl -X DELETE https://api.getelyra.xyz/api/account` →
     `401`.

### A2. The EAS build environment

- ❌ **The EAS `production` environment has only `GOOGLE_SERVICES_JSON`.**
  Add (`eas env:create --environment production`, or expo.dev → Project →
  Environment variables):
  - `EXPO_PUBLIC_API_URL=https://api.getelyra.xyz`
  - `EXPO_PUBLIC_PRIVY_APP_ID` — the website's Privy app id
  - `EXPO_PUBLIC_PRIVY_CLIENT_ID` — the **Android** client for
    `xyz.getelyra.app` (Privy → Settings → Clients)
  - (later, for crash reports) `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
    `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (secret) — see `docs/RELEASE.md`.
- ❌ **Every earlier EAS cloud build failed in "Install dependencies"**
  (2026-10-22 and -23; logs expired). Run `eas build -p android --profile
  preview` first and read that phase's log; send it to me if it fails.

### A3. The release build and its key

- ⬜ `cd mobile && eas build -p android --profile dapp-store`. On the first
  run EAS asks to **generate a keystore — say yes once**, then:
  - `eas credentials -p android` → `dapp-store` → **Download keystore**, and
    store it with its passwords in two safe places. The dApp Store accepts
    updates only signed with this key, forever.
  - Copy its **SHA-256 fingerprint** (same menu).
- ⬜ Put the fingerprint in three places:
  1. Vercel `ANDROID_CERT_SHA256` → redeploy → `curl
     https://getelyra.xyz/.well-known/assetlinks.json` shows it (✅ the route
     now grants both App Links and passkeys).
  2. Privy dashboard → Settings → **allowed Android key hashes** (passkey
     sign-in).
  3. Nothing else — keep it out of the repo.
- ⬜ Verify the downloaded APK:
  ```sh
  apksigner verify --print-certs elyra.apk | grep SHA-256   # = the fingerprint
  aapt dump badging elyra.apk | grep -E "package:|versionCode|versionName"
  # package: name='xyz.getelyra.app'  versionName='1.0.0'  versionCode='2' (or higher)
  ```
  The package name is final (`xyz.getelyra.app`) and can never change. The
  versionCode comes from EAS (remote, auto-incremented; it was 1 with no store
  upload yet), so it is higher than anything uploaded before.

### A4. Policies and the account rules

- ✅ https://getelyra.xyz/privacy and /terms answer 200 over HTTPS.
- ❌ **The live privacy policy (22 Oct 2026) doesn't cover the app**: no
  Android app, Anthropic, Supabase, push via Expo/FCM, or Sentry. Publish the
  reviewed version of `docs/legal/privacy-policy.md` and `docs/legal/terms.md`
  (they carry [LAWYER]/[OPERATOR] marks). The Publisher Policy requires the
  privacy policy to disclose collection, use and disclosure of user data.
- ⬜ **Account deletion on production**: after A1, sign in on the release
  build with a throwaway email, delete it (Account → Settings → Delete
  account), and confirm the sign-in screen says it was deleted. Required by
  the Publisher Policy.
- ✅ The app links the privacy policy and terms (sign-in screen and Help &
  legal), has the disclosures, and offers in-app deletion.

### A5. Reviewer access

- ⬜ **A reviewer test account.** Privy dashboard → User management →
  Authentication → Advanced → **Test accounts**: enable it; it gives an email
  and a fixed code. Sign in with it once on the release build, fund its
  embedded wallet with a few dollars of SOL and USDC, set one price alert,
  ask Elyra one question. Keep the email/code for the review inquiry (copy in
  `listing.md`, "Notes for the reviewer").

### A6. Listing assets

- ✅ Icon 512×512, no transparency: `docs/store/assets/icon-512.png`.
- ✅ Banner 1200×600: `docs/store/assets/banner-1200x600.png`.
- ❌ **Screenshots (4–8, 9:16, ≥ 1080 px, ≤ 3 MB)** — not captured. Do it
  from the release build with the reviewer/demo account:
  `docs/store/screenshots.md`.
- ⬜ Optional video: `.mp4`, ≤ 30 MB, 1080p.

### A7. Final QA

- ⬜ `docs/QA.md` on the dApp Store APK (not a development build). At least:
  sign-in, a swap and a transfer with cents, a push from a killed app, App
  Links, deletion. Record it in `docs/verification/<date>-qa.md`.

### A8. The publisher wallet

- ⬜ A **new** Solana wallet in a browser extension (Phantom, Solflare or
  Backpack), used only for publishing Elyra. Solana Mobile recommends a
  dedicated one.
- ⬜ Fund it with **≥ 0.2 SOL**. The docs don't state the amount; each
  submission mints NFTs and signs several transactions, and ArDrive storage
  (below) is paid separately.
- ⬜ **Back up its recovery phrase offline.** The portal requires this exact
  wallet for every future release of Elyra; losing it means losing the app.

---

## Part B — In the Publisher Portal

### B1. Account and profile

1. Go to **https://publish.solanamobile.com** → sign up with your email,
   name and password → enter the emailed code.
2. **Publisher profile**: choose **Individual** or **Organization**, enter the
   name and **website** `https://getelyra.xyz` (must be public and about you
   or the app).
3. **KYC** (individual) or **KYB** (organization). You can skip it at
   profile creation, but **you can't add a dApp until it's approved**. If it
   stalls: get the Developer role in `#developer` on the Solana Mobile
   Discord, then open a **KYC / KYB Verification Issue** ticket in
   `#dev-answers`.

### B2. Wallet and storage

4. **Connect Wallet** → the publisher wallet from A8. It becomes the
   publisher wallet permanently.
5. **Storage**: uploads go to Cloudflare R2 by default. To use **ArDrive**:
   **Settings → Preferences → storage provider → ArDrive**.
   - Cost, from ArDrive Turbo's live price on 2026-10-24: **≈ $7.40 per
     100 MB** (1 GiB ≈ $76). A release is the APK (~57 MB for arm64; check
     your APK's size) plus the icon, banner and screenshots (~5 MB), so
     **≈ $5 per release**, paid again for each new version. Re-check at
     https://ardrive.io before topping up, and top up with margin (e.g. $15).
   - ArDrive storage is permanent; R2 is free to you. Either is fine for
     the store.

### B3. Add the dApp

6. **Add a dApp** and fill the form from `docs/store/listing.md`:
   - **Package name**: `xyz.getelyra.app` — exactly; case-sensitive; can't
     be changed later.
   - Website, support email, contact email, terms, privacy policy (the
     portal checks each link is public HTTPS).
   - Name, short description, long description, icon, banner, screenshots.
7. Press **Save** and approve the wallet transaction — this mints the **App
   NFT**. ("Save and continue later" keeps a draft without minting.)

### B4. The first release

8. **Releases → New Version**.
9. Upload the APK from A3 (or paste its URL).
10. **What's New**: from `listing.md`.
11. **Submit**, then **approve every signing request** the wallet shows, one
    after another, without closing the window. Skipping or rejecting one
    leaves the submission incomplete (assets missing) — Solana Mobile's guide
    says skipping any request prevents the submission from completing. If a
    request fails or you rejected one by mistake, stop and ask in
    `#dev-answers` before submitting again, so you don't mint a duplicate
    release.
12. The release shows **In Review**.

---

## Part C — Review

- Results come by email to your developer address from
  **publishersupport@dappstore.solanamobile.com**, typically within **3–4
  business days** (allow 5). Apps are reviewed in submission order.
- No reply after **5 business days**: submit an **App Review Inquiry** in
  `#dev-answers` on the Solana Mobile Discord (discord.gg/solanamobile).
- **Approved**: it goes live immediately, under a category Solana Mobile
  picks. Then set `APP_LATEST_VERSION=1.0.0` in Vercel (redeploy), tag
  `mobile-v1.0.0`, and fill in the date in `CHANGELOG.md`.

### If it's rejected

1. Read the email for the exact reason; don't guess.
2. The common ones and their fixes:
   - **Website unreachable or not about the app** → make getelyra.xyz load
     and say what Elyra is.
   - **Terms or privacy link broken / not public** → open both in a private
     window; fix redirects or auth walls.
   - **Policy content** (data disclosure, deletion, financial claims) → fix
     the policy or the copy; nothing in the listing may promise returns.
   - **App doesn't work for the reviewer** → test the reviewer account on the
     release build against production; fix the API, not just the app.
3. If the fix is in the app: bump `version` (e.g. 1.0.1), rebuild
   (`eas build --profile dapp-store`, same keystore — the versionCode rises on
   its own), **Releases → New Version** again, and say what changed in What's
   New.
4. If only the listing or links changed: fix them in **Store Listing** and
   resubmit; no new APK needed.
5. Unclear or you disagree: ask in `#dev-answers` (App Review Inquiry),
   quoting the rejection email.

---

## After launch

Every later version follows `docs/RELEASE.md` ("Shipping a new version"),
with the same keystore and the same publisher wallet.
