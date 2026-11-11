import "server-only";

import { cached } from "@/lib/market/cache";
import { normalizeCoinType, SUI_COIN_TYPE } from "@/lib/sui/chain";
import { suiClient, suiQuery } from "@/lib/sui/client";
import { suiActivityRows, type SuiTxNode } from "@/lib/sui/derive";
import { suiTokenByType } from "@/lib/sui/tokens";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent Sui transactions for the account's Sui wallet.

   One GraphQL query by affected address covers what it sent and what it
   received, with each transaction's balance changes per coin — Sui's own
   index, so no third-party indexer is needed. A coin on no trusted list is
   named by its type, never by the symbol its metadata claims (the same rule
   as the EVM feed). Cached for thirty seconds; the activity poll is a minute.
--------------------------------------------------------------------------- */

const QUERY = `query Activity($address: SuiAddress!, $last: Int!) {
  transactions(last: $last, filter: { affectedAddress: $address }) {
    nodes {
      digest
      sender { address }
      effects {
        status
        timestamp
        balanceChanges { nodes { owner { address } amount coinType { repr } } }
      }
    }
  }
}`;

interface Node {
  digest: string;
  sender: { address: string } | null;
  effects: {
    status: string | null;
    timestamp: string | null;
    balanceChanges: { nodes: { owner: { address: string } | null; amount: string; coinType: { repr: string } | null }[] } | null;
  } | null;
}

export async function readSuiActivity(address: string, limit: number): Promise<{ items: WalletActivity[]; note: string | null }> {
  const owner = address.toLowerCase();
  const read = async () => {
    try {
      const data = await suiQuery<{ transactions: { nodes: Node[] } }>(QUERY, { address: owner, last: Math.min(limit, 50) });
      const nodes: SuiTxNode[] = data.transactions.nodes.map((node) => ({
        digest: node.digest,
        sender: node.sender?.address ?? null,
        timestamp: node.effects?.timestamp ?? null,
        success: node.effects?.status === "SUCCESS",
        changes: (node.effects?.balanceChanges?.nodes ?? []).map((change) => ({
          owner: change.owner?.address ?? null,
          coinType: change.coinType?.repr ?? SUI_COIN_TYPE,
          amount: change.amount,
        })),
      }));

      /* Decimals for the unlisted coins that moved, so amounts are right. */
      const unlisted = [
        ...new Set(
          nodes.flatMap((node) => node.changes.map((change) => normalizeCoinType(change.coinType))).filter((type) => suiTokenByType(type) === null),
        ),
      ].slice(0, 10);
      const decimals = new Map<string, number>();
      await Promise.all(
        unlisted.map(async (type) => {
          const meta = (await suiClient().getCoinMetadata({ coinType: type } as never).catch(() => null)) as {
            coinMetadata?: { decimals?: number } | null;
          } | null;
          if (typeof meta?.coinMetadata?.decimals === "number") decimals.set(type, meta.coinMetadata.decimals);
        }),
      );

      const coin = (type: string) => {
        const token = suiTokenByType(type);
        return token !== null ? { symbol: token.symbol, decimals: token.decimals } : { symbol: null, decimals: decimals.get(type) ?? 9 };
      };
      return { items: suiActivityRows(owner, nodes, coin, limit), note: null };
    } catch (error: unknown) {
      return { items: [], note: `Sui history could not be read: ${error instanceof Error ? error.message.slice(0, 160) : "GraphQL error"}.` };
    }
  };
  const result = await cached(`sui:activity:v1:${owner}:${limit}`, 30, read);
  return result.value;
}
