/* ---------------------------------------------------------------------------
   Prepared actions — the safety boundary.

   The model proposes; this file decides. Every identifier, balance and amount
   in a PreparedAction is RE-DERIVED here from live state before anything is
   shown, and the `derived` flag on each field records whether the value came
   from the server or was merely echoed. A model-supplied address, order id or
   quantity is a hint until it has been checked, because a token name is
   attacker-controlled text and a prompt injection inside one must not be able
   to describe a transfer.

   ── What can actually execute today ────────────────────────────────────

   Nothing. Confirmed by inspection: `sendTransaction`, `signTransaction` and
   `signAndSendTransaction` appear nowhere in this repository, and
   lib/exchange states its own rule — "Nothing in lib/exchange/ may call an
   endpoint that places, modifies or cancels an order". There is no swap
   route, no transfer builder and no order system.

   So every action this file prepares resolves to `unsupported`: correct,
   fully validated, priced against real balances, and not executable. That is
   deliberate. The alternative — building three money-moving flows against
   live funds inside this task — is not something to do as a side effect of a
   chat feature, and a Confirm button that silently does nothing would be
   worse than one that says why.

   When execution lands, `readiness` becomes "ready" for the kinds it covers
   and the confirm route hands off to it. The boundary does not change.

   No `server-only`: the validator is pure over a snapshot and is exercised
   directly by unit tests.
--------------------------------------------------------------------------- */

import { holdingFor, riskiestPosition, underlyingSymbol } from "@/lib/personalized/calculations";
import type {
  PreparedAction,
  PreparedActionField,
  PreparedActionKind,
} from "@/lib/personalized/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/** What the model is allowed to ask for. Anything else is rejected outright. */
const KINDS: PreparedActionKind[] = [
  "swap",
  "transfer",
  "withdraw",
  "close_perp",
  "reduce_perp",
  "cancel_order",
];

export function isActionKind(value: unknown): value is PreparedActionKind {
  return typeof value === "string" && KINDS.includes(value as PreparedActionKind);
}

/** A model's proposal, before validation. Every field is untrusted. */
export interface ActionProposal {
  kind: PreparedActionKind;
  /** Symbol to move, for swap/transfer/withdraw. */
  symbol?: string;
  /** Destination symbol for a swap. */
  toSymbol?: string;
  /** A fraction of the holding, 0–1 — how "sell half" arrives. */
  fraction?: number;
  /** An absolute quantity, if the operator named one. */
  quantity?: number;
  /** Perp market for close/reduce. */
  market?: string;
  /** Order id for a cancel. */
  orderId?: string;
}

function field(label: string, value: string, derived: boolean): PreparedActionField {
  return { label, value, derived };
}

function rejected(
  kind: PreparedActionKind,
  summary: string,
  reason: string,
): PreparedAction {
  return {
    id: `act_${Date.now().toString(36)}`,
    kind,
    summary,
    fields: [],
    readiness: "rejected",
    reason,
    warnings: [],
    preparedAt: new Date().toISOString(),
  };
}

/**
 * Which kinds have something behind them that can actually carry them out.
 *
 * A swap is routed by Jupiter and signed by the operator's own wallet, so it
 * is the one spot move a PROPOSAL can carry all the way.
 *
 * A transfer is deliberately absent even though Elyra can now build and send
 * one. An `ActionProposal` has no recipient field — "send 1 SOL" names an
 * amount and nothing else — so a transfer prepared from a proposal has
 * nowhere to go. Calling that ready would put a Confirm button under a send
 * with no destination. Transfers are started from the transfer dialog, where
 * the operator types the address themselves.
 *
 * `readiness` is derived from this set rather than asserted per branch, so a
 * kind cannot become executable by being edited in one place and forgotten
 * in another — which matters because swap, transfer and withdraw all share
 * the branch below.
 */
const EXECUTABLE: ReadonlySet<PreparedActionKind> = new Set(["swap"]);

/**
 * Why the rest are not executable, stated once.
 *
 * Named rather than hand-waved: an operator reading "not supported" learns
 * nothing, and an engineer reading it learns less.
 */
const NO_EXECUTOR: Record<PreparedActionKind, string> = {
  swap: "Review it in Elyra on the web: the swap is quoted by Jupiter and signed in your own wallet there.",
  transfer:
    "A transfer needs a destination address, which this cannot carry. Start it " +
    "from Transfer in Elyra and the send will be built and signed there.",
  withdraw:
    "Venue connections are read-only by design, so Elyra cannot move funds off a venue yet.",
  close_perp:
    "Venue connections are read-only by design, so Elyra cannot close a position yet.",
  reduce_perp:
    "Venue connections are read-only by design, so Elyra cannot reduce a position yet.",
  cancel_order: "Elyra has no order system yet, so there is nothing to cancel.",
};

function quantityText(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Turns a proposal into something safe to show, or refuses it.
 *
 * `concentrationLimit` is the operator's saved single-asset cap, used only to
 * attach a warning — a preference is not a veto, and an action that breaches
 * one is still the operator's to take knowingly.
 */
export function prepareAction(
  proposal: ActionProposal,
  snapshot: PortfolioSnapshot,
  options: { concentrationLimit?: number | null } = {},
): PreparedAction {
  const preparedAt = new Date().toISOString();
  const id = `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const warnings: string[] = [];

  /* ---- Spot moves: swap, transfer, withdraw of a held token ---- */
  if (
    proposal.kind === "swap" ||
    proposal.kind === "transfer" ||
    proposal.kind === "withdraw"
  ) {
    const symbol = (proposal.symbol ?? "").toUpperCase();
    if (symbol.length === 0) {
      return rejected(proposal.kind, "Move funds", "No asset was named.");
    }

    /* The balance is read from the snapshot, never from the model. This is
       the line that makes "sell half my SOL" safe: half of what the operator
       actually holds right now, not half of a number a model recalled. */
    const holding = holdingFor(snapshot, symbol);
    if (holding === null) {
      return rejected(
        proposal.kind,
        `Move ${symbol}`,
        `No ${symbol} balance was found in this account.`,
      );
    }

    let quantity: number;
    if (typeof proposal.fraction === "number" && Number.isFinite(proposal.fraction)) {
      const fraction = Math.min(1, Math.max(0, proposal.fraction));
      quantity = holding.quantity * fraction;
    } else if (typeof proposal.quantity === "number" && Number.isFinite(proposal.quantity)) {
      quantity = proposal.quantity;
    } else {
      return rejected(
        proposal.kind,
        `Move ${symbol}`,
        "No amount was specified.",
      );
    }

    if (quantity <= 0) {
      return rejected(proposal.kind, `Move ${symbol}`, "The amount must be above zero.");
    }

    /* An amount larger than the balance is clamped and flagged rather than
       rejected: the intent is clear and the operator should see the real
       maximum instead of an error. */
    if (quantity > holding.quantity) {
      warnings.push(
        `Reduced to the full ${symbol} balance — the amount asked for was larger than the balance.`,
      );
      quantity = holding.quantity;
    }

    const valueUsd =
      holding.priceUsd === null ? null : quantity * holding.priceUsd;

    const toSymbol = (proposal.toSymbol ?? "USDC").toUpperCase();

    const limit = options.concentrationLimit;
    if (
      proposal.kind === "swap" &&
      typeof limit === "number" &&
      snapshot.summary.totalValueUsd !== null &&
      snapshot.summary.totalValueUsd > 0
    ) {
      const destination = holdingFor(snapshot, toSymbol);
      const after =
        ((destination?.valueUsd ?? 0) + (valueUsd ?? 0)) /
        snapshot.summary.totalValueUsd;
      if (after * 100 > limit) {
        warnings.push(
          `This would put ${toSymbol} at about ${(after * 100).toFixed(1)}% of equity, above your saved ${limit}% limit.`,
        );
      }
    }

    const summary =
      proposal.kind === "swap"
        ? `Swap ${quantityText(quantity)} ${symbol} to ${toSymbol}`
        : proposal.kind === "transfer"
          ? `Transfer ${quantityText(quantity)} ${symbol}`
          : `Withdraw ${quantityText(quantity)} ${symbol}`;

    const fields: PreparedActionField[] = [
      field("Asset", symbol, true),
      field("Amount", `${quantityText(quantity)} ${symbol}`, true),
      field(
        "Value",
        valueUsd === null ? "unknown — no price source" : `$${valueUsd.toFixed(2)}`,
        true,
      ),
      field("Balance after", `${quantityText(holding.quantity - quantity)} ${symbol}`, true),
    ];
    if (proposal.kind === "swap") fields.splice(1, 0, field("To", toSymbol, false));

    const executable = EXECUTABLE.has(proposal.kind);

    return {
      id,
      kind: proposal.kind,
      summary,
      fields,
      readiness: executable ? "ready" : "unsupported",
      reason: executable ? null : NO_EXECUTOR[proposal.kind],
      warnings,
      preparedAt,
      params: {
        symbol,
        ...(proposal.kind === "swap" ? { toSymbol } : {}),
        quantity,
      },
    };
  }

  /* ---- Perp moves ---- */
  if (proposal.kind === "close_perp" || proposal.kind === "reduce_perp") {
    /* "Close my riskiest perp" names no market, so the server picks it — by
       liquidation proximity, which is a computed fact, not a model opinion. */
    const named = proposal.market?.toUpperCase();
    const position =
      named === undefined
        ? riskiestPosition(snapshot)
        : (snapshot.perps.find(
            (entry) =>
              entry.market.toUpperCase() === named ||
              underlyingSymbol(entry.market) === underlyingSymbol(named),
          ) ?? null);

    if (position === null) {
      return rejected(
        proposal.kind,
        named === undefined ? "Close a position" : `Close ${named}`,
        named === undefined
          ? "No open position could be identified — either none are open, or none report a liquidation price to rank by."
          : `No open position was found on ${named}.`,
      );
    }

    const fraction =
      proposal.kind === "close_perp"
        ? 1
        : Math.min(1, Math.max(0, proposal.fraction ?? 0.5));

    const size = position.size * fraction;

    return {
      id,
      kind: proposal.kind,
      summary:
        proposal.kind === "close_perp"
          ? `Close ${position.side} ${position.market}`
          : `Reduce ${position.side} ${position.market} by ${(fraction * 100).toFixed(0)}%`,
      fields: [
        field("Market", position.market, true),
        field("Venue", position.venue, true),
        field("Side", position.side === "long" ? "LONG" : "SHORT", true),
        field("Size", `${quantityText(size)} of ${quantityText(position.size)}`, true),
        field(
          "Unrealized PnL",
          position.unrealizedPnlUsd === null
            ? "not reported by the venue"
            : `${position.unrealizedPnlUsd >= 0 ? "+" : "-"}$${Math.abs(position.unrealizedPnlUsd).toFixed(2)}`,
          true,
        ),
      ],
      readiness: "unsupported",
      reason: NO_EXECUTOR[proposal.kind],
      warnings,
      preparedAt,
    };
  }

  /* ---- Orders ---- */
  const order = snapshot.orders.find((entry) => entry.id === proposal.orderId);
  if (order === undefined) {
    return rejected(
      "cancel_order",
      "Cancel an order",
      snapshot.orders.length === 0
        ? "There are no open orders on this account."
        : "That order is not open on this account.",
    );
  }

  return {
    id,
    kind: "cancel_order",
    summary: `Cancel ${order.side} ${order.market}`,
    fields: [
      field("Market", order.market, true),
      field("Venue", order.venue, true),
      field("Type", order.type, true),
      field("Size", quantityText(order.quantity), true),
    ],
    readiness: "unsupported",
    reason: NO_EXECUTOR.cancel_order,
    warnings,
    preparedAt,
  };
}

/**
 * Re-validates a prepared action at confirmation time.
 *
 * The gap between preview and confirm is where state moves: a balance is
 * spent, a position is liquidated, a price runs. Re-deriving against a fresh
 * snapshot is what catches that, and a changed result is reported rather than
 * executed.
 */
export function revalidate(
  action: PreparedAction,
  proposal: ActionProposal,
  snapshot: PortfolioSnapshot,
  options: { concentrationLimit?: number | null } = {},
): { action: PreparedAction; changed: boolean } {
  const fresh = prepareAction(proposal, snapshot, options);
  const changed =
    fresh.readiness !== action.readiness ||
    fresh.summary !== action.summary ||
    fresh.fields.some((entry, index) => entry.value !== action.fields[index]?.value);
  return { action: fresh, changed };
}
