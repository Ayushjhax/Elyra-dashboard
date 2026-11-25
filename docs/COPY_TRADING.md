# Copy trading

`/automation/copy` · `lib/copy/` · `app/api/copy/` · migration `0029_copy_trading.sql`

People group their automation rules into **rule sets**, can **share** a set,
and can **copy** a shared set into their own account. Elyra runs a few sets of
its own, so there is something to copy before anyone has shared one.

## What a copy is

A follower copies a set's new entries, not its positions. When one of the
set's rules enters, the five-minute tick opens the same trade in the
follower's account:

- **Size.** The follower's own size per trade.
- **Leverage.** The leader's, capped at the follower's ceiling.
- **Exits.** The leader's take-profit and stop-loss, as prices, measured from
  the mid now. The copy exits where the leader does.
- **Closing.** The copy closes when the leader's position closes, whatever
  closed it (target, stop, exit rule, or the owner's hand). Its own exits
  stand in between.

A copy is **skipped** when the price has already moved more than the
follower's allowance past the leader's entry (0.2–3%, against the follower).
It is also skipped when the price is past either of the leader's exits, or
too close to the target to be worth taking (`copyOrderFor`). A better price is
always copied.

## The one path

Copies are not a second trading system. The pass (`runCopy`,
`lib/copy/engine.ts`) runs on the tick right after `runAutotrade`, so a
leader's entry or exit from that tick is copied in the same tick.

- **Entries** go through `openMarketTrade` (`lib/autotrade/trade.ts`), the one
  market-order path. That means `accountGate` applies: paused, the day's loss
  limit, the open count, and one live position per coin. So do the live
  switch and the follower's approved key, and the row is written before
  anything is sent. A copy's row has `origin: 'copy'`, `copy_id` and
  `leader_position_id`. That pair is unique, so a leader entry is copied once
  per follow however many ticks overlap.
- **Closes** go through `closeTrade` (`lib/autotrade/close.ts`), the one close
  path, with `exit_reason: 'leader_closed'`.
- **Freshness.** Only entries made after the follow began, and within
  `COPY_LIMITS.freshMs` (two ticks), are copied.

Partial closes and moved exits are not mirrored.

## Records

A set's record is exactly the positions tagged with it (`trading_positions.set_id`).
The engine writes that tag at entry, as `fund_id` works for a fund, so moving
a rule between sets never rewrites history.

Records are kept in **returns on margin**, never dollars: a leader's size is
theirs. Each closed trade's result is divided by its margin, then summed
without compounding (`recordOf`).

A set's detail also shows a **backtest**: its rules replayed on Hyperliquid's
last 1,000 bars, exactly as the pass would trade them, paying `PAPER_COSTS`
(`simulateRule`, `lib/copy/backtest.ts`). It is always labelled "Backtest ·
not traded" beside the real record, never in its place.

## Sharing

A shared set is shown by its owner's **Arena handle**, never a wallet, and
sharing needs one. Others see the set's rules, entries, exits and returns on
margin, but never sizes. Unsharing or deleting a set stops new copies. Copies
already open still close with the leader.

## Elyra's own sets

`lib/copy/house.ts` defines three sets with five rules: BTC and ETH trends on
4h bars, SOL and HYPE breakouts on 1h bars, and a BTC short fade on 15m bars.
`ensureHouse` writes them from that file on the first tick or page read, so
the code is the one source of what the house trades.

- **Real rules.** They run in the ordinary pass, **on paper**, against
  Hyperliquid's mainnet bars and mid, and pay `PAPER_COSTS`. Their record is
  only what they have actually traded since they started.
- **Owner.** A profile whose `privy_did` (`elyra:house`) can never come from a
  Privy login, so nobody can sign in as it. The engine sends it no
  notifications.
- **Selection.** They were chosen for trade frequency and coverage (majors, a
  fast mover, both directions), not backtested returns. When they were
  chosen (2026-11-21), four of the five lost money over their last 1,000
  bars, and the page shows that.
- **No house capital.** Elyra holds no trading capital and no key of its own,
  so the house sets cannot trade live. Followers can copy them live into
  their own accounts.

## Live and mainnet

A follow starts on paper. Live is refused unless the server sends live
orders and the follower's trading key is approved on the server's network
(`liveRefusal`). Live orders are sent only with `AUTOTRADE_LIVE=1`, and go to
mainnet only with `HYPERLIQUID_NETWORK=mainnet`. Both are deployment
settings, not code defaults, so a preview deploy never trades real money.

## Limits

`COPY_LIMITS` in `lib/copy/rules.ts`:

| Limit | Value |
|---|---|
| Copies per account | 5 |
| Sets per account | 5 |
| Size per trade | `LIMITS.minSizeUsd`–`LIMITS.maxSizeUsd` |
| Leverage | 1–`LIMITS.maxLeverage` |
| Allowance | 0.2–3% |

The presets are Careful ($25, 1x, 0.5%), Standard ($100, 2x, 1%) and Bold
($250, 3x, 1.5%).

## Before mainnet

Unit tests hold the copy rules, the records and the replay. They cannot hold
the exchange. On testnet (`AUTOTRADE_LIVE=1`, `HYPERLIQUID_NETWORK` unset),
with two accounts:

1. As the leader, set an Arena handle, put a live rule in a set and share it.
2. As the follower, approve Elyra's trading key on testnet and copy the set
   live at $12–25.
3. When the leader's rule enters, confirm the follower's order on Hyperliquid
   testnet, with its take-profit and stop-loss resting at the leader's
   prices.
4. Close the leader's position by hand. Confirm the copy closes on the next
   tick, its exits are cancelled, and its result matches Hyperliquid's fills.
5. Pause the copy, let the leader enter again, and confirm nothing is copied.

Only then set `HYPERLIQUID_NETWORK=mainnet` on the production deployment. The
same holds for automation itself: the live signing path matches the
official SDK's test vectors, but a real order is the only proof.
