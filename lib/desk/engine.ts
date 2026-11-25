import "server-only";

import { randomInt } from "node:crypto";
import { effortFor } from "@/lib/agent/effort";
import { claimAgentRun, UsageLimitError } from "@/lib/agent/quota";
import { staysOnFacts } from "@/lib/arena/writer";
import { hyperliquidCandles, midPrice } from "@/lib/autotrade/hyperliquid";
import { num } from "@/lib/autotrade/store";
import { factSheet } from "@/lib/desk/facts";
import {
  CUT_OFF,
  DECLINED,
  DESK_RUNS_PER_DAY,
  HORIZONS,
  NO_ANSWER,
  OUT_OF_TIME,
  STOPPED,
  TOO_FEW,
  UNREADABLE,
  WITHHELD,
  brier,
  briefPrompt,
  chairSystem,
  defaultAssignment,
  dissent,
  factText,
  fallbackMemo,
  horizonOf,
  independentPrompt,
  memberSystem,
  memoFacts,
  memoPrompt,
  outcomeOf,
  parseBrief,
  parseIndependent,
  parseReview,
  pool,
  resolvesAt,
  reviewPrompt,
  scoreboard,
  seatWeight,
  spreadOf,
  statementFor,
  validateAsk,
  type DeskFact,
  type MemberAnswer,
  type QuestionContext,
  type Round,
  type Stage,
  type VoteLine,
} from "@/lib/desk/protocol";
import { MIN_VOTERS, SEATS, seatById, type SeatDef } from "@/lib/desk/roster";
import { providerFor, seatViews, seatedSeats } from "@/lib/desk/seats";
import type { DeskResponse, DeskRunView, DeskTurnView } from "@/lib/desk/types";
import { formatPriceUsd } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { serviceClient } from "@/lib/supabase/server";
import type { DeskRunRow, DeskTurnRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The Desk, server side: convening a run, running it stage by stage,
   settling it on the market, and the read the page makes. The procedure and
   the arithmetic are in lib/desk/protocol.ts; this file applies them.

   Safety, as everywhere in Elyra's AI:
     - The models read and write words. Nothing here can place an order,
       build a transaction or move anything; the output is a probability, a
       memo and a record.
     - Every number a member writes is held to the fact sheet. A member that
       cites one that is not there keeps its vote and loses its reasoning,
       visibly ("flagged"). The memo is held the same way, and replaced by
       the code's own if it strays.
     - Members' words reach other members only as anonymised data, and the
       convener's note reaches them as data too.
     - A run claims one of the person's daily model runs (`claimAgentRun`)
       and one of `DESK_RUNS_PER_DAY` desk runs.

   A run is written after every stage, so the page can show it working and a
   run cut short by the platform's time limit is found and marked failed
   rather than left spinning.
--------------------------------------------------------------------------- */

export class DeskError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DeskError";
  }
}

const MIGRATION = "The desk needs database migration 0037, which has not been applied.";
/** A run whose stage has not moved for this long was cut off. */
const STALE_MS = 6 * 60_000;
const CALL_TIMEOUT_MS = 30_000;
/**
 * Output caps for each step, with room for thinking and the answer: Claude's
 * adaptive thinking, Gemini's, gpt-oss's reasoning and Command A's all count
 * against the cap, and a cap of a few hundred can be spent before any text.
 * They are ceilings, not spend; Claude also runs at low effort here
 * (`effortFor("desk")`), so it thinks briefly.
 */
const BUDGET = { brief: 3_000, independent: 4_000, review: 3_500, memo: 3_000 } as const;
const SETTLE_CAP = 30;
const SETTLE_DELAY_MS = 2 * 60_000;
const VOID_AFTER_MS = 3 * 86_400_000;

const startOfUtcDay = (now: number) => new Date(Math.floor(now / 86_400_000) * 86_400_000).toISOString();

/* ---- convening ---- */

async function runsToday(userId: string, now: number): Promise<number> {
  const { count, error } = await serviceClient()
    .from("desk_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfUtcDay(now));
  if (error !== null) throw new DeskError(MIGRATION, 503);
  return count ?? 0;
}

/** Records the question and returns its id; the work happens in `runDesk`, after the response. */
export async function convene(userId: string, input: Record<string, unknown>, now: number): Promise<string> {
  const checked = validateAsk(input);
  if ("error" in checked) throw new DeskError(checked.error);
  const { ask } = checked;
  const voters = seatedSeats().filter((seat) => seat.votes);
  if (voters.length < MIN_VOTERS) throw new DeskError(`The desk needs at least ${MIN_VOTERS} seated members; this deployment seats ${voters.length}.`, 503);
  if ((await runsToday(userId, now)) >= DESK_RUNS_PER_DAY) {
    throw new DeskError(`The desk convenes ${DESK_RUNS_PER_DAY} times a day for each person. It resets at 00:00 UTC.`, 429);
  }
  /* The price first, so a market with none costs nobody a run. */
  const mid = await midPrice("mainnet", ask.market).catch(() => null);
  if (mid === null) throw new DeskError("Hyperliquid has no price for that market right now.", 503);
  /* Held at the precision the statement shows it, so the run settles against the price it names. */
  const price = Number(mid.toFixed(priceDecimals(mid)));
  try {
    await claimAgentRun(userId);
  } catch (error) {
    if (error instanceof UsageLimitError) throw new DeskError(error.message, 429);
    throw new DeskError("The desk could not be convened just now.", 503);
  }
  const at = resolvesAt(now, ask.horizon);
  const { data, error } = await serviceClient()
    .from("desk_runs")
    .insert({
      user_id: userId,
      market: ask.market,
      horizon: ask.horizon,
      start_price: price,
      resolves_at: new Date(at).toISOString(),
      statement: statementFor(ask.market, formatPriceUsd(price), at),
      note: ask.note,
      stage: "facts",
      facts: [],
      assignments: {},
      weights: {},
      status: "open",
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();
  if (error !== null || data === null) throw new DeskError(MIGRATION, 503);
  return data.id;
}

/* ---- running ---- */

interface Asked {
  text: string | null;
  /** It stopped at the output cap. A member's vote is still salvaged from it; a brief or a memo is not used. */
  truncated: boolean;
  model: string;
  provider: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  error: string | null;
}

async function ask(seat: SeatDef, system: string, prompt: string, maxTokens: number): Promise<Asked> {
  const started = Date.now();
  try {
    const provider = providerFor(seat);
    const result = await provider.complete({
      system: { stable: system, volatile: "" },
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxTokens,
      timeoutMs: CALL_TIMEOUT_MS,
      effort: effortFor("desk"),
    });
    return {
      text: result.refused ? null : result.text,
      truncated: result.truncated === true,
      model: result.model,
      provider: result.provider,
      latencyMs: Date.now() - started,
      tokensIn: result.usage.input,
      tokensOut: result.usage.output,
      error: result.refused ? DECLINED : null,
    };
  } catch (error) {
    /* Only the kind of failure is kept: a provider's message can carry anything. */
    const kind = typeof error === "object" && error !== null && "kind" in error ? String((error as { kind: unknown }).kind) : "failed";
    return { text: null, truncated: false, model: "", provider: seat.provider, latencyMs: Date.now() - started, tokensIn: 0, tokensOut: 0, error: NO_ANSWER[kind] ?? NO_ANSWER.failed };
  }
}

/**
 * Records a member's turn. `knownModel` is the model the seat answered with
 * earlier in the run: a turn whose call failed reports no model, and its
 * score must still go to the seat's real record, not to "unknown".
 */
async function saveTurn(runId: string, seat: SeatDef, round: Round, asked: Asked, answer: MemberAnswer | null, flagged: boolean, fallbackP: number | null, knownModel = ""): Promise<void> {
  await serviceClient()
    .from("desk_turns")
    .upsert(
      {
        run_id: runId,
        seat: seat.id,
        round,
        provider: asked.provider,
        model: asked.model.length > 0 ? asked.model : knownModel.length > 0 ? knownModel : "unknown",
        p: answer?.p ?? fallbackP,
        thesis: answer === null ? "" : flagged ? WITHHELD : answer.thesis,
        note: answer === null || flagged ? "" : answer.note,
        changed: answer?.changed ?? null,
        flagged,
        error: asked.error ?? (answer === null ? (asked.truncated ? CUT_OFF : fallbackP === null ? UNREADABLE : null) : null),
        latency_ms: asked.latencyMs,
        tokens_in: asked.tokensIn,
        tokens_out: asked.tokensOut,
        brier: null,
      },
      { onConflict: "run_id,seat,round", ignoreDuplicates: true },
    );
}

async function advance(runId: string, from: Stage, patch: Record<string, unknown>): Promise<boolean> {
  const { data } = await serviceClient()
    .from("desk_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("stage", from)
    .select("id");
  return (data ?? []).length > 0;
}

/** Fisher–Yates with the platform's randomness: which letter a member gets says nothing about its seat. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

const statKey = (seat: string, model: string) => `${seat}|${model}`;

/**
 * Runs one convened question through the whole procedure. Called once, after
 * the response that convened it; each stage moves only from the stage
 * before, so a second call finds nothing to do.
 */
export async function runDesk(runId: string): Promise<void> {
  const db = serviceClient();
  const { data: run } = await db.from("desk_runs").select("*").eq("id", runId).maybeSingle();
  if (run === null || run === undefined || run.stage !== "facts") return;
  try {
    const seated = seatedSeats();
    const chair = seated.find((seat) => !seat.votes) ?? null;
    const voters = seated.filter((seat) => seat.votes);
    const horizon = horizonOf(run.horizon);

    /* 1. The fact sheet. */
    const sheet: DeskFact[] = await factSheet(run.market, num(run.start_price), horizon.minutes, Date.parse(run.created_at));
    if (!(await advance(runId, "facts", { facts: sheet, stage: "brief" }))) return;
    const facts = sheet.map(factText);
    const context: QuestionContext = { statement: run.statement, horizonLabel: horizon.label, facts, note: run.note };
    const allowed = [...facts, run.statement, horizon.label, "50"];

    /* 2. The chair's assignments. */
    let assignments: Record<string, string> = Object.fromEntries(voters.map((seat) => [seat.id, defaultAssignment(seat)]));
    if (chair !== null) {
      const brief = await ask(chair, chairSystem(), briefPrompt(context, voters), BUDGET.brief);
      /* A brief cut off at the cap may have lost a member's assignment mid-sentence: every member keeps its own lens instead. */
      const parsed = parseBrief(brief.truncated ? null : brief.text, voters);
      /* An assignment is the chair's words reaching members: held to the sheet like everything else. */
      assignments = Object.fromEntries(Object.entries(parsed).map(([id, text]) => [id, staysOnFacts(text, allowed) ? text : defaultAssignment(seatById(id) as SeatDef)]));
    }
    if (!(await advance(runId, "brief", { assignments, stage: "independent" }))) return;

    /* 3. Independent views, in parallel, nobody seeing anyone. */
    const firsts = await Promise.all(
      voters.map(async (seat) => {
        const asked = await ask(seat, memberSystem(seat), independentPrompt(context, assignments[seat.id] ?? defaultAssignment(seat)), BUDGET.independent);
        const answer = parseIndependent(asked.text);
        const flagged = answer !== null && !staysOnFacts(`${answer.thesis} ${answer.note}`, allowed);
        await saveTurn(runId, seat, "independent", asked, answer, flagged, null);
        return { seat, asked, answer, flagged };
      }),
    );
    const answered = firsts.filter((entry): entry is typeof entry & { answer: MemberAnswer } => entry.answer !== null);
    if (answered.length < MIN_VOTERS) {
      await advance(runId, "independent", { stage: "failed", error: TOO_FEW });
      return;
    }
    if (!(await advance(runId, "independent", { stage: "review" }))) return;

    /* 4. One review round, on anonymised views. */
    const letters = new Map(shuffled(answered).map((entry, index) => [entry.seat.id, `Member ${String.fromCharCode(65 + index)}`]));
    const allowedInReview = [...allowed, ...answered.map((entry) => `${entry.answer.p}`)];
    const reviews = await Promise.all(
      answered.map(async (entry) => {
        const others = answered
          .filter((other) => other.seat.id !== entry.seat.id)
          .map((other) => ({ label: letters.get(other.seat.id) as string, p: other.answer.p, thesis: other.flagged ? WITHHELD : other.answer.thesis }));
        const asked = await ask(entry.seat, memberSystem(entry.seat), reviewPrompt(context, { p: entry.answer.p, thesis: entry.answer.thesis }, others), BUDGET.review);
        const review = parseReview(asked.text, entry.answer.p);
        const flagged = review !== null && !staysOnFacts(review.thesis, allowedInReview);
        /* No readable review: the independent view stands as the member's vote. */
        await saveTurn(runId, entry.seat, "review", asked, review, flagged, review === null ? entry.answer.p : null, entry.asked.model);
        return { seat: entry.seat, model: asked.model.length > 0 ? asked.model : entry.asked.model, first: entry.answer, final: review?.p ?? entry.answer.p, thesis: entry.flagged ? WITHHELD : entry.answer.thesis };
      }),
    );

    /* 5. The vote: pooled by code, weighted by track record. */
    const stats = await db.from("desk_seat_stats").select("*").in("seat", reviews.map((entry) => entry.seat.id));
    const records = new Map((stats.data ?? []).map((row) => [statKey(row.seat, row.model), row]));
    const weights: Record<string, number> = {};
    for (const entry of reviews) {
      const record = records.get(statKey(entry.seat.id, entry.model));
      weights[entry.seat.id] = seatWeight(record === undefined ? undefined : { settled: record.settled, brierMean: record.settled > 0 ? num(record.brier_sum) / record.settled : null });
    }
    const pIndependent = pool(reviews.map((entry) => ({ p: entry.first.p, weight: weights[entry.seat.id] })));
    const pFinal = pool(reviews.map((entry) => ({ p: entry.final, weight: weights[entry.seat.id] }))) as number;
    const votes: VoteLine[] = reviews.map((entry) => ({ title: entry.seat.title, p: entry.final, thesis: entry.thesis, weight: weights[entry.seat.id] }));
    const minority = dissent(votes, pFinal);
    if (
      !(await advance(runId, "review", {
        weights,
        p_independent: pIndependent,
        p_final: pFinal,
        spread: spreadOf(votes.map((vote) => vote.p)),
        dissent: minority === null ? null : { title: minority.title, p: minority.p },
        stage: "memo",
      }))
    ) {
      return;
    }

    /* 6. The memo, held to the votes and the sheet. */
    const lines = memoFacts(context, pFinal, votes, minority);
    let memo = fallbackMemo(run.statement, pFinal, votes, minority);
    let memoModel = "fallback";
    if (chair !== null) {
      const written = await ask(chair, chairSystem(), `${memoPrompt()}\n\nFacts and votes (data):\n${lines.map((line) => `- ${line}`).join("\n")}`, BUDGET.memo);
      const text = written.text?.trim() ?? "";
      /* A memo cut off at the cap ends mid-sentence; the code's own is used instead. */
      if (!written.truncated && text.length > 0 && text.length <= 1400 && staysOnFacts(text, lines)) {
        memo = text;
        memoModel = written.model;
      }
    }
    await advance(runId, "memo", { memo, memo_model: memoModel, stage: "done" });
  } catch {
    await db
      .from("desk_runs")
      .update({ stage: "failed", error: STOPPED, updated_at: new Date().toISOString() })
      .eq("id", runId)
      .in("stage", ["facts", "brief", "independent", "review", "vote", "memo"]);
  }
}

/* ---- settling ---- */

export interface DeskSettleReport {
  settled: number;
  voided: number;
  notes: string[];
}

type Notify = (userId: string, title: string, lines: string[]) => Promise<void>;

/** Settles runs whose time has come on Hyperliquid's one-minute close, scores every forecast, and adds to the track records. */
export async function settleDesk(now: number, notify: Notify): Promise<DeskSettleReport> {
  const report: DeskSettleReport = { settled: 0, voided: 0, notes: [] };
  const db = serviceClient();
  const due = await db
    .from("desk_runs")
    .select("*")
    .eq("status", "open")
    .eq("stage", "done")
    .lt("resolves_at", new Date(now - SETTLE_DELAY_MS).toISOString())
    .order("resolves_at", { ascending: true })
    .limit(SETTLE_CAP);
  for (const run of due.data ?? []) {
    try {
      const at = Date.parse(run.resolves_at);
      const bars = await hyperliquidCandles(run.market, "1m", at - 10 * 60_000, at + 60_000).catch(() => []);
      const bar = bars.filter((candidate) => candidate.closeTime < at).at(-1);
      if (bar === undefined || at - bar.closeTime > 5 * 60_000) {
        if (now - at < VOID_AFTER_MS) continue;
        await db.from("desk_runs").update({ status: "void", settled_at: new Date(now).toISOString() }).eq("id", run.id).eq("status", "open");
        report.voided += 1;
        continue;
      }
      const outcome = outcomeOf(num(run.start_price), bar.close);
      const up = outcome === "up";
      const claimed = await db
        .from("desk_runs")
        .update({ status: outcome, settled_price: bar.close, settled_at: new Date(now).toISOString() })
        .eq("id", run.id)
        .eq("status", "open")
        .select("id");
      if ((claimed.data ?? []).length === 0) continue;

      const turns = await db.from("desk_turns").select("*").eq("run_id", run.id);
      const bySeat = new Map<string, { independent?: DeskTurnRow; review?: DeskTurnRow }>();
      for (const turn of turns.data ?? []) {
        if (turn.p !== null) await db.from("desk_turns").update({ brier: brier(turn.p, up) }).eq("run_id", run.id).eq("seat", turn.seat).eq("round", turn.round);
        bySeat.set(turn.seat, { ...bySeat.get(turn.seat), [turn.round]: turn });
      }
      const additions: { seat: string; model: string; brier: number; independent: number }[] = [];
      for (const [seat, rounds] of bySeat) {
        if (rounds.review?.p === null || rounds.review?.p === undefined) continue;
        const finalBrier = brier(rounds.review.p, up);
        additions.push({ seat, model: rounds.review.model, brier: finalBrier, independent: typeof rounds.independent?.p === "number" ? brier(rounds.independent.p, up) : finalBrier });
      }
      if (run.p_final !== null) {
        const final = brier(num(run.p_final), up);
        additions.push({ seat: "desk", model: "pooled", brier: final, independent: run.p_independent === null ? final : brier(num(run.p_independent), up) });
      }
      for (const addition of additions) {
        const existing = await db.from("desk_seat_stats").select("*").eq("seat", addition.seat).eq("model", addition.model).maybeSingle();
        const row = existing.data ?? null;
        await db.from("desk_seat_stats").upsert(
          {
            seat: addition.seat,
            model: addition.model,
            settled: (row?.settled ?? 0) + 1,
            brier_sum: num(row?.brier_sum ?? 0) + addition.brier,
            independent_brier_sum: num(row?.independent_brier_sum ?? 0) + addition.independent,
            updated_at: new Date(now).toISOString(),
          },
          { onConflict: "seat,model" },
        );
      }
      report.settled += 1;
      if (run.p_final !== null) {
        await notify(run.user_id, `The desk's call settled: ${up ? "higher" : "not higher"}`, [
          run.statement,
          `The desk said ${num(run.p_final)}%. It closed at ${formatPriceUsd(bar.close)}.`,
        ]);
      }
    } catch (error) {
      report.notes.push(`desk ${run.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  return report;
}

/* ---- the read ---- */

function turnView(turn: DeskTurnRow, weights: Record<string, number>): DeskTurnView {
  const seat = seatById(turn.seat);
  return {
    seat: turn.seat,
    title: seat?.title ?? turn.seat,
    lab: seat?.lab ?? "",
    model: turn.model,
    round: turn.round,
    p: turn.p,
    thesis: turn.thesis,
    note: turn.note,
    changed: turn.changed,
    flagged: turn.flagged,
    error: turn.error,
    weight: turn.round === "review" ? (weights[turn.seat] ?? null) : null,
    brier: turn.brier === null ? null : num(turn.brier),
  };
}

/** A stored fact-sheet line; a plain string (written before lines were templates) is shown as it is. */
const factOf = (line: unknown): DeskFact =>
  typeof line === "string"
    ? { template: line, values: {} }
    : typeof line === "object" && line !== null && typeof (line as DeskFact).template === "string"
      ? { template: (line as DeskFact).template, values: ((line as DeskFact).values ?? {}) as DeskFact["values"] }
      : { template: "", values: {} };

function runView(run: DeskRunRow, turns: DeskTurnRow[]): DeskRunView {
  const weights = (run.weights ?? {}) as Record<string, number>;
  const order = (seat: string) => SEATS.findIndex((entry) => entry.id === seat);
  return {
    id: run.id,
    market: run.market,
    horizon: HORIZONS.some((entry) => entry.id === run.horizon) ? (run.horizon as DeskRunView["horizon"]) : "24h",
    statement: run.statement,
    note: run.note,
    stage: run.stage,
    createdAt: run.created_at,
    resolvesAt: run.resolves_at,
    startPrice: num(run.start_price),
    facts: Array.isArray(run.facts) ? run.facts.map(factOf) : [],
    assignments: (run.assignments ?? {}) as Record<string, string>,
    pIndependent: run.p_independent === null ? null : num(run.p_independent),
    pFinal: run.p_final === null ? null : num(run.p_final),
    spread: run.spread === null ? null : num(run.spread),
    memo: run.memo,
    memoBy: run.memo === null ? null : run.memo_model === "fallback" ? "code" : "chair",
    dissent: (run.dissent ?? null) as DeskRunView["dissent"],
    status: run.status,
    settledPrice: run.settled_price === null ? null : num(run.settled_price),
    settledAt: run.settled_at,
    error: run.error,
    turns: turns
      .filter((turn) => turn.run_id === run.id)
      .sort((a, b) => order(a.seat) - order(b.seat) || a.round.localeCompare(b.round))
      .map((turn) => turnView(turn, weights)),
  };
}

export async function deskState(userId: string, now: number): Promise<DeskResponse> {
  const db = serviceClient();
  const runsRead = await db.from("desk_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
  if (runsRead.error !== null) throw new DeskError(MIGRATION, 503);
  const runs = runsRead.data ?? [];

  /* A run that stopped moving was cut off by the platform's time limit: say so, rather than spin. */
  for (const run of runs) {
    if (run.stage !== "done" && run.stage !== "failed" && now - Date.parse(run.updated_at) > STALE_MS) {
      await db
        .from("desk_runs")
        .update({ stage: "failed", error: OUT_OF_TIME })
        .eq("id", run.id)
        .eq("stage", run.stage);
      run.stage = "failed";
      run.error = OUT_OF_TIME;
    }
  }
  const ids = runs.map((run) => run.id);
  const [turns, stats, today] = await Promise.all([
    ids.length === 0 ? Promise.resolve({ data: [] as DeskTurnRow[] }) : db.from("desk_turns").select("*").in("run_id", ids),
    db.from("desk_seat_stats").select("*"),
    runsToday(userId, now),
  ]);
  return {
    seats: seatViews(),
    runs: runs.map((run) => runView(run, turns.data ?? [])),
    scoreboard: scoreboard(
      (stats.data ?? []).map((row) => ({
        seat: row.seat,
        model: row.model,
        settled: row.settled,
        brierSum: num(row.brier_sum),
        independentBrierSum: num(row.independent_brier_sum),
      })),
      SEATS,
    ),
    runsLeft: Math.max(0, DESK_RUNS_PER_DAY - today),
    runsPerDay: DESK_RUNS_PER_DAY,
    error: null,
  };
}
