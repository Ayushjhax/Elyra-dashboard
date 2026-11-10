import "server-only";

import { buildPassport, type CuratedFacts, type ListingFacts, type MintAccountFacts } from "@/lib/passport/derive";
import type { AssetPassport } from "@/lib/passport/types";
import { jupiterTokenListing } from "@/lib/providers/jupiter";
import { RpcUnconfiguredError, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, rpcCall } from "@/lib/solana/rpc";
import { assetByMint } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Assembling an Asset Passport for one Solana mint, server side.

   The mint account is read through the configured Solana RPC — the same
   endpoint the wallet read uses — with `jsonParsed`, so the node decodes the
   token program's own data, Token-2022 extensions included. Jupiter's
   listing is read through the existing provider. Neither failing hides the
   other: a missing listing becomes "Unknown" fields, never a made-up one.

   Nothing here touches an account's holdings: a passport describes a token,
   not a person, so nothing private is read or logged.
--------------------------------------------------------------------------- */

export class PassportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PassportError";
  }
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; passport: AssetPassport }>();

interface ParsedAccount {
  value: null | {
    owner: string;
    data: { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } } | [string, string];
  };
}

async function readMint(mint: string): Promise<MintAccountFacts> {
  let result: ParsedAccount;
  try {
    result = await rpcCall<ParsedAccount>("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
  } catch (error: unknown) {
    if (error instanceof RpcUnconfiguredError) throw new PassportError("Solana is not configured on this server, so the mint cannot be read.", 503);
    throw new PassportError("The Solana network could not be reached to read this mint.", 502);
  }

  const account = result.value;
  if (account === null) throw new PassportError("There is no account at this address on Solana mainnet.", 404);
  if (account.owner !== TOKEN_PROGRAM_ID && account.owner !== TOKEN_2022_PROGRAM_ID) {
    throw new PassportError("This address is not a token mint.", 422);
  }
  const parsed = Array.isArray(account.data) ? undefined : account.data.parsed;
  if (parsed?.type !== "mint" || parsed.info === undefined) throw new PassportError("This address is a token account, not a token mint.", 422);

  const info = parsed.info;
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const extensions = Array.isArray(info.extensions)
    ? (info.extensions as unknown[]).flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const record = entry as { extension?: unknown; state?: unknown };
        if (typeof record.extension !== "string") return [];
        const state = typeof record.state === "object" && record.state !== null ? (record.state as Record<string, unknown>) : {};
        return [{ extension: record.extension, state }];
      })
    : [];

  return {
    program: account.owner === TOKEN_2022_PROGRAM_ID ? "spl-token-2022" : "spl-token",
    decimals: typeof info.decimals === "number" ? info.decimals : 0,
    supply: typeof info.supply === "string" && /^\d+$/.test(info.supply) ? info.supply : "0",
    mintAuthority: text(info.mintAuthority),
    freezeAuthority: text(info.freezeAuthority),
    extensions,
  };
}

function curatedFor(mint: string): CuratedFacts | null {
  const asset = assetByMint(mint);
  if (asset === null) return null;
  return { symbol: asset.symbol, name: asset.name, assetClass: asset.class, issuer: asset.issuer ?? null };
}

export async function assetPassport(mint: string): Promise<AssetPassport> {
  const hit = cache.get(mint);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.passport;

  const [account, listingResult] = await Promise.all([readMint(mint), jupiterTokenListing(mint)]);
  const listing: ListingFacts | null = listingResult.ok && listingResult.data !== undefined ? listingResult.data : null;
  const listingUnavailable =
    listing !== null
      ? null
      : listingResult.error?.code === "NOT_FOUND"
        ? "Jupiter does not list this mint."
        : "Jupiter's token index could not be read just now.";

  const passport = buildPassport({
    mint,
    account,
    listing,
    listingUnavailable,
    curated: curatedFor(mint),
    readAt: new Date().toISOString(),
  });
  cache.set(mint, { at: Date.now(), passport });
  return passport;
}
