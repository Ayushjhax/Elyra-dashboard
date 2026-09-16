import { NextResponse } from "next/server";
import { buildContext } from "@/lib/personalized/context";
import { deriveInsights } from "@/lib/personalized/insights";
import { resolve } from "@/lib/personalized/session";

/* Deterministic threshold detection — no model call. See the note in
   lib/personalized/insights.ts for why an LLM is the wrong tool for a
   comparison. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  try {
    const built = await buildContext({
      userId: session.userId,
      solanaAddress: session.solanaAddress,
      sessionWallet: session.sessionWallet,
      intent: {
        task: "PERSONALIZED_REASONING",
        facets: ["equity", "allocation", "positions", "risk", "memory", "change"],
        symbols: [],
        reason: "insight sweep reads every facet",
      },
    });

    return NextResponse.json({
      insights:
        built.snapshot === null
          ? []
          : deriveInsights(built.snapshot, built.context.memories),
      error: null,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      insights: [],
      error: error instanceof Error ? error.message : "Insights could not be computed.",
    });
  }
}
