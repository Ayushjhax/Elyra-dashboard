import { NextResponse } from "next/server";
import { buildContext } from "@/lib/personalized/context";
import { deriveInsights, suggestedPrompts, welcomeLines } from "@/lib/personalized/insights";
import { resolve } from "@/lib/personalized/session";
import type { PersonalizedContext, PersonalizedInsight } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Everything the page knows before the operator types anything.

   One request powers the whole right rail, the greeting and the opening
   prompts — rather than five, which is what a rail of independent widgets
   would cost. The greeting is derived here rather than in the browser so the
   figures in it come from the same read as the rail beside it and cannot
   disagree with it.

   Read-only, and it works without a `profiles` row: the wallet address comes
   from the verified Privy token, so an unreachable profile store costs saved
   preferences and nothing else.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ContextResponse {
  context: PersonalizedContext | null;
  insights: PersonalizedInsight[];
  suggestedPrompts: string[];
  welcome: string[];
  error: string | null;
}

export async function GET(request: Request): Promise<NextResponse<ContextResponse>> {
  const resolved = await resolve(request);
  if ("response" in resolved) {
    return resolved.response as NextResponse<ContextResponse>;
  }
  const { session } = resolved;

  if (session.solanaAddress === null && session.sessionWallet === null) {
    return NextResponse.json({
      context: null,
      insights: [],
      suggestedPrompts: [],
      welcome: [],
      error: session.addressesUnresolved
        ? "Could not reach Privy to resolve this account's wallets."
        : "This account has no wallet yet.",
    });
  }

  try {
    const built = await buildContext({
      userId: session.userId,
      solanaAddress: session.solanaAddress,
      sessionWallet: session.sessionWallet,
      /* No intent: the rail shows every facet, so everything is loaded. */
      intent: {
        task: "PERSONALIZED_REASONING",
        facets: ["equity", "allocation", "positions", "orders", "risk", "memory", "change"],
        symbols: [],
        reason: "context endpoint loads every facet for the rail",
      },
    });

    const snapshot = built.snapshot;

    return NextResponse.json({
      context: built.context,
      insights: snapshot === null ? [] : deriveInsights(snapshot, built.context.memories),
      suggestedPrompts:
        snapshot === null ? [] : suggestedPrompts(snapshot, built.context.memories),
      welcome: snapshot === null ? [] : welcomeLines(snapshot),
      error: null,
    });
  } catch (error: unknown) {
    console.error("[personalized context]", error);
    return NextResponse.json({
      context: null,
      insights: [],
      suggestedPrompts: [],
      welcome: [],
      error:
        error instanceof Error ? error.message : "Your account state could not be read.",
    });
  }
}
