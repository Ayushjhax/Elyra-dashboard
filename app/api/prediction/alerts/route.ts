import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import {
  createPredictionAlert,
  deletePredictionAlert,
  listPredictionAlerts,
  parsePredictionAlert,
  type AlertKind,
} from "@/lib/prediction/alerts";
import { resolveMarket } from "@/lib/prediction/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: AlertKind[] = [
  "price_above",
  "price_below",
  "probability_change",
  "orderbook_imbalance",
  "spread_expansion",
  "spread_compression",
  "liquidity_change",
  "signal_new",
  "signal_entry",
  "signal_target",
  "signal_invalidated",
  "signal_expired",
  "market_resolution",
];

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json({ alerts: await listPredictionAlerts(user.userId) });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const market = typeof body.market === "string" ? body.market : null;
  if (market === null) {
    return NextResponse.json({ error: "A `market` is required." }, { status: 400 });
  }

  /* Two ways in: a structured kind/threshold from the UI, or a phrase from
     the chat surfaces. The phrase is compiled and REJECTED when ambiguous
     rather than resolved to a best guess — an alert on a misread condition
     is worse than none, because the user believes they are covered. */
  let kind: AlertKind | null = null;
  let threshold: number | null = null;

  if (typeof body.condition === "string") {
    const parsed = parsePredictionAlert(body.condition);
    if (parsed === null) {
      return NextResponse.json(
        {
          error: `"${body.condition}" could not be read as an alert condition.`,
          hint: "State a direction and a level, e.g. 'above 65' or 'below 40'.",
        },
        { status: 400 },
      );
    }
    kind = parsed.kind;
    threshold = parsed.threshold;
  } else if (typeof body.kind === "string" && KINDS.includes(body.kind as AlertKind)) {
    kind = body.kind as AlertKind;
    threshold = typeof body.threshold === "number" ? body.threshold : null;
  }

  if (kind === null) {
    return NextResponse.json(
      { error: "Provide either a `condition` phrase or a valid `kind`." },
      { status: 400 },
    );
  }

  const resolved = await resolveMarket(market);
  if (resolved === null) {
    return NextResponse.json({ error: "No such market." }, { status: 404 });
  }

  const wanted = typeof body.outcome === "string" ? body.outcome.toLowerCase() : null;
  const token =
    resolved.tokens.find((entry) => wanted === null || entry.label.toLowerCase() === wanted) ??
    resolved.tokens[0];

  const id = await createPredictionAlert({
    userId: user.userId,
    marketId: resolved.market.id,
    tokenId: token?.tokenId ?? null,
    marketQuestion: resolved.market.question,
    outcomeLabel: token?.label ?? null,
    kind,
    threshold,
    signalId: typeof body.signalId === "string" ? body.signalId : null,
  });

  if (id === null) {
    return NextResponse.json({ error: "The alert could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    id,
    market: resolved.market.question,
    outcome: token?.label ?? null,
    kind,
    threshold,
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (id === null) {
    return NextResponse.json({ error: "An `id` is required." }, { status: 400 });
  }

  /* Scoped to the owner inside the query, so a guessed id deletes nothing. */
  const deleted = await deletePredictionAlert(user.userId, id);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "No such alert." }, { status: 404 });
}
