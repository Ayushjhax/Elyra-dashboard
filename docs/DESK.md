# The Desk

A committee of AI models from different labs that forecasts one market
question together, by a fixed procedure, and is scored on it. Route `/desk`,
beside the chart.

The thesis it tests: AI agents can coordinate with one another as well as, or
better than, a human organization. The Desk does not assert that; it measures
it. Every forecast is scored when the market settles it, and the scoreboard
shows whether the committee beats its best member, and whether the review
round helped.

## Rules

- **Words only.** The Desk's output is a probability, a memo and a record.
  Nothing in `lib/desk/` can place an order, build a transaction or move
  anything.
- **One fact sheet, held to.** Code builds the facts from Hyperliquid
  (`lib/desk/facts.ts`). A member may repeat those numbers and no others. A
  member that cites one that is not there keeps its vote and loses its
  reasoning, in public ("flagged"). The chair's assignments and memo are held
  the same way; a memo that strays is replaced by the code's own.
- **Data is data.** The convener's note and other members' words reach a model
  fenced as data. The review round shows peers as "Member A" or "Member B",
  never by seat, model or lab.
- **The code decides; the models argue.** The vote is pooled by code. The
  chair runs the process and does not vote.
- **Cost is capped.** A session claims one of the person's daily model runs
  (`claimAgentRun`), and a person can convene 5 sessions a day
  (`DESK_RUNS_PER_DAY`).

## The seats (`lib/desk/roster.ts`)

| Seat | Lab | Default model | Tier | Key |
|---|---|---|---|---|
| Chair (does not vote) | Anthropic | `claude-opus-5-5` | paid | `ANTHROPIC_API_KEY` |
| Strategist | Anthropic | `claude-fable-5-2` | paid | `ANTHROPIC_API_KEY` |
| Market structure | Anthropic | `claude-sonnet-5-5` | paid | `ANTHROPIC_API_KEY` |
| Risk officer | Anthropic | `claude-haiku-5-5` | paid | `ANTHROPIC_API_KEY` |
| Positioning | Cohere | `command-a-plus-05-2026` | paid (free trial key) | `COHERE_API_KEY` |
| Cross-market | Google | `gemini-3.5-flash` | free tier | `GEMINI_API_KEY` |
| Quant | Groq | `openai/gpt-oss-120b` | free tier | `GROQ_API_KEY` |
| Contrarian | OpenRouter | `openrouter/free` (routes to a free model) | free | `OPENROUTER_API_KEY` |
| Second opinion | Mistral | `mistral-small-latest` | free tier | `MISTRAL_API_KEY` |
| Generalist | OpenAI | none — set `DESK_GENERALIST_MODEL` | paid | `OPENAI_API_KEY` |

A seat is filled when its key is set and it has a model. Every model can be
swapped with its `DESK_*_MODEL` variable. A session needs at least two voting
seats. With only Anthropic and Gemini keys, five seats are filled.

Adapters (`lib/agent/providers/`): Anthropic and Gemini are the agent's own,
given a model per seat. Cohere (`cohere.ts`, v2 Chat API) and any
OpenAI-compatible host (`openaiCompatible.ts`: Groq, OpenRouter, Mistral,
OpenAI) are text-only. They refuse tools and attachments rather than drop
them, and share one error taxonomy.

Verified on 2026-11-17:
- **Anthropic:** all four model ids answered a live independent round.
- **Cohere:** the request and response shapes are from its API reference.
- **OpenRouter:** its free models were listed from the live catalogue.
- **Groq and Mistral:** model ids are from their published lists. They are
  not verified with a key.
- **Gemini:** could not be reached from the sandbox the check ran in.

## The procedure (`lib/desk/protocol.ts`, `lib/desk/engine.ts`)

The question is always one the market settles: "{market} closes above {its
mid now} at {now + 4 hours, 24 hours or 7 days}".

1. **Facts.** One sheet for everyone:
   - the price and its change over 24 hours, 7 days and 31 days;
   - the 7-day range and where the price sits in it;
   - the 20-day average;
   - daily volatility, and a typical move over the horizon;
   - base rates of up days and up hours;
   - funding, open interest and volume (Hyperliquid's own perps);
   - Bitcoin and Ether over the same windows.
2. **Assignments.** The chair gives each voting seat a question through its
   lens, so the work is divided. A missing or straying assignment falls back
   to the seat's own lens.
3. **Independent views**, in parallel. Each member answers in JSON:
   - `p_up`, a whole percent from 1 to 99;
   - `thesis`, at most 60 words;
   - `would_change_my_mind`.

   A reply cut off by its token limit is salvaged field by field.
4. **Review.** One round on anonymised views; letters are dealt at random. A
   member may keep or change its probability and says why. No readable
   review means its independent view stands.
5. **Vote.** Code pools the reviewed views in log-odds, weighted by track
   record:

   `w = clamp(1 + 8 × (0.25 − mean Brier) × n ÷ (n + 20), 0.25, 3)`

   A new seat weighs 1. The pool is not extremized, because the members share
   one fact sheet. The pooled independent views are kept too, so the effect
   of the review is measured.
6. **Memo.** The chair writes four to six sentences. It leads with the
   probability, gives the case for and against, gives the dissent (the vote
   furthest from the desk, at least 5 points away) in its strongest form, and
   says what would change the view.
7. **Settlement.** The tick settles a run on Hyperliquid's one-minute close
   for its minute. Strictly higher is up. With no bar after 3 days, the run is
   void. Every forecast gets a Brier score, and `desk_seat_stats` adds to each
   seat's record, per model, and to the desk's own (`seat = 'desk'`). The
   person is notified.

A run is written after every stage. The page polls every 2.5 seconds while a
run is in session. A run that has not moved for 6 minutes was cut off by the
platform's time limit and is marked failed. `POST /api/desk` sets
`maxDuration = 300`; each model call is capped at 30 seconds.

## Tables (migration `0037_desk.sql`)

| Table | Holds | Key |
|---|---|---|
| `desk_runs` | the question, stage, facts, assignments, weights, pooled views, memo, dissent, settlement | `id` |
| `desk_turns` | one member's answer in one round: model, p, thesis, flag, error, latency, tokens, Brier | (`run_id`, `seat`, `round`) |
| `desk_seat_stats` | settled count and Brier sums per seat and model | (`seat`, `model`) |

All three tables have RLS on with no policies; writes go through the service
role. A person reads only their own runs. The scoreboard is everyone's,
because it scores models, not people.

## Routes

| Route | Does |
|---|---|
| `GET /api/desk` | Seats, the person's last 10 runs with every turn, the scoreboard, sessions left today |
| `POST /api/desk` | `{ market, horizon, note? }` convenes. Answers at once with the run's id; the work runs after the response |

The tick (`/api/notifications/deliver`) runs `runDeskTick` after the events
pass. It settles up to 30 runs.

## Not built

- Agents that act on the Desk's view. The Desk never trades.
- Questions other than a market closing above its price, such as levels,
  ranges or events.
- Showing the scoreboard per person. The board pools every run, because it
  scores the models.
