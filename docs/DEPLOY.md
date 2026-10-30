# Deploying the API (and website) to production

"apps/api" in the build prompts is this repo's root Next app (`app/api`,
`lib/`) — the same app and the same Vercel project as the website
(CLAUDE.md). There is no separate folder to deploy. The Android app
(`mobile/`) is excluded by `.vercelignore`.

Nothing in this document changes production by itself. Each step that does
is yours to run.

## Status — 2026-10-31

| | |
|---|---|
| Supabase production project | `qbsruodfkjinhzgcohla`, AWS `ap-northeast-1` (Tokyo) |
| Migrations 0001–0016 | ✅ applied |
| Delivery schedule (0013, pg_cron) | ✅ 200 every five minutes |
| `research-reports` storage bucket | ✅ created (private, PDFs, 20 MB) |
| `api.getelyra.xyz` | ✅ this project; `pnpm smoke` passes |
| getelyra.xyz | ✅ the website (`elyra-frontend`); `/.well-known/assetlinks.json` and `/r/*` are rewritten to the API |
| Deployed Supabase variables | ✅ the live bundle names `qbsruodfkjinhzgcohla`, and a referral code resolves through the service key (the 2026-10-26 `dmxldhqz…` URL is gone) |
| Function region | `hnd1` (Tokyo), from `vercel.json` — see "The project" below |
| `ELYRA_ENGINE_URL`, `SMART_MONEY_TRACKER_URL` | unset; routes degrade cleanly (below) |
| Google sign-in | ❌ Google answers `redirect_uri_mismatch`: the Google OAuth client in Privy does not list `https://auth.privy.io/api/v1/oauth/callback` (section 3) |

## 1. Supabase

### Migrations

All applied. To re-check any time, the smoke test's authenticated call
(below) touches the app tables, or in the SQL editor
(https://supabase.com/dashboard/project/qbsruodfkjinhzgcohla/sql/new):

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('push_devices','notifications','push_tickets','app_notification_accounts');
-- 4 rows
```

### The delivery schedule (0013) — check, read-only

```sql
select jobname, schedule, active from cron.job where jobname = 'elyra-delivery';
select name from vault.secrets where name in ('elyra_api_url', 'elyra_cron_secret');
```

Expect one active job (`*/5 * * * *`) and both secret names. If
`elyra_api_url` exists, its value must be `https://api.getelyra.xyz` (see
`supabase/SCHEDULER.md` to update it).

### The research PDFs bucket

The code uses one bucket, named in `lib/research/store.ts`
(`research-reports`); there is no env var for it, so nothing to point. The
project has **no buckets at all** — report PDFs have never been stored (a
report still completes; its PDF download says it isn't available).

To create it — **only after you approve**; private, PDFs only, 20 MB cap:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-reports', 'research-reports', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
```

No storage policies are needed: only the server's service-role key reads or
writes it, and downloads use 60-second signed URLs.

## 2. Vercel

### The project

- **One project** serves getelyra.xyz and api.getelyra.xyz (README,
  "getelyra.xyz and api.getelyra.xyz are the same deployment").
- **Root directory:** the repo root (`.`). Framework: Next.js. Install
  command: `pnpm install --frozen-lockfile`. Build: `pnpm build`.
- **Node:** 24.x (`package.json` `engines`, matching CI). Settings →
  General → Node.js Version → 24.x.
- **Production branch:** `main`.
- **Function region:** `hnd1` (Tokyo), set by `regions` in `vercel.json`
  (Hobby allows one). Two reasons, both observed from the default `iad1`:
  Binance answers every US address with 451, so a connected Binance account
  could not be read at all and market reads had to fall through to OKX and
  Hyperliquid; and the database is in Tokyo, so every query crossed the
  Pacific. Keep the region next to the Supabase project.

### Domains

Settings → Domains → **Add** `api.getelyra.xyz` → at your DNS provider add
the `CNAME` Vercel shows (usually `cname.vercel-dns.com`). Keep
`getelyra.xyz` on the same project.

### Environment variables (Production)

Set with the CLI from the repo root (`vercel link` first), one per line —
it prompts for the value, so it never lands in your shell history:

```sh
vercel env add ANTHROPIC_API_KEY production
```

**Required to boot** (`lib/env.ts`):

| Variable | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL (`https://qbsruodfkjinhzgcohla.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` key (secret) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard → Settings → Basics → App ID |
| `PRIVY_APP_SECRET` | same page → App secret |
| `CREDENTIALS_ENC_KEY` | **generate** (below) |

**Needed by the app's main features:**

| Variable | Feature | Where it comes from |
|---|---|---|
| `SOLANA_RPC_URL` | wallet balances, activity, transfers | Helius dashboard → your RPC URL (with key) |
| `PYTH_API_KEY` (+ `PYTH_API_URL` if not default) | prices | your Pyth Pro / Douro Labs key |
| `JUPITER_API_KEY` | swaps | portal.jup.ag |
| `BIRDEYE_API_KEY` | token balances and prices | Birdeye dashboard |
| `GEMINI_API_KEY` | fallback model, dictation | aistudio.google.com |
| `CRON_SECRET` | the 5-minute delivery | **generate** (below); the same value as Vault's `elyra_cron_secret` |
| `APP_URL` | links in notifications | `https://getelyra.xyz` |
| `SEC_USER_AGENT` | SEC research | `Elyra ayushkmrjha@gmail.com` (SEC asks for a contact) |
| `ANDROID_CERT_SHA256` | App Links, passkeys | after the dApp Store keystore exists (`docs/store/PUBLISHING.md` A3) |
| `APP_LATEST_VERSION` | "update available" | `1.0.0` once approved; leave `APP_MIN_SUPPORTED_VERSION` unset |

**Optional:** `UPSTASH_REDIS_REST_URL`/`_TOKEN` (cache; Supabase is the
fallback), `PRIVY_VERIFICATION_KEY` (latency only), `EXPO_ACCESS_TOKEN`
(only if Expo "enhanced push security" is on), `TOKENOMIST_API_KEY` /
`COINMARKETCAL_API_KEY` (unlocks), `NEXT_PUBLIC_SOLANA_RPC_URL`,
`NEXT_PUBLIC_REFERRAL_BASE_URL`, `AGENT_MAX_RUNS_PER_DAY`, the model names,
the `ENABLE_*` flags (defaults in `.env.example`), `ELYRA_ENGINE_URL`,
`SMART_MONEY_TRACKER_URL`. Website only: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`.

### The two generated secrets

```sh
# CREDENTIALS_ENC_KEY — 32 random bytes, base64. Generated straight into
# Vercel and your clipboard, never echoed:
openssl rand -base64 32 | tee >(pbcopy) | vercel env add CREDENTIALS_ENC_KEY production
# Paste it into .env.local too (CREDENTIALS_ENC_KEY=…): local development
# uses the same database, and a key saved with one value can't be read with
# another. Safe to set now: production holds 0 stored exchange keys.
# Never rotate it once keys are stored — they become unreadable.

# CRON_SECRET — the scheduler's bearer token:
openssl rand -hex 32 | tee >(pbcopy) | vercel env add CRON_SECRET production
# Then put the same value in Supabase Vault (SQL editor):
#   select vault.create_secret('PASTE', 'elyra_cron_secret');        -- new
#   select vault.update_secret(id, 'PASTE') from vault.secrets
#     where name = 'elyra_cron_secret';                               -- existing
```

After changing any variable: **Deployments → Redeploy** (an env change
applies only to new deployments).

### The notifications cron

- `vercel.json` schedules `/api/notifications/deliver` **once a day**
  (`0 9 * * *`). That is the Hobby plan's limit: a more frequent Vercel cron
  fails the deploy.
- The real schedule — every 5 minutes — is Supabase **pg_cron + pg_net**
  (migration 0013, `supabase/SCHEDULER.md`), calling the same route with
  `CRON_SECRET`. Vault's `elyra_api_url` must be `https://api.getelyra.xyz`.
- On Vercel Pro you could instead set `*/5 * * * *` in `vercel.json` and
  unschedule the Supabase job (`select cron.unschedule('elyra-delivery');`).
  Don't run both.

### The two separate services

`ELYRA_ENGINE_URL` (signal engine) and `SMART_MONEY_TRACKER_URL` (tracker)
are other deployments, not part of this app. Unset in production, the routes
now answer at once instead of trying `localhost` (`lib/services.ts`):

| Route | Unset in production |
|---|---|
| `/api/signals` | `200`, empty list, `engineError: "The signal engine is not configured on this deployment."` — the panel says so |
| `/api/tracker/signals` | `200`, Elyra's own read of Hyperliquid's leaderboard instead (first cold call ~20 s, then cached) |
| `/api/tracker/stream` | `503 {"error":"tracker stream unavailable"}` — the app shows the consensus without live updates |
| `/api/tracker/wallets/…` | `503 {"error":"tracker not configured"}` |

## 3. Privy

Privy dashboard → **Settings → Clients** → the **Android** client used by
the app (`EXPO_PUBLIC_PRIVY_CLIENT_ID`):

- **Allowed app identifiers:** `xyz.getelyra.app` (the release package —
  the same for development and release builds).
- **Allowed Android key hashes** (Settings): the dApp Store key's SHA-256
  (for passkeys), plus the debug key's while you test with development
  builds.
- **Allowed origins** (web client, for the website): `https://getelyra.xyz`.
- **Test accounts** (Authentication → Advanced): on, for the store reviewer.
- **Google:** Login methods → Socials → Google uses this app's own Google
  OAuth client (`877460055713-9o7okcuq…apps.googleusercontent.com`). In
  Google Cloud → APIs & Services → Credentials → that client → **Authorized
  redirect URIs**, `https://auth.privy.io/api/v1/oauth/callback` must be
  listed, or Google refuses every sign-in with `redirect_uri_mismatch` — on
  the website and in the app alike.

## 4. Smoke test

```sh
pnpm smoke                                   # https://api.getelyra.xyz, read-only
SMOKE_TOKEN='<Privy access token>' pnpm smoke  # + an authenticated read
CRON_SECRET='<secret>' pnpm smoke              # + the cron, dry run (sends nothing)
pnpm smoke -- --base https://<preview>.vercel.app
```

A token: sign in on the website → DevTools → Application → Local storage →
`privy:token` (the value, without quotes). It expires within the hour.
`--live-cron` runs a real delivery pass; it's never the default.

## 5. Logs and uptime

- **Function logs:** Vercel → Project → **Logs** (filter by route, e.g.
  `/api/notifications/deliver`), or `vercel logs <deployment-url>`. Hobby
  keeps runtime logs only briefly — look soon after an incident.
- **The delivery tick's own record:** the SQL in `supabase/SCHEDULER.md`
  ("is it working?") shows each run and the API's HTTP status (401 = secret
  mismatch).
- **Uptime:** a free external monitor (UptimeRobot or Better Stack) on
  `https://api.getelyra.xyz/api/health`, every 5 minutes, alerting when the
  status isn't 200 **or** the body lacks `"ok":true`. It makes no upstream
  calls, so frequent checks cost nothing.
