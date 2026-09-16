"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { truncateMiddle } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import type { WalletScope } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   Who this portfolio belongs to, and how fresh it is.

   The scope selector filters what is already on screen rather than refetching
   — the response covers every account the session owns, so narrowing to one
   is a render, not a request.

   Freshness is stated as an age, never as a "LIVE" light. §28 is explicit
   about that: this polls every thirty seconds, and a green dot claiming live
   data over a thirty-second cache is the kind of small lie that costs money
   the one time it matters.
--------------------------------------------------------------------------- */

const ALL = "all";

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

function ControlButton({
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

export function PortfolioHeader({
  scopes,
  scope,
  onScopeChange,
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  scopes: WalletScope[];
  scope: string;
  onScopeChange: (scope: string) => void;
  fetchedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const hidden = useElyraStore((state) => state.balancesHidden);
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const [open, setOpen] = useState(false);

  const active = scopes.find((entry) => entry.id === scope);
  const label =
    scope === ALL ? (scopes.length > 1 ? "All accounts" : "Portfolio") : (active?.label ?? "Account");

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Eyebrow>Portfolio</Eyebrow>
          <h1 className="type-h2 text-text-primary">Capital Overview</h1>
          <p className="type-body-sm text-text-secondary">
            Wallets, positions, yield and exposure — unified.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ControlButton
            label={hidden ? "Show balances" : "Hide balances"}
            active={hidden}
            onClick={() => setHidden(!hidden)}
          >
            {hidden ? (
              <EyeOff size={13} strokeWidth={1.5} aria-hidden />
            ) : (
              <Eye size={13} strokeWidth={1.5} aria-hidden />
            )}
          </ControlButton>

          <ControlButton label="Refresh portfolio" onClick={onRefresh}>
            <RefreshCw
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn(refreshing && "motion-safe:animate-spin")}
            />
          </ControlButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {scopes.length > 1 && (
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
                aria-label="Account scope"
                className={cn(
                  "absolute left-0 top-full z-40 mt-1 flex min-w-52 list-none flex-col",
                  "rounded-card border border-border-subtle bg-surface-raised p-1",
                )}
              >
                {[{ id: ALL, label: "All accounts", address: null, chain: "", venue: "wallet" } as WalletScope, ...scopes].map(
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
        )}

        {active?.address != null && (
          <span className="type-mono-addr text-text-muted">
            {truncateMiddle(active.address, 4, 4)}
          </span>
        )}

        <span className="type-label ml-auto text-text-muted">
          Updated {age(fetchedAt, now)}
        </span>
      </div>
    </div>
  );
}
