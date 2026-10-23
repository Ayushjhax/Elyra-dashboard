import type { ContextSource } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   What each source of account context is doing, in one word.

   Pure, and read by three surfaces that must agree: the Data sources card,
   the composer's "Using" chips and the "Account context" indicator. A source
   is one of five things, and each needs a different response from the
   person — so none of them may look like another:

     connected    read, and it holds something        (a green dot)
     available    read, and ready to be used          (a lime dot)
     empty        read, and there is nothing in it    (a grey dot)
     unavailable  cannot be read here — no wallet, not configured
     failed       should be readable and the read failed
     loading      not read yet
--------------------------------------------------------------------------- */

export type SourceState = "connected" | "available" | "empty" | "unavailable" | "failed" | "loading";

export interface SourceStatus {
  state: SourceState;
  label: string;
}

export type SourceKey = "wallet" | "positions" | "activity" | "memory";

export interface SourceInputs {
  wallet: {
    loading: boolean;
    hasAddress: boolean;
    unconfigured: boolean;
    read: boolean;
    stale: boolean;
    error: string | null;
  };
  portfolio: {
    loading: boolean;
    read: boolean;
    /** Open perps, DeFi deposits and prediction markets together. */
    positions: number;
    /** A venue, DeFi or prediction read failed, so positions may be missing. */
    positionsFailed: boolean;
    error: string | null;
  };
  activity: { loading: boolean; unconfigured: boolean; count: number; error: string | null };
  memory: { loading: boolean; count: number; error: string | null };
}

export function sourceStatuses(input: SourceInputs): Record<SourceKey, SourceStatus> {
  const { wallet, portfolio, activity, memory } = input;

  const walletStatus: SourceStatus = wallet.loading
    ? { state: "loading", label: "Checking…" }
    : !wallet.hasAddress
      ? { state: "unavailable", label: "No wallet" }
      : wallet.unconfigured
        ? { state: "unavailable", label: "Not configured" }
        : wallet.read
          ? wallet.stale
            ? { state: "failed", label: "Last read failed" }
            : { state: "connected", label: "Connected" }
          : { state: "failed", label: "Unreachable" };

  const positionsStatus: SourceStatus = portfolio.loading
    ? { state: "loading", label: "Checking…" }
    : !portfolio.read
      ? { state: "failed", label: "Couldn't read" }
      : portfolio.positions > 0
        ? { state: "connected", label: `${portfolio.positions} open` }
        : portfolio.positionsFailed
          ? { state: "failed", label: "Partly unread" }
          : { state: "empty", label: "None yet" };

  const activityStatus: SourceStatus = activity.loading
    ? { state: "loading", label: "Checking…" }
    : activity.unconfigured
      ? { state: "unavailable", label: "Not configured" }
      : activity.error !== null && activity.count === 0
        ? { state: "failed", label: "Couldn't read" }
        : activity.count > 0
          ? { state: "available", label: "Available" }
          : { state: "empty", label: "None yet" };

  const memoryStatus: SourceStatus = memory.loading
    ? { state: "loading", label: "Checking…" }
    : memory.error !== null
      ? { state: "failed", label: "Couldn't read" }
      : memory.count > 0
        ? { state: "connected", label: `${memory.count} saved` }
        : { state: "empty", label: "Not set" };

  return { wallet: walletStatus, positions: positionsStatus, activity: activityStatus, memory: memoryStatus };
}

/** Which status a composer chip reflects. The portfolio is read through the wallet. */
export const CHIP_SOURCE: Record<ContextSource, SourceKey> = {
  portfolio: "wallet",
  positions: "positions",
  activity: "activity",
  memory: "memory",
};

/**
 * Whether a chip's source can actually reach the assistant. An empty source
 * still can — "you have no positions" is an answer — but one that cannot be
 * read cannot.
 */
export function usable(status: SourceStatus): boolean {
  return status.state !== "unavailable" && status.state !== "failed";
}

/**
 * The indicator in the conversation header: on when the person is signed in
 * with a wallet and has left at least one source switched on.
 */
export function accountContextOn(signedIn: boolean, hasWallet: boolean, selected: readonly ContextSource[]): boolean {
  return signedIn && hasWallet && selected.length > 0;
}
