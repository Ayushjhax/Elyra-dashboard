# Elyra Arena

Gamified trading judgment, not gamified trading. Arena makes trading fun
through judgment, community and visible improvement — never through trading
more often, with more size or with more leverage.

## Rules every Arena feature keeps

- **Points and paper only.** Points cannot be bought, sold, transferred or
  cashed out. Nothing in Arena moves money. Real-money ideas live in
  `docs/ARENA_REAL_MONEY.md` as design only.
- **The AI comments; it never decides.** Labels, outcomes, ratings and
  settlements are computed by code first. The model then writes a few
  sentences around those facts (`lib/arena/writer.ts`). Any reply that
  contains a number not in the facts, comes back empty or too long, is a
  refusal, or fails is replaced by text the code writes itself.
- **Scores reward calibration, not volume.** Calls are scored with the Brier
  score, and the puzzle rating is an Elo-style update on 1 − Brier. Neither
  pays for trading more, sizing up or adding leverage. The only streak is
  the daily puzzle's.
- **Privacy by default.** Calls are private unless the owner shares each
  one, either with their groups or publicly under a handle. A person is
  shown only by handle, never by wallet.
- **No emoji, sentence case, brand tokens only.**

## Phase 1 — built (web)

Route `/arena` sits beside the chart, with the tabs Puzzle, Calls, Reviews
and Groups (`components/arena/ArenaView.tsx`). `?tab=` opens a tab, and
`?trade=<position id>` jumps to that trade's review. A closed trade in
`/automation` links there.

### Trade Review

Each closed trade, paper or live, gets one label from `labelTrade`
(`lib/arena/review.ts`), judged against the trade's own plan. R is the
realised PnL divided by the planned risk (size × the distance from entry to
stop). A trade is "held to plan" if it closed at its take-profit, at its
stop-loss or by its rule's exit. The first matching row wins:

| Label | When |
|---|---|
| Blunder | Lost more than 1.5R, or abandoned the plan and lost more than 1R |
| Mistake | Lost more than 1.1R (the stop slipped), or abandoned the plan into any loss |
| Brilliant | Held to plan, won 2R or more, and kept at least 70% of the best move |
| Great | Held to plan and won 1R or more |
| Inaccuracy | Won, but kept less than 30% of the best move |
| Good | Held to plan and won, or took the planned loss at the stop |
| Inaccuracy | Anything else |

The facts come from the position row and from Hyperliquid candles over the
life of the trade (15m bars, or 1h bars for trades of 50 days or more): best
and worst price, the share of the move kept, heat, estimated paper fees, and
hold time. Coaching is written from those facts, and only Brilliant and
Blunder send a notice.

### Calls with receipts

A call says "{market} closes above or below $X at T, at N% confidence".
Confidence runs from 50 to 99, the horizon from 1 hour to 30 days, and the
call resolves on the minute.

- **Receipt.** The server computes SHA-256 over
  `"{canonical statement}|{server timestamp}"`. Nothing can edit or delete a
  call: the only routes are `POST`. Anyone holding the statement and the
  timestamp can recompute the receipt. The `onchain_signature` column is
  reserved for anchoring receipts on Solana later; nothing writes it yet.
- **Settlement.** A call settles on the tick at Hyperliquid's one-minute
  close for the minute that ends at the resolution time. If no such bar
  exists, the call waits; after three days it is voided, since Hyperliquid
  keeps about 3.5 days of one-minute bars. A call above the price hits only
  if the close is strictly above it, and a call below hits only if the close
  is strictly below.
- **Calibration.** The score is the mean Brier score, with buckets from
  50–59% up to 90–99%. A person is ranked only after 10 settled calls, and
  the number of calls behind the score is always shown.
- **Tail and fade.** Each person has 100 points per ISO week, with a
  whole-number stake of at least 1 on each backing. You can back a call
  once, never your own, and only until one hour before it resolves.
  Settlement pays plus or minus the stake, or 0 if the call is void.

### Daily chart puzzle

There is one puzzle per UTC day, the same for everyone, chosen from the date
by FNV-1a (`lib/arena/puzzle.ts`). It uses one of 10 markets and a moment
20–180 days back, shows 72 hourly bars rebased to 100, and hides the next 12.
The market and the date stay hidden until the person answers, so the answer
isn't a search away.

- **Answer.** The player picks up or down, with a confidence from 50 to 99%.
  An exact tie counts as down.
- **Rating.** The rating starts at 1500 and moves by 32 × ((1 − Brier) −
  0.75). A 50% answer never moves it; a right answer gains at most +8; a
  wrong answer at 99% costs about −23.
- **Bots.** There are two bots to beat. The coin-flip bot always says 50%
  and stays at 1500. The momentum bot says the last 12 bars continue, at
  60%, and its rating evolves day by day.
- **Share text.** There is no emoji, for example
  `Elyra Puzzle #41 · Up 70% · Correct · Rating 1,512 (+14)`.

The first request of the day builds the puzzle from real bars, and everyone
after that reads the same row.

### Groups and handles

Groups have up to 50 members, and a person can be in up to 10 groups. Each
group has an 8-character invite code. A handle is 3–20 characters from
`a–z`, `0–9` and `_`, and is unique. A public call needs a public handle. If
a person turns their profile private, their public calls disappear from
strangers' feeds and can no longer be backed by them.

### Tables (migration `0021_arena.sql`)

All tables have RLS on with no policies; the server reads and writes them
with the service role.

| Table | Holds | Unique |
|---|---|---|
| `trade_reviews` | label, facts (jsonb), coaching, coaching model | `position_id` |
| `arena_profiles` | handle, public | `user_id` (pk), `handle` |
| `arena_groups` | name, invite code, owner | `invite_code` |
| `arena_group_members` | membership | (`group_id`, `user_id`) |
| `arena_calls` | the call, receipt, settlement, Brier score, card | — |
| `arena_call_backings` | stance, points, ISO week, settled points | (`call_id`, `user_id`) |
| `arena_puzzle_days` | the day's chart, reveal, outcome, momentum bot | `puzzle_date` (pk) |
| `arena_puzzle_answers` | answer, rating before and after, streak | (`user_id`, `puzzle_date`) (pk) |

### Routes

| Route | Does |
|---|---|
| `GET /api/arena` | Everything the page shows, for the session's user |
| `POST /api/arena/calls` | Posts a call (append-only) |
| `POST /api/arena/calls/[id]/back` | Tails or fades a call with points |
| `POST /api/arena/puzzle` | Answers today's puzzle, once |
| `POST /api/arena/groups` | Creates a group, or joins one with `{ action: "join", code }` |
| `POST /api/arena/profile` | Sets the handle and whether the profile is public |

### The tick and model cost

`runArena` (`lib/arena/engine.ts`) runs on the five-minute delivery tick,
after the trading pass and before delivery. Each run:

- reviews at most **4** trades;
- settles at most **40** calls;
- writes at most **4** call cards.

Each review or card is one model call, capped at 220 output tokens with a
15-second timeout, through the agent's provider router. The worst case is
8 model calls per tick, or 96 per hour. A backlog clears over several ticks
rather than in one long run. In steady state, model calls track the number
of closed trades and settled calls, so a quiet day costs close to nothing.

## Phase 2 — data model only (not built)

Every table below follows Phase 1's rules: points only, RLS on with no
policies, service-role writes, and the AI writing only from computed facts.
None of these tables exists yet. Each will get its own migration when the
feature is built.

### Draft night

Fantasy leagues of markets: a snake draft, weekly head-to-head on percentage
performance, a waiver wire and trades between managers.

```sql
create table draft_leagues (
  id uuid primary key, name text not null, owner_id uuid not null,
  invite_code text unique not null, season text not null,          -- e.g. '2027-S1'
  roster_size int not null check (roster_size between 3 and 10),
  status text not null check (status in ('forming','drafting','active','done')),
  draft_starts_at timestamptz not null, created_at timestamptz not null
);
create table draft_managers (
  league_id uuid references draft_leagues, user_id uuid not null,
  draft_slot int not null, primary key (league_id, user_id),
  unique (league_id, draft_slot)
);
create table draft_picks (                    -- the draft itself, append-only
  league_id uuid, round int, pick int, user_id uuid not null,
  market text not null, picked_at timestamptz not null,
  primary key (league_id, round, pick)
);
create table draft_rosters (                  -- who holds what now
  league_id uuid, market text, user_id uuid not null,
  acquired_via text check (acquired_via in ('draft','waiver','trade')),
  acquired_at timestamptz not null,
  primary key (league_id, market)              -- a market belongs to one manager only
);
create table draft_matchups (
  league_id uuid, week text, home_id uuid, away_id uuid,
  home_pct numeric, away_pct numeric, winner_id uuid,
  recap text, recap_model text,                -- AI recap from computed facts
  primary key (league_id, week, home_id)
);
create table draft_waiver_claims (
  id uuid primary key, league_id uuid, user_id uuid, add_market text,
  drop_market text, priority int, status text, resolved_at timestamptz
);
create table draft_trades (
  id uuid primary key, league_id uuid, from_id uuid, to_id uuid,
  give text[] not null, get text[] not null,
  status text check (status in ('proposed','accepted','declined','expired')),
  created_at timestamptz, decided_at timestamptz
);
create table draft_pick_grades (              -- AI grades picks, from facts only
  league_id uuid, round int, pick int, grade text, facts jsonb, note text,
  primary key (league_id, round, pick)
);
```

A week's percentage comes from Hyperliquid's weekly open and close for each
rostered market, in pure code (a future `lib/arena/draft.ts`). The draft
order is a snake by `draft_slot`.

### Raid nights

Admin-created events (CPI, FOMC, unlocks), with a lobby, a live room and a
leaderboard.

```sql
create table raid_events (
  id uuid primary key, title text not null, kind text not null,  -- 'cpi','fomc','unlock',…
  markets text[] not null, starts_at timestamptz not null, ends_at timestamptz not null,
  created_by uuid not null,                     -- an admin; checked server-side
  status text check (status in ('scheduled','lobby','live','settled'))
);
create table raid_calls (                       -- reuses the call shape, locked at start
  event_id uuid references raid_events, call_id uuid references arena_calls,
  primary key (event_id, call_id)
);
create table raid_commentary (                  -- AI play-by-play at a capped cadence
  event_id uuid, at timestamptz, text text, model text, facts jsonb,
  primary key (event_id, at)
);
create table raid_results (
  event_id uuid, user_id uuid, brier numeric, calls int, rank int,
  primary key (event_id, user_id)
);
```

A raid call is an ordinary `arena_calls` row that must be posted before
`starts_at`. The cadence cap is enforced by the primary key plus a minimum
gap in code: at most one line per minute, and at most 60 per event.

### AI arena

A person builds an agent: a name, a persona, a strategy from the catalogue
and hard limits. It trades on paper only, through the existing rules engine.

```sql
create table arena_agents (
  id uuid primary key, owner_id uuid not null, name text not null,
  persona text not null check (length(persona) <= 280),
  rule_id uuid unique references trading_rules,  -- mode is always 'paper'
  strategy_phrase text not null,                 -- what the person typed
  strategy_id text not null,                     -- resolveStrategy(phrase).id
  created_at timestamptz not null
);
create table arena_agent_leagues (
  id uuid primary key, name text, invite_code text unique, season text,
  starts_at timestamptz, ends_at timestamptz
);
create table arena_agent_entries (
  league_id uuid, agent_id uuid, net_pct numeric, max_drawdown_pct numeric,
  trades int, rank int, primary key (league_id, agent_id)
);
create table arena_agent_follows (
  agent_id uuid, user_id uuid, created_at timestamptz, primary key (agent_id, user_id)
);
create table arena_agent_backings (             -- points only, same weekly budget
  agent_id uuid, league_id uuid, user_id uuid, points int, week text,
  settled_points int, primary key (agent_id, league_id, user_id)
);
```

An agent's limits are the rule's limits, held to `LIMITS` and `decide` in
`lib/autotrade/rules.ts`. A database check plus a server guard keeps an
agent's rule in `mode = 'paper'`, so no agent can ever go live. A plain
description of a strategy is mapped to a catalogue strategy with
`resolveStrategy` in `lib/backtest/strategies.ts`. A league ranks agents by
return over max drawdown, never by raw PnL, so size and leverage don't win.
Points backed on agents come out of the same weekly 100-point budget as
calls.

### Season Wrapped

```sql
create table arena_wrapped (
  user_id uuid, season text, archetype text not null,
  habits jsonb not null,          -- [{ key, text, facts }], computed
  stats jsonb not null,           -- PaperAnalysis + label counts + calibration
  text text, model text,          -- AI write-up from the habits only
  created_at timestamptz, primary key (user_id, season)
);
```

The habits are computed from `analysePaperTrades` (`lib/autotrade/analysis.ts`),
from `trade_reviews` and from calibration. For example, "sells winners twice
as fast as losers" is the average hold of winning trades divided by that of
losing trades, from the review facts' `holdMinutes`. The archetype is chosen
by code from fixed rules over those numbers. The model writes only the prose.
