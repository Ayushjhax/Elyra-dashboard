import type { ContextSource } from "@/lib/personalized/types";
import { msg } from "@/lib/i18n/translate";

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
  /** English, as the Android app shows it — and the website's key for `t()`. */
  label: string;
  /** When the label carries a count: the template the website translates, and its values. */
  template?: string;
  values?: Readonly<Record<string, number>>;
}

/** A label with a count in it: the English filled in, and the template to translate. */
function counted(template: string, count: number): Pick<SourceStatus, "label" | "template" | "values"> {
  return { label: template.replace("{count}", String(count)), template, values: { count } };
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
    ? { state: "loading", label: msg("Checking…") }
    : !wallet.hasAddress
      ? { state: "unavailable", label: msg("No wallet") }
      : wallet.unconfigured
        ? { state: "unavailable", label: msg("Not configured") }
        : wallet.read
          ? wallet.stale
            ? { state: "failed", label: msg("Last read failed") }
            : { state: "connected", label: msg("Connected") }
          : { state: "failed", label: msg("Unreachable") };

  const positionsStatus: SourceStatus = portfolio.loading
    ? { state: "loading", label: msg("Checking…") }
    : !portfolio.read
      ? { state: "failed", label: msg("Couldn't read") }
      : portfolio.positionsFailed || portfolio.error !== null
        ? { state: "failed", ...(portfolio.positions > 0
            ? counted(msg("{count} open · partly unread"), portfolio.positions)
            : { label: msg("Partly unread") }) }
        : portfolio.positions > 0
          ? { state: "connected", ...counted(msg("{count} open"), portfolio.positions) }
          : { state: "empty", label: msg("None yet") };

  const activityStatus: SourceStatus = activity.loading
    ? { state: "loading", label: msg("Checking…") }
    : activity.unconfigured
      ? { state: "unavailable", label: msg("Not configured") }
      : activity.error !== null
        ? { state: "failed", label: activity.count > 0 ? "Last read failed" : "Couldn't read" }
        : activity.count > 0
          ? { state: "available", label: msg("Available") }
          : { state: "empty", label: msg("None yet") };

  const memoryStatus: SourceStatus = memory.loading
    ? { state: "loading", label: msg("Checking…") }
    : memory.error !== null
      ? { state: "failed", label: msg("Couldn't read") }
      : memory.count > 0
        ? { state: "connected", ...counted(msg("{count} saved"), memory.count) }
        : { state: "empty", label: msg("Not set") };

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
