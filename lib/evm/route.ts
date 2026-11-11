import "server-only";

import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { EVM_CHAIN_KEYS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { resolve } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   What every EVM route starts with: the session's EVM address, and a JSON
   body.

   The sender is ALWAYS the session's, never the request's — a route that
   built for any address it was handed would let a caller probe other
   people's balances through it, and build transactions nobody here can sign.
--------------------------------------------------------------------------- */

export type EvmRouteStart =
  | { ok: true; address: `0x${string}`; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export async function startEvmRoute(request: Request): Promise<EvmRouteStart> {
  const resolved = await resolve(request);
  if ("response" in resolved) return { ok: false, response: resolved.response };

  const wallet = resolved.session.sessionWallet;
  if (!isEvmAddress(wallet)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: resolved.session.addressesUnresolved
            ? "Could not reach Privy to resolve this account's EVM wallet."
            : "No EVM wallet is connected to your account.",
        },
        { status: 400 },
      ),
    };
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Expected a JSON body" }, { status: 400 }) };
  }

  return { ok: true, address: getAddress(wallet), body };
}

export function chainFrom(value: unknown): EvmChainKey | null {
  return typeof value === "string" && (EVM_CHAIN_KEYS as readonly string[]).includes(value)
    ? (value as EvmChainKey)
    : null;
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}
