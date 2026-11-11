import "server-only";

import { isCoinType, normalizeCoinType } from "@/lib/sui/chain";
import { suiClient } from "@/lib/sui/client";
import { suiTokenBySymbol, suiTokenByType } from "@/lib/sui/tokens";

/* ---------------------------------------------------------------------------
   A coin named by a request, resolved to what it really is.

   A symbol resolves only through the trusted list — "USDC" is the listed
   USDC and never some other package's coin that calls itself that. A full
   Move type resolves to itself: on the list it is verified; off it, its
   decimals and claimed symbol come from on-chain metadata and it is marked
   unverified, which every surface says.
--------------------------------------------------------------------------- */

export interface SuiCoin {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  verified: boolean;
}

export async function resolveSuiCoin(param: string): Promise<SuiCoin | null> {
  const text = param.trim();
  if (text.length === 0) return null;
  const bySymbol = suiTokenBySymbol(text);
  if (bySymbol !== null) return { ...bySymbol, verified: true };
  if (!isCoinType(text)) return null;
  const type = normalizeCoinType(text);
  const listed = suiTokenByType(type);
  if (listed !== null) return { ...listed, verified: true };
  const meta = (await suiClient().getCoinMetadata({ coinType: type } as never).catch(() => null)) as {
    coinMetadata?: { symbol?: string; name?: string; decimals?: number } | null;
  } | null;
  const info = meta?.coinMetadata;
  if (info === undefined || info === null || typeof info.decimals !== "number") return null;
  return {
    coinType: type,
    symbol: (info.symbol ?? "").slice(0, 16) || (type.split("::").pop() ?? "?"),
    name: (info.name ?? "").slice(0, 64) || type,
    decimals: info.decimals,
    verified: false,
  };
}

/** The session wallet's balance of one coin, in base units. */
export async function suiBalanceOf(owner: string, coinType: string): Promise<bigint> {
  const result = (await suiClient().getBalance({ owner, coinType: normalizeCoinType(coinType) } as never)) as {
    balance?: { balance?: string };
  };
  return BigInt(result.balance?.balance ?? "0");
}
