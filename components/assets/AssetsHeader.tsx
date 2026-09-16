"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ALL_ACCOUNTS } from "@/lib/assets/derive";
import type { AssetScope } from "@/lib/assets/types";
import { truncateMiddle } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Who this capital belongs to, and how fresh the reading is.

   The selector scopes to a capital ACCOUNT rather than to a Privy wallet,
   and that is deliberate. design.md §7 sketches "Embedded Wallet / External
   Wallet 1 / …", but this app's Privy integration surfaces exactly one
   linked address per chain — `firstAddress()` in lib/auth/session.ts takes
   the first and the rest are never published to the client. Offering a
   multi-wallet picker over a single-wallet integration would be a control
   that cannot do what it says. Accounts are the axis that genuinely varies
   here, and they are what the account cards filter by, so the two controls
   drive one piece of state instead of competing.

   Freshness is an age, never a "LIVE" light: this polls every thirty
   seconds, and a green dot over a thirty-second cache is a small lie that
   costs money exactly once.
--------------------------------------------------------------------------- */

function age(fetchedAt: number | null, now: number | null): string {
  if (fetchedAt === null) return "never";
  if (now === null) return "just now";
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function IconControl({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-control border border-border-subtle",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        "hover:border-border-strong hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        active ? "text-accent" : "text-text-muted hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function AssetsHeader({
  scopes,
  scope,
  onScopeChange,
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  scopes: AssetScope[];
  scope: string;
  onScopeChange: (scope: string) => void;
  fetchedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  /* The same persisted flag Portfolio's privacy toggle writes. Shared on
     purpose: "hide my balances" is a property of the operator's situation —
     a shared screen, a recording — not of whichever page they are on. */
  const hidden = useElyraStore((state) => state.balancesHidden);
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const [open, setOpen] = useState(false);

  const active = scopes.find((entry) => entry.id === scope);
  const label = scope === ALL_ACCOUNTS ? "All accounts" : (active?.label ?? "Account");

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Eyebrow>Assets</Eyebrow>
        <h1 className="type-h2 text-text-primary">Capital Accounts</h1>
        <p className="type-body-sm text-text-secondary">
          Balances, venues and capital movement in one place.
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className={cn(
                "type-label flex h-7 items-center gap-1.5 rounded-control border border-border-subtle px-2",
                "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
                "hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              )}
            >
              {label}
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                aria-hidden
                className={cn(
                  "transition-transform duration-[var(--dur-base)] ease-brand",
                  open && "rotate-180",
                )}
              />
            </button>

            {open && (
              <ul
                role="listbox"
                aria-label="Capital account"
                className={cn(
                  "absolute right-0 top-full z-40 mt-1 flex min-w-56 list-none flex-col",
                  "rounded-card border border-border-subtle bg-surface-raised p-1",
                )}
              >
                {[{ id: ALL_ACCOUNTS, label: "All accounts", address: null }, ...scopes].map(
                  (entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={entry.id === scope}
                        onClick={() => {
                          onScopeChange(entry.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "type-label flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left",
                          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                          entry.id === scope ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        <Check
                          size={11}
                          strokeWidth={1.5}
                          aria-hidden
                          className={cn(entry.id === scope ? "text-accent" : "opacity-0")}
                        />
                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        {entry.address !== null && (
                          <span className="type-mono-addr shrink-0 text-text-muted">
                            {truncateMiddle(entry.address, 4, 4)}
                          </span>
                        )}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          <IconControl
            label={hidden ? "Show balances" : "Hide balances"}
            active={hidden}
            onClick={() => setHidden(!hidden)}
          >
            {hidden ? (
              <EyeOff size={13} strokeWidth={1.5} aria-hidden />
            ) : (
              <Eye size={13} strokeWidth={1.5} aria-hidden />
            )}
          </IconControl>

          <IconControl label="Refresh balances" onClick={onRefresh}>
            <RefreshCw
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn(refreshing && "motion-safe:animate-spin")}
            />
          </IconControl>
        </div>

        <div className="flex items-center gap-2">
          {active?.address != null && (
            <span className="type-mono-addr text-text-muted">
              {truncateMiddle(active.address, 4, 4)}
            </span>
          )}
          <span className="type-label text-text-muted">Updated {age(fetchedAt, now)}</span>
        </div>
      </div>
    </header>
  );
}
