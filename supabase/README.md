# The database

One Supabase project serves the website and the Android app. Authentication
is Privy, so `auth.uid()` is never set and RLS is not what protects rows:
every table has RLS enabled with **no policies**. Only the server's
service-role client reads or writes, and every query filters by `user_id`.

## Applying migrations

Run the files in `migrations/` in order. Each one is idempotent, so running
it twice changes nothing.

- **SQL editor:** paste a file into
  https://supabase.com/dashboard/project/qbsruodfkjinhzgcohla/sql/new and
  click Run.
- **Supabase CLI:** `supabase link --project-ref qbsruodfkjinhzgcohla`, then
  `supabase db push`.
- **A fresh database:** paste `migrations/_apply_all.sql`, which is every
  migration in order. Rebuild it with `pnpm supabase:bundle`. That script
  needs the sibling `elyra-signals` repo; without it, append the new file to
  the bundle by hand in the same format.

`0013_delivery_schedule.sql` needs pg_cron, pg_net and Vault, which every
Supabase plan has. See [SCHEDULER.md](SCHEDULER.md) for its one-time setup.

## Tables

### Accounts

| Table | Purpose |
|---|---|
| `profiles` | One row per Privy account. The internal `id` every other table keys on, plus cached wallet addresses. |
| `exchange_accounts` | Read-only exchange connections. Credentials are AES-256-GCM encrypted with `CREDENTIALS_ENC_KEY`. |
| `watchlist` | A person's symbols, in `position` order. The app's watchlist; the agent and large-move alerts read it. |

### Telegram (website only)

| Table | Purpose |
|---|---|
| `telegram_links` | Which Telegram chat belongs to which account. |
| `telegram_link_codes` | Short-lived codes that link a chat. |
| `telegram_updates` | Telegram update ids already handled, so a retry never runs twice. |

### The assistant

| Table | Purpose |
|---|---|
| `conversations` | Agent chat threads. |
| `messages` | Agent chat messages. |
| `agent_runs` | One row per model run, for usage and fallbacks. |
| `usage_counters` | Per-account daily caps on model runs. |
| `personalized_memories` | Preferences Capital Intelligence saved, such as a concentration limit. |
| `personalized_conversations` | Capital Intelligence threads. |
| `personalized_messages` | Capital Intelligence messages. |

### Market and portfolio

| Table | Purpose |
|---|---|
| `market_cache` | Short-lived market data cache, used when Upstash is not configured. |
| `smart_money_findings` | Smart-money observations from the signals engine. |
| `portfolio_snapshots` | Portfolio values over time, for the 7-day line. |

### Referrals

| Table | Purpose |
|---|---|
| `points_ledger` | Points awarded, append-only. |
| `referrals` | Who referred whom, bound once at sign-up (first touch). |
| `referral_pools` | Pool bonuses as referrals activate. |

### Actions and notifications

| Table | Purpose |
|---|---|
| `prepared_actions` | Actions awaiting review, from `web`, `telegram`, `app` or `agent`. Confirmed only with an on-chain-verified `confirmed_signature`. |
| `telegram_notification_preferences` | Notification opt-ins. The name predates the app; the rows apply to **every** channel, push and the inbox included. |
| `telegram_notifications_sent` | One claim per notification event, so overlapping runs never send twice. Like preferences, it covers every channel. |
| `price_alerts` | Price alert rules. They tell, never trade. |
| `push_devices` | The app's registered phones (Expo push tokens). One account per token at a time. |
| `notifications` | The app's inbox. Every notification the app is sent lands here, whether or not the push arrives. |

### Prediction markets and research

| Table | Purpose |
|---|---|
| `prediction_probability_marks` | Probability readings, for move alerts. |
| `prediction_signals` | Generated prediction-market signals and their outcomes (an audit record). |
| `prediction_book_snapshots` | Order-book features recorded forward. |
| `prediction_alert_rules` | Prediction-market alert rules. |
| `prediction_watchlist` | Watched prediction markets. |
| `research_reports` | Research reports and their PDFs (in private storage). |
| `backtest_results` | Backtest runs and results. |
