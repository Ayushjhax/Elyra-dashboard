import "server-only";

import { erc20Abi, getAddress, type Address } from "viem";
import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { evmClient } from "@/lib/evm/rpc";
import { robinhoodStockTokens } from "@/lib/evm/stockTokens";
import { EVM_TOKENS } from "@/lib/evm/tokens";

/* ---------------------------------------------------------------------------
   One asset in the session's EVM wallet, read from the chain.

   The authority for what a send may move, the way `readHolding` is on
   Solana: decimals and balance come from the contract, never from the
   request — a wrong decimals figure is how a send moves a thousand times
   what was meant.

   A token may be any ERC-20 the wallet holds, listed or not: being able to
   move your own money out is not something a list should block. What the
   list decides is the NAME on the confirm screen. A listed contract (or a
   Robinhood Stock Token from Robinhood's registry) shows its canonical
   symbol; any other shows its own `symbol()` marked unverified, because a
   contract can call itself anything.
--------------------------------------------------------------------------- */

export interface EvmAsset {
  /** "native" for ETH. */
  address: "native" | Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  /** On a list Elyra trusts. An unverified token is named as such. */
  verified: boolean;
  stockToken: boolean;
}

/** The listed name for a contract on a chain, if it is listed. */
async function listedToken(
  chain: EvmChainKey,
  address: string,
): Promise<{ symbol: string; name: string; stock: boolean } | null> {
  const listed = EVM_TOKENS[chain].find((token) => token.address.toLowerCase() === address.toLowerCase());
  if (listed !== undefined) return { symbol: listed.symbol, name: listed.name, stock: false };
  if (chain !== "robinhood") return null;
  const stocks = await robinhoodStockTokens().catch(() => []);
  const stock = stocks.find((token) => token.address.toLowerCase() === address.toLowerCase());
  return stock === undefined ? null : { symbol: stock.symbol, name: stock.name, stock: true };
}

/**
 * ETH or one ERC-20 in `owner`'s wallet. Null when `asset` is not a contract
 * address, or the contract does not answer as an ERC-20.
 */
export async function readEvmAsset(
  chain: EvmChainKey,
  owner: string,
  asset: string,
): Promise<EvmAsset | null> {
  const client = evmClient(chain);
  const account = getAddress(owner);

  if (asset === "native" || asset.toUpperCase() === EVM_CHAINS[chain].nativeSymbol) {
    const balance = await client.getBalance({ address: account });
    return {
      address: "native",
      symbol: EVM_CHAINS[chain].nativeSymbol,
      name: EVM_CHAINS[chain].nativeName,
      decimals: 18,
      balance,
      verified: true,
      stockToken: false,
    };
  }

  if (!isEvmAddress(asset)) return null;
  const token = getAddress(asset);

  const [reads, listed] = await Promise.all([
    client.multicall({
      allowFailure: true,
      contracts: [
        { address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] },
        { address: token, abi: erc20Abi, functionName: "decimals" },
        { address: token, abi: erc20Abi, functionName: "symbol" },
        { address: token, abi: erc20Abi, functionName: "name" },
      ],
    }),
    listedToken(chain, token),
  ]);

  const [balance, decimals, symbol, name] = reads;
  if (balance.status !== "success" || decimals.status !== "success") return null;
  const places = Number(decimals.result);
  if (!Number.isInteger(places) || places < 0 || places > 36) return null;

  const ownSymbol = symbol.status === "success" && typeof symbol.result === "string" ? symbol.result.trim().slice(0, 16) : "";
  const ownName = name.status === "success" && typeof name.result === "string" ? name.result.trim().slice(0, 64) : "";

  return {
    address: token,
    symbol: listed?.symbol ?? (ownSymbol.length > 0 ? ownSymbol : `${token.slice(0, 6)}…${token.slice(-4)}`),
    name: listed?.name ?? (ownName.length > 0 ? ownName : token),
    decimals: places,
    balance: balance.result as bigint,
    verified: listed !== null,
    stockToken: listed?.stock ?? false,
  };
}
