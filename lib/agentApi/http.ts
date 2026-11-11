import "server-only";

import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { authenticateAgentKey, bearerKey, type AgentAuth } from "@/lib/agentApi/keys";

/* ---------------------------------------------------------------------------
   The HTTP rules every agent route shares: which browser origins may call,
   and who the caller is. An agent key is the only credential these routes
   accept — never a session cookie or a Privy token — so a page that tricks a
   signed-in browser into calling them gets nowhere.
--------------------------------------------------------------------------- */

const FIXED_ORIGINS = ["https://getelyra.xyz", "https://www.getelyra.xyz", "https://api.getelyra.xyz"];

/**
 * Agents run on servers and send no Origin. A browser does, and only Elyra's
 * own origins (and localhost while developing) are let through — the MCP
 * transport requires refusing any other, against DNS rebinding.
 */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  let app: string | null = null;
  try {
    app = new URL(appUrl()).origin;
  } catch {
    app = null;
  }
  if (origin === app || FIXED_ORIGINS.includes(origin)) return true;
  return process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export const NO_STORE = { "cache-control": "no-store" } as const;

/** The verified caller, or the response that refuses them. */
export async function agentCaller(request: Request): Promise<{ auth: AgentAuth } | { response: Response }> {
  if (!originAllowed(request)) {
    return { response: NextResponse.json({ error: "This origin may not call Elyra's agent API." }, { status: 403, headers: NO_STORE }) };
  }
  const auth = await authenticateAgentKey(bearerKey(request)).catch(() => null);
  if (auth === null) {
    return {
      response: NextResponse.json(
        { error: "Send an Elyra agent key as `Authorization: Bearer elyra_ak_…`. Create one in Elyra → Connections." },
        { status: 401, headers: { ...NO_STORE, "www-authenticate": 'Bearer realm="elyra"' } },
      ),
    };
  }
  return { auth };
}
