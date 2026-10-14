import type { OpenAction } from "@/app/api/actions/route";
import { formatPriceUsd } from "@/lib/format";
import type { PortfolioActivity } from "@/lib/portfolio/types";
import type { PriceAlert } from "@/lib/telegram/alerts";
import type { TxSummary } from "@/lib/wallet/summarise";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The account's activity, as one feed.

   Four real sources, each described only as far as it goes:

   - the wallet's transaction list — landed or failed, when, and the explorer
     for the rest, because the signature list carries nothing more;
   - the venues' own activity, where the portfolio snapshot has any;
   - price alerts the delivery worker fired, with the price it saw;
   - actions prepared in Telegram that are waiting on the person.

   Nothing is seeded. The workspace's Activity widget lists all of it; the
   bell rings only for the events that ask for attention.

   Pure, so it is tested directly.
--------------------------------------------------------------------------- */

export type AccountEventKind = "transaction" | "venue" | "alert" | "action";

export interface AccountEvent {
  id: string;
  kind: AccountEventKind;
  text: string;
  /** ISO. Events without a time yet sort first and read as pending. */
  at: string | null;
  status: "pending" | "confirmed" | "failed";
  href: string | null;
  /** Produced by Elyra on the person's behalf, so it carries the agent rail. */
  agent: boolean;
  /** Worth ringing the bell for. */
  attention: boolean;
  /** For a wallet transaction the RPC could read: what moved, and how. */
  summary?: TxSummary | null;
}

export function accountEvents(input: {
  wallet: readonly WalletActivity[];
  venue: readonly PortfolioActivity[];
  alerts: readonly PriceAlert[];
  actions: readonly OpenAction[];
  explorer: (signature: string) => string;
}): AccountEvent[] {
  const events: AccountEvent[] = [];

  for (const tx of input.wallet) {
    const summary = tx.summary ?? null;
    events.push({
      id: `tx:${tx.signature}`,
      kind: "transaction",
      summary,
      text:
        (summary !== null && tx.status !== "failed" ? summary.title : null) ??
        tx.memo ??
        (tx.status === "failed"
          ? summary !== null
            ? `Failed: ${summary.title.charAt(0).toLowerCase()}${summary.title.slice(1)}`
            : "Wallet transaction failed on-chain"
          : tx.status === "pending"
            ? "Wallet transaction processing"
            : "Wallet transaction confirmed"),
      at: tx.at,
      status: tx.status,
      href: input.explorer(tx.signature),
      agent: false,
      attention: tx.status === "failed",
    });
  }

  for (const item of input.venue) {
    events.push({
      id: `venue:${item.id}`,
      kind: "venue",
      text: item.summary,
      at: item.at,
      status: item.status,
      href: item.href,
      agent: item.kind === "agent",
      attention: item.status === "failed" || item.kind === "agent",
    });
  }

  for (const alert of input.alerts) {
    if (alert.triggeredAt === null) continue;
    const seen = alert.triggeredPrice == null ? "" : ` at ${formatPriceUsd(alert.triggeredPrice)}`;
    events.push({
      id: `alert:${alert.id}:${alert.triggeredAt}`,
      kind: "alert",
      text: `${alert.symbol} crossed ${alert.direction} ${formatPriceUsd(alert.target)}${seen} — alert sent to Telegram`,
      at: alert.triggeredAt,
      status: "confirmed",
      href: null,
      agent: true,
      attention: true,
    });
  }

  for (const entry of input.actions) {
    events.push({
      id: `action:${entry.id}`,
      kind: "action",
      text: `${entry.action.summary} — awaiting your review`,
      at: entry.action.preparedAt,
      status: "pending",
      href: null,
      agent: true,
      attention: true,
    });
  }

  return events.sort((a, b) => {
    const left = a.at === null ? Number.POSITIVE_INFINITY : Date.parse(a.at);
    const right = b.at === null ? Number.POSITIVE_INFINITY : Date.parse(b.at);
    return right - left;
  });
}
