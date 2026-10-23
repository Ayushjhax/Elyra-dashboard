import { NextResponse } from "next/server";
import packageJson from "@/package.json";

/* ---------------------------------------------------------------------------
   GET /api/health — is this deployment up, and is each dependency configured?

   No auth: an uptime check and the app's About screen both read it. So it
   answers in booleans only. A value, or even the length of one, would tell a
   stranger something about a secret; "configured: true" tells them nothing
   they could not learn by using the product.

   Configured is not the same as reachable. This does no network calls, so it
   stays cheap enough to poll and cannot be used to make this server hammer
   an upstream.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(...keys: string[]): boolean {
  return keys.every((key) => (process.env[key]?.trim() ?? "").length > 0);
}

export function GET(): Response {
  return NextResponse.json(
    {
      ok: true,
      version: packageJson.version,
      /* Vercel sets this on every deployment; null when running locally. */
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      configured: {
        auth: configured("NEXT_PUBLIC_PRIVY_APP_ID", "PRIVY_APP_SECRET"),
        database: configured("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
        prices: configured("PYTH_API_KEY"),
        solanaRpc: configured("SOLANA_RPC_URL"),
        agent: configured("ANTHROPIC_API_KEY"),
        agentFallback: configured("GEMINI_API_KEY"),
        exchangeCredentials: configured("CREDENTIALS_ENC_KEY"),
        scheduledDelivery: configured("CRON_SECRET"),
        push: configured("EXPO_ACCESS_TOKEN"),
        cache: configured("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"),
        signalsEngine: configured("ELYRA_ENGINE_URL"),
        smartMoneyTracker: configured("SMART_MONEY_TRACKER_URL"),
        secFilings: configured("SEC_USER_AGENT"),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
