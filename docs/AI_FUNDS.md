# AI funds

An autonomous AI hedge fund needs three things: someone to own it, something
to manage it, and something to run it. In Elyra:

| Role | Who | What they do |
|---|---|---|
| Investor and board | The person | Writes the charter, puts capital in and takes it out, chooses the manager, pauses, resumes, graduates to live, winds down. |
| Portfolio manager | An AI agent with an Elyra key | Reads the book, opens and closes positions, keeps a journal — inside the charter, nothing else. |
| Administrator, risk officer, auditor | Elyra | Holds every order to the charter, marks the book to market, keeps units and the high-water mark, halts the fund at its drawdown limit, seals every event. |
| Venue and custodian | Hyperliquid, the person's own account | Holds the money and the take-profit and stop-loss of every position. |

The intelligence is plug-in: Claude, ChatGPT, Cursor or a bot of the person's
own manages the fund over MCP. What it depends on — the charter, the risk
desk, the books and the record — is Elyra's. That is the agent rails
(`docs/AGENT_RAILS.md`) applied to managing capital rather than single
transactions.

## The lifecycle

```
launch (paper) ──▶ active ◀──resume── paused
                     │  ▲                ▲
   drawdown limit    │  └─resume (high-water mark and the day restart)
   (Elyra, the tick) ▼
                   halted
                     │
  any open state ──wind down──▶ winding_down ──flat──▶ closed (wound down)
  paper with a record ──graduate──▶ closed (graduated) + a new live fund
```

1. **Charter.** Name, the manager's brief, markets (Hyperliquid perps:
   crypto, memecoins, Nasdaq stocks on trade[XYZ]), shorts on or off, the
   largest position as a share of NAV, gross exposure as a multiple of NAV,
   leverage, open positions, the drawdown at which Elyra halts it, the daily
   loss at which nothing new opens. Bounded by `FUND_LIMITS`
   (`lib/funds/policy.ts`), which are not settings.
2. **Launch and incubate.** Every fund starts on paper, at Hyperliquid's
   mainnet prices, paying the taker fee and slippage (`PAPER_COSTS`). Its
   manager is an existing agent key, a new one made at launch (shown once,
   with how to connect it and standing instructions to give it), or none yet.
3. **Operate.** The manager calls `fund_overview`, `fund_open_position`,
   `fund_close_position` and `fund_write_note` (`lib/funds/tools.ts`). Each
   open is held to the charter by `checkOrder` on a fresh mark, then to the
   trading limits (`validateMarketOrder`) and the person's account limits
   (`accountGate`, inside `openMarketTrade`). Three layers, each refusing on
   its own. The take-profit and stop-loss go to the exchange in the same
   request as the entry, so they hold between checks and if the agent stops.
4. **Administer.** Every five minutes, after the automation pass records any
   exits (`runFunds`, `lib/funds/run.ts`): mark the book; ledger closes made
   elsewhere (a TP/SL, a close by hand on Automation); seal the previous
   day's closing NAV on a new UTC day; raise the high-water mark; at the
   drawdown limit, halt and close every position; finish a wind-down; write
   the hour's mark.
5. **Graduate.** After `minIncubationDays` (7) and `minIncubationTrades` (3),
   with live trading switched on and Elyra's Hyperliquid key approved, a
   paper fund graduates: it closes with its record frozen, and a live fund
   opens with the same charter and manager and the capital the person
   allocates. Live capital is checked against the Hyperliquid account's
   value less what other live funds already claim, failing closed when the
   account cannot be read. A live record never contains paper results.
6. **Close.** Winding down closes every position now (retried on the tick if
   any fails) and closes the fund out once it is flat, with its final report
   in `final_report` and its manager released.

## Accounting

Capital moves in units at the NAV per unit (NPU) of the moment; the first
unit is worth 100. NAV moves with the book; NPU moves only with performance,
so every return Elyra shows is time-weighted — a deposit never reads as gain.
Drawdown is NPU against its high-water mark; today's loss is NPU against the
day's first mark.

NAV = capital in − capital out + realised + unrealised, where an open
position is marked at the mid after the taker fee on both legs. A position
with no live price is marked at its entry and the book says so (`stale`);
the manager cannot open anything while the book is stale, and capital cannot
move.

A fund's book is exactly the automation positions tagged with its id
(`trading_positions.fund_id`) plus its flows. One open position per coin per
fund is a database guarantee (`trading_positions_fund_coin_idx`).

## Invariants

- Nothing is pooled. A paper fund's capital is virtual; a live fund's is an
  allocation of the person's own Hyperliquid account, never a transfer, and
  Elyra's key there can trade and cannot withdraw.
- The manager cannot move capital, change the charter, choose paper or live,
  or reach any other fund or account. No fund tool takes a fund id.
- A key manages one open fund at a time (`ai_funds_manager_idx`), and sees the
  fund tools only while it does.
- Every decision — opened, refused, failed, closed, halted, every change the
  person makes — is in the person's hash-chained ledger, with what it was
  before. The receipt the manager gets is the event's hash.
- The manager's words (a thesis, a note) are stored as its words: shown as
  text, attributed to it, never acted on and never put in a notice. The
  ledger seals their SHA-256, not their text.
- Every status change is a compare-and-set on the status it expects, so the
  person and the tick cannot both win a transition.
- Elyra's own model never manages a fund (`CLAUDE.md`, AI safety).

## Known limits

- Live NAV does not yet include Hyperliquid funding payments, and a live
  position's realised result counts the closing fee only (as the automation
  records it). Paper NAV includes both legs' fees.
- One fund's orders are queued per instance; across instances the database's
  per-coin uniqueness and the account gate are the bounds.
- Live funds in one account share Hyperliquid's one-position-per-coin rule
  with the person's rules and orders (`accountGate`), so two live funds cannot
  hold the same coin at once.

## Next

- **Third-party capital** — other people allocating to a manager's fund — is
  design only. Pooling money is regulated activity, and the honest
  non-custodial path is an on-chain vault (Hyperliquid's own vaults) with the
  manager as its leader, after legal review. Nothing in Elyra takes anyone's
  money into anyone else's fund.
- **Public factsheets**: a fund's verified record (the sealed daily NAVs) as a
  shareable page, and a leaderboard of AI managers by risk-adjusted return.
- **Wake-ups**: a webhook to the manager when a position closes or the fund
  halts, so an agent need not poll.
- **Funding in live NAV**, and the opening fee in live results.
- **The Android app**: the Funds screens (`docs/PORTING_MAP.md`).

## Where things are

| | |
|---|---|
| Rules, limits, lifecycle (pure) | `lib/funds/policy.ts` |
| Units, NAV, stats (pure) | `lib/funds/accounting.ts` |
| Reading and marking a fund | `lib/funds/store.ts` |
| The manager's actions | `lib/funds/manager.ts`, `lib/funds/tools.ts` |
| The person's actions | `lib/funds/owner.ts` |
| Flatten, mark, close out | `lib/funds/lifecycle.ts` |
| The tick | `lib/funds/run.ts` (called from `/api/notifications/deliver`) |
| Routes | `/api/funds`, `/api/funds/[id]`, `/api/funds/[id]/positions/[positionId]`, `/api/funds/[id]/statement` |
| Pages | `/funds`, `/funds/[id]` (`components/funds/`) |
| Schema | `supabase/migrations/0025_ai_funds.sql` |
| Tests | `lib/funds/pure.test.ts`, `lib/funds/funds.test.ts` |
