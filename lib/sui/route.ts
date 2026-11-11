import "server-only";

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { suiWalletFor } from "@/lib/auth/sui";
import { isSuiAddress } from "@/lib/sui/chain";

/* ---------------------------------------------------------------------------
   What every Sui route starts with: the session's Sui wallet, from Privy,
   and a JSON body. The sender is always the session's — never the
   request's — for the same reasons the EVM and Solana routes give.
--------------------------------------------------------------------------- */

export type SuiRouteStart =
  | { ok: true; address: string; publicKey: string | null; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export async function startSuiRoute(request: Request): Promise<SuiRouteStart> {
  const user = await getSessionUser(request);
  if (user === null) return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const lookup = await suiWalletFor(user.privyDid);
  if (!lookup.ok) {
    return { ok: false, response: NextResponse.json({ error: "Could not reach Privy to resolve this account's Sui wallet." }, { status: 503 }) };
  }
  if (lookup.wallet === null || !isSuiAddress(lookup.wallet.address)) {
    return { ok: false, response: NextResponse.json({ error: "This account has no Sui wallet yet." }, { status: 400 }) };
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Expected a JSON body" }, { status: 400 }) };
  }

  return { ok: true, address: lookup.wallet.address, publicKey: lookup.wallet.publicKey, body };
}
