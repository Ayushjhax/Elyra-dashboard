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
- **Privacy by default.** What a call says is private unless the owner
  shares it, with their groups or publicly under a handle. Every settled
  call counts toward the calls ladder, so groupmates (and everyone, for a
  public profile) see how many calls a person has settled and their Brier
  score — the profile says so. A person is shown only by handle, never by
  wallet.
- **No emoji, sentence case, brand tokens only.**

## Built (web) — the launch layout

Trading, played as a game and a sport. People have always played games,
played sport and traded; Arena puts the three in one place, on points and
paper. Route `/arena` sits beside the chart (`components/arena/ArenaView.tsx`),
one file per tab:

| Tab | What it is | File |
|---|---|---|
| Today | The matchday page: the day's puzzle, each league's draft or score, open calls, open paper trades | `TodayTab.tsx` |
| Puzzle | Play: one real chart a day, the same for everyone | `PuzzleTab.tsx` |
| League | Sport: draft markets with friends, head-to-head every round | `LeagueTab.tsx` |
| Calls | Calls with receipts, tail and fade | `CallsTab.tsx` |
| Trades | Take a paper trade with a plan; every closed trade reviewed | `TradesTab.tsx` |
| Ladder | The puzzle's rating and calls' calibration, by handle; handle and groups | `LadderTab.tsx` |

`?tab=` opens a tab, `?trade=<position id>` jumps to that trade's review and
`?league=<id>` opens a league. The pre-launch names still work: `?tab=reviews`
opens Trades and `?tab=groups` opens Ladder. A closed trade in `/automation`
links to its review.

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
strangers' feeds and can no longer be backed by them. A manager in a league
that has not finished cannot clear their handle: the league shows them by it.

### Leagues — fantasy sport, played with markets

The rules are pure, in `lib/arena/league.ts`; the writes and the read are in
`lib/arena/leagues.ts`; the tick's part is `lib/arena/leagueEngine.ts`.

- **Forming.** A league has a name, 3–6 markets a roster, 3–12 rounds, a
  round of a day or a week, and a pick clock of 2 minutes (a live draft
  night), 1 hour or 8 hours. Friends join with an 8-character code. Joining
  needs a handle. A league holds as many managers as the board can fill —
  `capacity` = min(10, ⌊33 ÷ roster size⌋) — and a person can be in 5
  unfinished leagues. Before the draft a manager may leave; the owner's
  leaving closes the league. Joining is one database function under the
  league's row lock (`arena_league_join`), so nobody joins mid-deal or past
  capacity.
- **The draft.** The owner starts it with two managers or more. Slots are
  dealt at random (`randomInt`) by `arena_league_start`, which refuses if
  anyone joined or left since the order was drawn; the order snakes, and
  the league closes to new managers. A pick and its roster slot are written
  together (`arena_league_pick`). If a manager's account is deleted
  mid-draft, their picks go with it and the snake carries on over who is
  left (`managerOnClock`), nobody drafting more than a roster. The pool is `PERP_MARKETS` — crypto, memecoins and Nasdaq
  stock perps — and once a market is picked nobody else in the league can
  hold it (`arena_league_picks` unique on (league, market)). When a clock
  runs out, the first market still on the board is picked for that manager,
  stamped at the moment the clock ran out so the next clock starts there.
  Run-out picks happen lazily on any read or write, and on the tick, so a
  slow draft moves even when nobody has the page open. A slow draft (1 hour
  or more) tells the manager on the clock once per pick. Every notice is a
  compare-and-set on `notified_pick`, so overlapping ticks send it once,
  and the tick reads every live league, in batches, oldest first.
- **The season.** It starts at the first 00:00 UTC after the last pick.
  Round k runs `round days` from `season start + (k − 1) × round days`. The
  schedule is a round-robin by the circle method, cycled for longer
  seasons; an odd count gives one bye a round.
- **Scoring.** On Hyperliquid's daily bars, which open at 00:00 UTC where
  the last one closed. A market's move is the open of the day after the
  round ends over the open of the round's first day, minus one. While the
  round is under way, the current mid stands in for the end. A team scores
  the mean of its lineup's moves. A market with no price is left out of the
  mean; a team with no price at all makes the matchup void. Scores are
  compared at two decimals, so a win is never invisible. Daily opens are
  cached once in `arena_market_opens`.
- **Lineups and moves.** A lineup locks when its round starts. A manager
  has 2 free-agent moves a round (drop one, add a market nobody holds); a
  move counts from the next round, and the dropped market counts through
  this one before anyone can add it. Each roster slot carries the first and
  last round it counts for, so any round's lineup is read without a
  snapshot. No moves once the last round is under way.
- **The table.** A win is 1, a tie ½. Level teams split on points for (the
  sum of round scores, at the two decimals shown), then on fewer rounds
  played, then by handle; teams level on all three share a rank. When the
  last round settles, the top of the table is champion.
- **The commentator.** After each round, the model writes a short recap
  from `recapFacts` — who beat whom, at what score, the best and worst
  market started — through `writeFromFacts`, which discards a reply with a
  number or a link the facts do not hold and uses `fallbackRecap` instead.
- **Share text**, without emoji: `Elyra League · Round 3 · @ana +3.21% beat
  @ben −0.40%`.

Nothing is staked and nothing is won but the table. A league rewards picking
well; there is no buy-in, no prize and no way to buy a pick or a move.

### The ladders

`lib/arena/ladder.ts`. Two tables: the puzzle rating (highest first, after
5 puzzles) and the calls' mean Brier score (lowest first, after 10 settled
calls). Equal values as shown share a rank. The everyone ladder lists only
people whose profile is public; each group's ladder lists its members who
have a handle. Every row shows its sample. The viewer's own row is shown
below the top 25 when they rank lower.

The ladders read four columns on `arena_profiles` — `puzzle_rating`,
`puzzle_played`, `calls_settled`, `calls_brier` — recomputed from the source
rows by `refreshStats` whenever they can change: an answer, a settled call,
a handle saved. Migration 0036 backfills them.

### Trades — take a paper trade

The Trades tab's ticket sends paper only: it posts to the same hand-trade
route as Automation (`/api/automation/trade`) with `mode: "paper"` fixed, so
the same limits and `accountGate` apply and no order reaches an exchange.
Every trade carries its plan — a target and a stop — because the review
judges how it was played against that plan, measured in R, so size and
leverage do not change a label. Open trades show there, with a close at the
market (`DELETE /api/automation/positions/[id]`), and each closed trade's
review follows.

### Tables (migrations `0021_arena.sql` and `0036_arena_leagues.sql`)

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
| `arena_leagues` | settings, status, draft start, season start, champion | `invite_code` |
| `arena_league_managers` | membership, draft slot | (`league_id`, `user_id`) (pk), (`league_id`, `draft_slot`) |
| `arena_league_picks` | the draft, append-only; auto or by hand | (`league_id`, `pick`) (pk), (`league_id`, `market`) |
| `arena_league_slots` | who holds what, first and last round it counts | (`league_id`, `market`) while held |
| `arena_league_matchups` | fixture, scores, result, the per-market facts | (`league_id`, `round`, `home_id`) (pk) |
| `arena_league_recaps` | the round's recap and the facts it was written from | (`league_id`, `round`) (pk) |
| `arena_market_opens` | Hyperliquid's daily open, cached | (`market`, `day`) (pk) |

`arena_profiles` gains the ladders' four columns in 0036.

### Routes

| Route | Does |
|---|---|
| `GET /api/arena` | Everything the page shows, for the session's user |
| `POST /api/arena/calls` | Posts a call (append-only) |
| `POST /api/arena/calls/[id]/back` | Tails or fades a call with points |
| `POST /api/arena/puzzle` | Answers today's puzzle, once |
| `POST /api/arena/groups` | Creates a group, or joins one with `{ action: "join", code }` |
| `POST /api/arena/profile` | Sets the handle and whether the profile is public |
| `POST /api/arena/leagues` | Creates a league, or joins one with `{ action: "join", code }` |
| `GET /api/arena/leagues/[id]` | One league, for its managers: draft, rosters, live scores, schedule, table, recaps |
| `POST /api/arena/leagues/[id]` | `{ action: "start" }`, `"pick"` with `market`, `"move"` with `drop` and `add`, `"leave"` |

`GET /api/arena` now also carries `leagues` (each league's status, round,
record, rank and this round's score) and `ladders`.

### The tick and model cost

`runArena` (`lib/arena/engine.ts`) runs on the five-minute delivery tick,
after the trading pass and before delivery. Each run:

- reviews at most **4** trades;
- settles at most **40** calls;
- writes at most **4** call cards;
- runs the leagues (`runLeagues`): makes run-out picks, tells a slow
  draft's manager they are up and every manager when the draft is done, and
  settles at most **4** rounds (one per league), each with one recap.

Each review, card or recap is one model call, capped at 220 output tokens
with a 15-second timeout, through the agent's provider router. The worst
case is 12 model calls per tick, or 144 per hour. A round settles once it
has ended and the next daily bar has opened (10 minutes after); it waits up
to a day while Hyperliquid cannot be reached. A backlog clears over several ticks
rather than in one long run. In steady state, model calls track the number
of closed trades and settled calls, so a quiet day costs close to nothing.

## Next — data model only (not built)

Draft night is built, as Leagues (above), without trades between managers;
a trade proposal (`give`, `get`, accept or decline before the next round
locks) is the natural next step and needs one more table. Everything below
follows the same rules: points only, RLS on with no policies, service-role
writes, and the AI writing only from computed facts. None of these tables
exists yet. Each will get its own migration when the feature is built.

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
