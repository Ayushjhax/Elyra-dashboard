/* ---------------------------------------------------------------------------
   Turning whatever the model returned into something safe to render.

   Pure, and deliberately forgiving. A model asked for JSON will occasionally
   wrap it in prose, fence it in Markdown, emit a trailing comma, or return a
   perfectly good paragraph with no JSON at all. None of those may reach a
   component, and none of them may throw: an exception here would lose an
   answer the operator has already waited ten seconds for.

   So every failure has the same floor — the raw text becomes the message and
   the structured extras are simply absent. A plainer answer is a far better
   outcome than an error, and the operator still gets the content.

   No `server-only`: this is exercised directly by unit tests.
--------------------------------------------------------------------------- */

import type {
  AnswerInsight,
  AnswerMetric,
  InsightTone,
  PersonalizedAnswer,
} from "@/lib/personalized/types";

const TONES: InsightTone[] = ["positive", "negative", "neutral", "risk"];

/** Caps, so a runaway model cannot push a thousand rows into the DOM. */
const MAX_INSIGHTS = 6;
const MAX_METRICS = 8;
const MAX_PROMPTS = 4;
const MAX_CONTEXT = 8;
const MAX_MESSAGE = 8_000;

function text(value: unknown, max = 400): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, max);
}

function strings(value: unknown, max: number, itemMax = 160): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((entry) => text(entry, itemMax))
    .filter((entry): entry is string => entry !== undefined)
    .slice(0, max);
  return out.length > 0 ? out : undefined;
}

/**
 * The JSON inside a model response.
 *
 * Tries the whole string first, then a fenced block, then the widest
 * brace-balanced span. The last of those is what rescues "Here is the
 * analysis: { … }", which is the most common shape of a near-miss.
 */
export function extractJson(raw: string): unknown {
  const attempts: string[] = [];
  const trimmed = raw.trim();
  attempts.push(trimmed);

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1] !== undefined) attempts.push(fenced[1].trim());

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1));

  for (const attempt of attempts) {
    if (!attempt.startsWith("{") && !attempt.startsWith("[")) continue;
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      /* Next shape. */
    }
  }
  return null;
}

function insights(value: unknown): AnswerInsight[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: AnswerInsight[] = [];

  for (const entry of value.slice(0, MAX_INSIGHTS)) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = text(record.title, 120);
    const detail = text(record.detail, 400);
    if (title === undefined || detail === undefined) continue;
    const tone = TONES.includes(record.type as InsightTone)
      ? (record.type as InsightTone)
      : "neutral";
    out.push({ type: tone, title, detail });
  }

  return out.length > 0 ? out : undefined;
}

function metrics(value: unknown): AnswerMetric[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: AnswerMetric[] = [];

  for (const entry of value.slice(0, MAX_METRICS)) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const label = text(record.label, 60);
    const metricValue = text(record.value, 60);
    if (label === undefined || metricValue === undefined) continue;

    const tone =
      record.tone === "positive" || record.tone === "negative" || record.tone === "neutral"
        ? record.tone
        : undefined;

    out.push({
      label,
      value: metricValue,
      delta: text(record.delta, 40),
      tone,
    });
  }

  return out.length > 0 ? out : undefined;
}

/**
 * A validated answer, always.
 *
 * `raw` is the model's complete output. When it parses as the expected shape
 * the extras come through; when it does not, the text itself becomes the
 * message. There is no third outcome and no throw.
 */
export function parseAnswer(raw: string): PersonalizedAnswer {
  const fallback: PersonalizedAnswer = {
    message: raw.trim().slice(0, MAX_MESSAGE) || "No answer was returned.",
  };

  const parsed = extractJson(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }

  const record = parsed as Record<string, unknown>;
  const message = text(record.message, MAX_MESSAGE);

  /* An object with no message is not an answer. Falling back to the raw
     string keeps whatever the model did say, including the JSON — visible,
     ugly and truthful, rather than silently empty. */
  if (message === undefined) return fallback;

  return {
    headline: text(record.headline, 140),
    message,
    insights: insights(record.insights),
    metrics: metrics(record.metrics),
    suggestedPrompts: strings(record.suggestedPrompts, MAX_PROMPTS, 120),
    contextUsed: strings(record.contextUsed, MAX_CONTEXT, 60),
    /* preparedAction is NOT read from the model. The orchestrator attaches a
       server-built one after validation — see lib/personalized/actions.ts.
       Trusting a model-supplied action object would let a prompt injection
       in a token name describe a transfer. */
  };
}

/** The JSON shape the prompt asks for, as a string the prompt can embed. */
export const ANSWER_SCHEMA = `{
  "headline": "string, optional, max 12 words, the conclusion alone",
  "message": "string, required, the answer in prose. 2-5 short sentences.",
  "insights": [{ "type": "positive|negative|neutral|risk", "title": "string", "detail": "string" }],
  "metrics": [{ "label": "string", "value": "string", "delta": "string, optional", "tone": "positive|negative|neutral" }],
  "suggestedPrompts": ["string, max 4, each a question this user could ask next"],
  "contextUsed": ["string, which parts of their state you used: equity, allocation, positions, orders, activity, risk, memory"]
}`;
