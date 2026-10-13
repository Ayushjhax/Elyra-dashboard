"use client";

import { Coins, LineChart, Layers, Target, type LucideIcon } from "lucide-react";
import { ACCOUNT_ACCENT, AccountStatus } from "@/components/assets/primitives";
import { Money, Skeleton } from "@/components/portfolio/primitives";
import { ALL_ACCOUNTS } from "@/lib/assets/derive";
import type { AssetAccount, AssetAccountType } from "@/lib/assets/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The four capital accounts, as cards.

   Clicking one filters the workspace below rather than opening a drawer —
   §22 prefers filtering, and on a page whose lower half is already the
   detail view, a drawer would cover the thing it is describing.

   A selected card is pressed rather than lit: its accent rail widens, its
   border brightens. No outer glow, per §12.
--------------------------------------------------------------------------- */

const ICON: Record<AssetAccountType, LucideIcon> = {
  spot: Coins,
  "solana-perps": LineChart,
  hyperliquid: Layers,
  prediction: Target,
};

function AccountCard({
  account,
  selected,
  onSelect,
}: {
  account: AssetAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = ICON[account.type];
  const accent = ACCOUNT_ACCENT[account.type];
  /* An account with nothing behind it is not a filter worth applying. */
  const selectable = account.status !== "empty";

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={!selectable}
      onClick={onSelect}
      className={cn(
        "group relative isolate flex min-w-0 flex-col gap-2 overflow-hidden",
        "rounded-card border p-3.5 text-left",
        "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-brand",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        selected
          ? "border-accent-quiet bg-surface-raised"
          : "border-border-subtle bg-surface-panel",
        selectable && !selected && "hover:border-border-strong hover:bg-surface-raised",
        !selectable && "cursor-default",
      )}
    >
      {/* The account's accent: a rail on the leading edge, thicker when this
          card is the active filter. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-[var(--dur-fast)] ease-brand"
        style={{ width: selected ? 3 : 2, background: accent.rail }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: `linear-gradient(135deg, ${accent.wash}, transparent 55%)` }}
      />

      <div className="flex items-center gap-1.5">
        <Icon size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <span className="type-label min-w-0 flex-1 truncate uppercase tracking-[0.08em] text-text-secondary">
          {account.label}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {account.status === "ready" ? (
          <>
            <Money
              value={account.valueUsd}
              reason="Nothing in this account carries a value."
              className="type-data text-text-primary"
            />
            <span className="type-label tabular-nums text-text-muted">
              {account.allocationPct === null
                ? "share unknown"
                : `${account.allocationPct.toFixed(1)}% of equity`}
            </span>
          </>
        ) : (
          <span className="type-data text-text-muted">
            {account.status === "error" ? "Data unavailable" : "No active balance"}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-1">
        {account.detail !== null && (
          <p className="type-label text-balance text-text-muted">{account.detail}</p>
        )}
        {account.status === "error" && account.errorReason !== null && (
          <p className="type-label text-balance text-negative">{account.errorReason}</p>
        )}
        <AccountStatus status={account.status} />
      </div>
    </button>
  );
}

export function AssetAccountsGrid({
  accounts,
  scope,
  onScopeChange,
}: {
  accounts: AssetAccount[];
  scope: string;
  onScopeChange: (scope: string) => void;
}) {
  return (
    <section
      aria-label="Capital accounts"
      /* One row at width, 2×2 on a laptop, one column on a narrow panel —
         container queries, because this page's width is the shell column's,
         not the viewport's. */
      className="grid grid-cols-1 gap-2.5 @[34rem]:grid-cols-2 @[64rem]:grid-cols-4"
    >
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          selected={scope === account.id}
          /* Clicking the active card clears the filter, so the card is its
             own "All accounts" reset and the operator never has to hunt for
             the way back. */
          onSelect={() => onScopeChange(scope === account.id ? ALL_ACCOUNTS : account.id)}
        />
      ))}
    </section>
  );
}

export function AssetAccountsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2.5 @[34rem]:grid-cols-2 @[64rem]:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-panel p-3.5"
        >
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-1 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}
