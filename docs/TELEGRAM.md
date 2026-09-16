# Telegram

Telegram is a **channel onto Elyra**, not a second product. The same context
builder, the same orchestrator, the same memory table and the same
conversation store answer both surfaces; only the rendering differs. A limit
saved on the web applies in the chat, and "what changed since then?" works
across the two because they share a transcript.

If you are adding something here and it needs its own account model, its own
memory, or its own copy of a calculation, stop — that is the split this
architecture exists to prevent.

---

## Setting up the bot

### 1. Create it with @BotFather

In Telegram, message [@BotFather](https://t.me/BotFather):

```
/newbot
```

Give it a display name and a username ending in `bot`. BotFather replies with
an HTTP API token. **That token is a bearer credential for the whole bot** —
anyone holding it can read every message sent to it and send as it. Put it
straight into your secret store; never into a file you will commit, a chat, or
a prompt.

While you are there:

```
/setdescription     Read-only market and portfolio analysis.
/setabouttext       Elyra — your capital, in Telegram.
/setuserpic         (optional)
```

### 2. Environment

Server-side only. None of these may ever be prefixed `NEXT_PUBLIC_` — that
prefix inlines the value into the browser bundle, which for any of these is
equivalent to publishing it.

| Variable | What it is |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | From BotFather. Sends messages; verifies Mini App sessions. |
| `TELEGRAM_WEBHOOK_SECRET` | You generate it. Authenticates inbound webhook calls. |
| `TELEGRAM_BOT_USERNAME` | The `@name`, without the `@`. Used to build deep links. |
| `APP_URL` | Public `https://` origin Telegram can reach. |

Generate the webhook secret with:

```sh
openssl rand -hex 32
```

It must be at least 32 characters. The webhook compares it in constant time
and answers a mismatch with a bodyless 401 — an unconfigured endpoint and a
wrong secret look identical from outside, which is deliberate: a 500 would
advertise that the bot exists.

### 3. Register the webhook

```sh
npm run telegram:webhook              # set it
npm run telegram:webhook -- --info    # what Telegram currently has
npm run telegram:webhook -- --delete  # stop receiving updates
```

It reads `.env.local` then `.env`, so it needs no extra flags.

This also registers the command list, so Telegram's typed `/` menu matches
what the bot actually answers. A menu offering a command that does not exist
is worse than no menu.

`--info` is the first thing to run when the bot has gone quiet. It reports
`last_error_message`, which is usually the whole answer — an unreachable
`APP_URL`, an expired certificate, or a 401 from a rotated secret.

### 4. Notification delivery (optional)

Alerts are sent by a scheduled pass, not by the webhook. Point a cron at:

```
GET /api/telegram/deliver
```

every five minutes. The endpoint is authenticated — it sends messages to real
users, so an open one is a way to make Elyra spam every linked chat on demand.
It accepts either `Authorization: Bearer $CRON_SECRET` (what Vercel Cron
sends) or the `TELEGRAM_WEBHOOK_SECRET` you already have, so you do not have
to introduce a second credential to rotate.

`vercel.json` in this repo already declares it:

```json
{ "crons": [{ "path": "/api/telegram/deliver", "schedule": "*/5 * * * *" }] }
```

Vercel's Hobby plan allows one cron run per day. Sub-daily schedules need Pro;
on Hobby, drive the endpoint from any external scheduler instead.

Without this, alerts can be *set* but never *fire*. `/alert` says so.

### 5. The Mini App (optional)

In BotFather:

```
/newapp
```

Point it at `https://<your-app-url>/telegram`. Then `/setmenubutton` to put it
behind the chat's menu button.

---

## Linking an account

There is **no separate Telegram account system**. `telegram_links` maps a
Telegram user id to an existing Elyra profile, and a Telegram user who has not
linked gets an instruction — never an implicitly created account. An
auto-created account would be a second identity for the same person, with its
own memories, its own conversations, and no wallet.

The flow: the dashboard issues a six-character code bound to the session's
user id; the user sends `/link ABC234` to the bot; the webhook consumes the
code and writes the link. Codes expire in ten minutes and are single-use, and
every failure mode — wrong, expired, already spent — returns the same message,
because distinguishing them would confirm which codes exist in a space of only
32⁶.

---

## Security boundaries

These are the ones worth stating explicitly, because each protects against a
mistake that looks reasonable in a diff.

### Identity comes from `from.id`, never from message text

Telegram vouches for the sender's numeric id. It vouches for nothing else. A
message reading `show positions for user_id …` is a string a stranger typed,
and nothing in the command layer accepts a user identifier as input.

### A Telegram tap is not a signature

An inline button acknowledges; it does not authorise. Telegram authenticates a
*chat account*, which says nothing about custody of a wallet. Tapping a
prepared action moves it to `acknowledged` and returns a link — confirmation
happens on a surface that can verify the person.

Nothing in this repository can sign a transaction; there is no signing path in
it. The boundary is written down anyway so that adding one later cannot
accidentally turn a button into an authorisation.

### `callback_data` carries an opaque handle, never an action

Telegram hands `callback_data` back verbatim, so packing the action into it —
`swap:SOL:USDC:21.25` — makes the amount an *input to the webhook* rather than
a fact the server established. The button carries a random token; everything
that decides what happens is read from `prepared_actions`, scoped to the user,
and expires in ten minutes. A preview prepared against one price and tapped
twenty minutes later is a different trade.

### Never trust `initDataUnsafe`

The Mini App SDK exposes `initData` (a signed query string) and
`initDataUnsafe` (the same fields, already parsed). The second is named that
way for a reason: a Mini App is an ordinary web page in an ordinary webview,
and anyone can open its URL with a hand-written hash fragment. Reading
`initDataUnsafe.user.id` and looking up that account is an authentication
bypass with a convenient API.

The client sends the raw string; `lib/telegram/initdata.ts` verifies it
server-side with the bot token, which the browser never sees. `auth_date` is
range-checked in both directions so a captured string cannot be replayed and a
forged future timestamp cannot widen the window.

One detail everyone gets backwards:

```
secret = HMAC_SHA256(key = "WebAppData", message = <bot token>)
```

The **token is the message** and the literal `"WebAppData"` is the key — the
opposite arrangement from every other HMAC you will write. There is a test
that fails loudly if someone "fixes" it.

### Private figures stay in private chats

A group chat may ask about the market and nothing else. The gate runs *before*
any context is built, so a balance is never even read into memory somewhere it
could be rendered. The refusal names no figure and confirms nothing about
whether the asker has an account.

### Notifications are opt-in, and fail closed

Every channel defaults off in the schema. A missing preferences row means send
nothing, and so does a failed read — failing open would let a database blip
broadcast portfolios. Linking a chat is consent to *ask* questions; it is not
consent to be told things.

---

## Commands

| Command | Model call? | What it does |
| --- | --- | --- |
| `/portfolio` | no | total capital across every venue |
| `/wallet` | no | token holdings, unverified ones flagged |
| `/positions` | no | exposure and concentration |
| `/defi` | no | lending, leverage and vault positions |
| `/price SOL` | no | a quick price |
| `/markets [symbol]` | no | funding and mark price, or what markets are pricing |
| `/swap 1.5 SOL to USDC` | no | a **live** Jupiter quote — preview only |
| `/alert SOL > 120` | no | arms a price alert |
| `/alerts` | no | what Elyra is allowed to send you |
| `/watch [add\|remove] SOL` | no | watchlist, priced |
| `/orders` | no | resting orders on Hyperliquid |
| `/activity` | no | recent fills, with realised PnL |
| `/report [symbol]` | yes | the tool-loop agent |
| anything in plain language | yes | the Personalized runtime |

### What `/swap` does and does not do

It fetches a real Jupiter route for the user's own wallet: the actual output
amount, the actual guaranteed minimum after slippage, the actual price impact,
the actual route. Jupiter's order endpoint builds a transaction, so it needs a
taker and returns 400 for a wallet that cannot afford the trade — which means
a quote that came back was executable at the moment it was read.

It cannot execute, and it says so in the message rather than behind a button
that fails. Signing needs the user's key and there is no signing path in this
repository.

Symbols resolve through a short hand-verified allowlist, not a search. A fuzzy
match that resolves `USDC` to a lookalike mint is how a balance becomes a
worthless token with a familiar name; an unknown symbol is refused by name and
the reply lists what can be quoted.

Amounts are converted from the **decimal string the user typed**, never via a
double. `Number("1234.567891")` is `1234.56789099999991…`, and converting that
either drops the user's last unit or rounds up into a trade larger than the
balance it was sized against.

### Notifications

`/alert` arms a level; delivery happens in a scheduled pass over
`/api/telegram/deliver`. Three channels, all opt-in and all off by default:
price alerts, liquidation warnings, and large moves on watched symbols.

An alert is an **event, not a state**. `SOL > 120` evaluated continuously
fires on every tick for as long as it holds; the row is stamped on the first
crossing and goes quiet until re-armed.

Liquidation warnings are banded (20%, 10%, 5%) so drifting from 19% to 18%
does not notify again, and they only fire where the protocol publishes a
liquidation threshold — never from an estimate.

The deterministic commands answer from the **same semantic tools the model
calls**. That is the point: `/portfolio` and "what am I worth?" must never
disagree, and the only way to guarantee it is for both to read one
implementation. Paying a language model to format a table it cannot improve
would add latency, cost, and a chance of the figures changing on the way out.

`/orders` and `/activity` say they are not built rather than answering with an
empty list. "No open orders" and "Elyra cannot read your orders" are opposite
facts, and rendering them identically teaches users to ignore both.

---

## When something is wrong

**The bot has gone silent.** `--info`. If `last_error_message` names a 401,
the webhook secret in the environment and the one Telegram holds have
diverged; re-run the setup script.

**Replies are duplicated.** Every update is claimed by `update_id` before any
work starts, and the claim is an insert-then-ignore-conflict, not a
check-then-insert. Duplicates mean the claim is failing — check the
`telegram_updates` table and the log line `idempotency claim failed`.

**The Mini App says it cannot verify the session.** Either the bot token in
the environment is not the one that signed the `initData`, or the payload is
over an hour old. The log distinguishes a bad signature from a stale one; a
spike in the first is an attempt, not a stale tab.

**Buttons do not appear.** Two causes. `callback_data` over 64 bytes makes
Telegram reject the whole keyboard silently — `callbackDataFor` throws rather
than letting that happen. More likely: the webhook was registered without
`callback_query` in `allowed_updates`, so taps are never delivered at all.
`--info` shows what is registered; re-running the setup script fixes it.

**Alerts never arrive.** `/alert` only arms a level. Delivery is the cron at
`/api/telegram/deliver`; without it nothing fires. Check that price alerts are
also switched on in Elyra — every channel is off by default.

## Coverage

`/orders` and `/activity` read **Hyperliquid only**, which publishes both
against the wallet address with no credential. Every reply names what is not
covered, because "no open orders" silently meaning "on the one venue we can
see" is how someone forgets about a resting Binance order.

Binance open orders need a signed request against stored credentials. That is
buildable — the encrypted credential columns exist — but it was not built
here, and a coverage note is the honest interim.
