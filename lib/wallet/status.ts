import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import type { Cluster } from "@/lib/solana/cluster";

/* ---------------------------------------------------------------------------
   Where the wallet's read stands, in words the data supports.

   One rule for every surface that shows it — the header's wallet menu, the
   rail's account menu and the wallet drawer — so no two of them can call
   the same wallet connected and unreachable at once.
--------------------------------------------------------------------------- */

/**
 * The fields of a wallet read these rules look at — what the website's
 * `useWalletDashboard` and the Android app's wallet store both provide.
 */
export interface WalletReadState {
  address: string | null;
  cluster: Cluster | null;
  snapshot: unknown | null;
  unconfigured: boolean;
  wrongChain: boolean;
  isLoading: boolean;
  stale: boolean;
}

export type WalletTone = "positive" | "caution" | "negative" | "muted";

export interface WalletStatus {
  tone: WalletTone;
  /** Short: "Connected", "Last read failed". */
  label: string;
}

export function walletStatus(wallet: WalletReadState): WalletStatus {
  if (wallet.unconfigured) return { tone: "muted", label: "Not configured" };
  if (wallet.wrongChain) return { tone: "negative", label: "Wrong cluster" };
  if (wallet.snapshot === null) {
    return wallet.isLoading ? { tone: "muted", label: "Checking…" } : { tone: "negative", label: "Unreachable" };
  }
  if (wallet.stale) return { tone: "caution", label: "Last read failed" };
  return { tone: "positive", label: "Connected" };
}

export interface WalletIdentityInfo {
  address: string;
  /** "Solana mainnet" — the network the node reported, or the expected one before the first read. */
  networkLabel: string;
  /** What the identicon is drawn from: the network and the full address. */
  mark: { network: string; address: string };
}

/**
 * The wallet as every account surface names it. Null while the address is
 * unknown — restoring the session, or an account without a Solana wallet.
 */
export function walletIdentity(wallet: Pick<WalletReadState, "address" | "cluster">): WalletIdentityInfo | null {
  if (wallet.address === null) return null;
  const cluster = wallet.cluster ?? EXPECTED_CLUSTER;
  return {
    address: wallet.address,
    networkLabel: CLUSTER_LABEL[cluster],
    mark: { network: `solana:${cluster}`, address: wallet.address },
  };
}
