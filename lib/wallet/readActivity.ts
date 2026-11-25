import "server-only";

import { readEvmActivity } from "@/lib/evm/activity";
import { EVM_CHAIN_KEYS, EVM_CHAINS } from "@/lib/evm/chains";
import { RPC_ENV } from "@/lib/evm/rpc";
import { UpstreamError } from "@/lib/market/http";
import { isSolanaAddress } from "@/lib/solana/address";
import { RpcUnconfiguredError, getSignaturesForAddress, rpcConfigured } from "@/lib/solana/rpc";
import { readSuiActivity } from "@/lib/sui/activity";
import { describeSignatures } from "@/lib/wallet/helius";
import { activityStatus, type ActivityResponse, type WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions across an account's wallets, read on the server.

   Solana: `getSignaturesForAddress`, with what each one did where the RPC is
   Helius. Decoding each transaction into "sent 2 SOL to X" without Helius
   needs a `getTransaction` per signature plus an instruction parser per
   program, which is a different piece of work and a much larger RPC bill.
   What is here is what the signature list actually contains: whether it
   landed, when, and a link to the explorer for the rest.

   The EVM chains: the EVM wallet's transactions from an indexer
   (lib/evm/activity.ts), each row carrying its network and its own explorer
   link. Sui: its own reader (lib/sui/activity.ts).

   The sources are read side by side and merged newest first. One that cannot
   be read while the others can is named in `notes`, not dropped silently —
   a merged list that is missing a chain must not pass for the whole — and
   `error` is set only when nothing at all could be read.

   Shared by /api/wallet/activity (the history list) and the portfolio's flow
   tracking (lib/portfolio/flowsServer.ts), so both read the same rows. The
   caller supplies the addresses, from a verified session or the profile —
   never from a request.
--------------------------------------------------------------------------- */

type SourceRead =
  | { items: WalletActivity[]; problem: null }
  | { items: []; problem: { message: string; unconfigured: boolean } };

export interface ActivitySources {
  solanaAddress: string | null;
  /** True when Privy could not be reached to resolve the Solana address. */
  addressesUnresolved: boolean;
  evmAddress: string | null;
  suiAddress: string | null;
  /** Per source; the merged list is cut to this too unless `keepAll`. */
  limit: number;
  /** Keep every source's rows rather than the newest `limit` overall — for flow tracking, which needs each chain's whole page. */
  keepAll?: boolean;
}

/** What each source read, before merging — for a caller that needs per-chain completeness. */
export interface ActivityRead extends ActivityResponse {
  /** Each source that was asked, and how many rows it returned. Absent sources are not listed. */
  sources: Array<{ network: "solana" | "sui" | (typeof EVM_CHAIN_KEYS)[number]; rows: number; failed: boolean; oldest: string | null }>;
}

async function readSolana(address: string | null, addressesUnresolved: boolean, limit: number): Promise<SourceRead | null> {
  if (address === null) {
    /* See the same branch in /api/wallet: an unreachable Privy and an account
       with no wallet are different failures and must not share a message. */
    return addressesUnresolved
      ? { items: [], problem: { message: "Could not reach Privy to resolve this account's wallet address.", unconfigured: false } }
      : null;
  }
  if (!isSolanaAddress(address)) {
    return { items: [], problem: { message: "The wallet address on this account is not a valid Solana address.", unconfigured: false } };
  }
  if (!rpcConfigured()) {
    return { items: [], problem: { message: new RpcUnconfiguredError().message, unconfigured: true } };
  }

  let signatures;
  try {
    signatures = await getSignaturesForAddress(address, limit);
  } catch (error: unknown) {
    if (error instanceof RpcUnconfiguredError) {
      return { items: [], problem: { message: error.message, unconfigured: true } };
    }
    return {
      items: [],
      problem: {
        message: error instanceof UpstreamError ? error.message : "Could not read transaction history.",
        unconfigured: false,
      },
    };
  }

  /* What each one did, where the RPC is Helius. Best effort: a row without
     a summary still says whether it landed, when, and links to the explorer. */
  const summaries = await describeSignatures(
    address,
    signatures.map((entry) => entry.signature),
  );

  return {
    items: signatures.map((entry) => ({
      signature: entry.signature,
      status: activityStatus(entry.err, entry.confirmationStatus),
      slot: entry.slot,
      /* blockTime is unix SECONDS. Passing it to Date as milliseconds would
         date every transaction to January 1970. */
      at: entry.blockTime === null ? null : new Date(entry.blockTime * 1000).toISOString(),
      memo: entry.memo,
      summary: summaries.get(entry.signature) ?? null,
    })),
    problem: null,
  };
}

/**
 * Every wallet's recent transactions, merged newest first. `error` is set
 * only when nothing at all could be read; a source that failed while others
 * answered is named in `notes`.
 */
export async function readAccountActivity(sources: ActivitySources): Promise<ActivityRead> {
  const { evmAddress, suiAddress, limit } = sources;
  const suiRead =
    suiAddress === null
      ? Promise.resolve(null)
      : readSuiActivity(suiAddress, limit).catch((error: unknown) => ({
          items: [] as WalletActivity[],
          note: error instanceof Error ? error.message : "Sui history could not be read.",
        }));

  const [sui, solana, ...evm] = await Promise.all([
    suiRead,
    readSolana(sources.solanaAddress, sources.addressesUnresolved, limit),
    ...(evmAddress === null
      ? []
      : EVM_CHAIN_KEYS.map((chain) =>
          readEvmActivity(chain, evmAddress, limit).catch((error: unknown) => ({
            items: [] as WalletActivity[],
            note: error instanceof Error ? error.message : "History could not be read.",
            needsIndexer: false,
          })),
        )),
  ]);

  const oldestOf = (rows: readonly WalletActivity[]): string | null => {
    let oldest: string | null = null;
    for (const row of rows) if (row.at !== null && (oldest === null || row.at < oldest)) oldest = row.at;
    return oldest;
  };
  const read: ActivityRead["sources"] = [
    ...(solana === null ? [] : [{ network: "solana" as const, rows: solana.items.length, failed: solana.problem !== null, oldest: oldestOf(solana.items) }]),
    ...(evmAddress === null
      ? []
      : EVM_CHAIN_KEYS.map((chain, index) => ({
          network: chain,
          rows: evm[index]?.items.length ?? 0,
          failed: evm[index]?.note != null || evm[index]?.needsIndexer === true,
          oldest: oldestOf(evm[index]?.items ?? []),
        }))),
    ...(sui === null ? [] : [{ network: "sui" as const, rows: sui.items.length, failed: sui.note !== null, oldest: oldestOf(sui.items) }]),
  ];

  if (solana === null && evmAddress === null && suiAddress === null) {
    return { items: [], error: "This account has no wallet yet.", unconfigured: false, sources: read };
  }

  /* Newest first; a row not yet in a block has no time and leads. */
  const time = (row: WalletActivity) => (row.at === null ? Number.MAX_SAFE_INTEGER : Date.parse(row.at) || 0);
  const merged = [...(solana?.items ?? []), ...evm.flatMap((source) => source.items), ...(sui?.items ?? [])].sort(
    (a, b) => time(b) - time(a),
  );
  const items = sources.keepAll === true ? merged : merged.slice(0, limit);

  /* Chains with no indexer are named together, once — four near-identical
     lines under a list would bury it. */
  const unindexed = evmAddress === null ? [] : EVM_CHAIN_KEYS.filter((_chain, index) => evm[index]?.needsIndexer === true);
  const notes = [
    ...(solana?.problem ? [solana.problem.message] : []),
    ...evm.flatMap((source) => (source.note === null || source.needsIndexer === true ? [] : [source.note])),
    ...(sui?.note ? [sui.note] : []),
    ...(unindexed.length === 0
      ? []
      : [
          `${unindexed.map((chain) => EVM_CHAINS[chain].name).join(", ")} history needs an indexer: set ${unindexed
            .map((chain) => RPC_ENV[chain])
            .join(", ")} to Alchemy endpoints. Balances are unaffected.`,
        ]),
  ];

  /* Nothing readable at all is an error, as it always was; a Solana-only
     account with no EVM wallet keeps exactly its old answers. */
  if (items.length === 0 && solana?.problem && evm.every((source) => source.note !== null)) {
    return { items: [], error: solana.problem.message, unconfigured: solana.problem.unconfigured, sources: read };
  }

  return { items, error: null, unconfigured: false, ...(notes.length > 0 ? { notes } : {}), sources: read };
}
