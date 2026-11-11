import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { suiWalletFor } from "@/lib/auth/sui";
import { readSuiActivity } from "@/lib/sui/activity";
import { readEvmActivity } from "@/lib/evm/activity";
import { EVM_CHAIN_KEYS, EVM_CHAINS, isEvmAddress } from "@/lib/evm/chains";
import { RPC_ENV } from "@/lib/evm/rpc";
import { UpstreamError } from "@/lib/market/http";
import { isSolanaAddress } from "@/lib/solana/address";
import { describeSignatures } from "@/lib/wallet/helius";
import {
  RpcUnconfiguredError,
  getSignaturesForAddress,
  rpcConfigured,
} from "@/lib/solana/rpc";
import {
  activityStatus,
  type ActivityResponse,
  type WalletActivity,
} from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the signed-in account's wallets.

   Solana: `getSignaturesForAddress`, with what each one did where the RPC is
   Helius. Decoding each transaction into "sent 2 SOL to X" without Helius
   needs a `getTransaction` per signature plus an instruction parser per
   program, which is a different piece of work and a much larger RPC bill.
   What is here is what the signature list actually contains: whether it
   landed, when, and a link to the explorer for the rest.

   Ethereum and Robinhood Chain: the EVM wallet's transactions from an
   indexer (lib/evm/activity.ts), each row carrying its network and its own
   explorer link.

   The sources are read side by side and merged newest first. One that cannot
   be read while the others can is named in `notes`, not dropped silently —
   a merged list that is missing a chain must not pass for the whole — and
   `error` is set only when nothing at all could be read.

   Saying less and being right is the trade. A feed that guessed at transfer
   amounts from partial data would be wrong on exactly the transactions that
   matter — the unusual ones.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type SourceRead =
  | { items: WalletActivity[]; problem: null }
  | { items: []; problem: { message: string; unconfigured: boolean } };

function fail(
  error: string,
  { unconfigured = false, status = 200 } = {},
): NextResponse<ActivityResponse> {
  return NextResponse.json({ items: [], error, unconfigured }, { status });
}

async function readSolana(
  address: string | null,
  addressesUnresolved: boolean,
  limit: number,
): Promise<SourceRead | null> {
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

export async function GET(request: Request): Promise<NextResponse<ActivityResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", { status: 401 });

  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return fail(`limit must be an integer in 1..${MAX_LIMIT}`);
  }

  const evmAddress = isEvmAddress(user.walletAddress) ? user.walletAddress : null;
  const suiLookup = await suiWalletFor(user.privyDid);
  const suiAddress = suiLookup.ok && suiLookup.wallet !== null ? suiLookup.wallet.address : null;
  const suiRead =
    suiAddress === null
      ? Promise.resolve(null)
      : readSuiActivity(suiAddress, limit).catch((error: unknown) => ({
          items: [] as WalletActivity[],
          note: error instanceof Error ? error.message : "Sui history could not be read.",
        }));

  const [sui, solana, ...evm] = await Promise.all([
    suiRead,
    readSolana(user.solanaAddress, user.addressesUnresolved, limit),
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

  if (solana === null && evmAddress === null && suiAddress === null) {
    return fail("This account has no wallet yet.");
  }

  /* Newest first; a row not yet in a block has no time and leads. */
  const time = (row: WalletActivity) => (row.at === null ? Number.MAX_SAFE_INTEGER : Date.parse(row.at) || 0);
  const items = [...(solana?.items ?? []), ...evm.flatMap((read) => read.items), ...(sui?.items ?? [])]
    .sort((a, b) => time(b) - time(a))
    .slice(0, limit);

  /* Chains with no indexer are named together, once — four near-identical
     lines under a list would bury it. */
  const unindexed = evmAddress === null ? [] : EVM_CHAIN_KEYS.filter((_chain, index) => evm[index]?.needsIndexer === true);
  const notes = [
    ...(solana?.problem ? [solana.problem.message] : []),
    ...evm.flatMap((read) => (read.note === null || read.needsIndexer === true ? [] : [read.note])),
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
  if (items.length === 0 && solana?.problem && evm.every((read) => read.note !== null)) {
    return fail(solana.problem.message, { unconfigured: solana.problem.unconfigured });
  }

  return NextResponse.json({ items, error: null, unconfigured: false, ...(notes.length > 0 ? { notes } : {}) });
}
