"use client";

import { AlertTriangle, Wallet } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUsd } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The balance chip.

   Four states, and the rule that binds them: **this control never displays a
   number it does not have.** A loading balance is a skeleton of the width the
   figure will take, not "$0.00" — because $0.00 is a claim, and it is the
   most alarming possible wrong one to make about somebody's wallet.

     signed out   → Connect
     loading      → skeleton, same width
     stale        → the last real reading, marked, with the reason in a tooltip
     live         → the figure
--------------------------------------------------------------------------- */

const chip = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-control border px-2",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

export function BalanceChip() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const setWalletSheetOpen = useElyraStore((state) => state.setWalletSheetOpen);

  /* No Privy at all: the terminal still runs, and a Connect button that opens
     nothing would be worse than no button. */
  if (!auth.available) return null;

  if (!auth.ready) {
    /* The session is still being restored. Hold the chip's footprint so the
       row does not reflow the instant it resolves. */
    return <span className="skeleton h-7 w-[92px] rounded-control" aria-hidden />;
  }

  if (!auth.authenticated) {
    return (
      <Button size="sm" variant="accent" onClick={auth.login}>
        Connect
      </Button>
    );
  }

  /* Read into a local so the null check narrows all the way down. */
  const usd = wallet.usdValue;
  const degraded = wallet.stale || wallet.error !== null || wallet.unconfigured;

  const label =
    usd === null
      ? "Wallet balance loading"
      : `Wallet balance ${formatUsd(usd)}${wallet.stale ? ", last known value" : ""}`;

  const reason = wallet.unconfigured
    ? "The Solana RPC is not configured, so no balance can be read."
    : wallet.error !== null
      ? wallet.stale
        ? `Showing the last reading. ${wallet.error}`
        : wallet.error
      : usd === null && !wallet.isLoading
        ? "The SOL price is unavailable, so the total cannot be computed."
        : "Open wallet";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setWalletSheetOpen(true)}
          aria-label={label}
          aria-haspopup="dialog"
          className={cn(
            chip,
            degraded
              ? "border-negative/40 bg-negative-bg text-text-primary hover:bg-negative-bg/80"
              : "border-border-strong bg-surface-raised text-text-primary hover:bg-surface-hover",
          )}
        >
          {degraded ? (
            <AlertTriangle
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="shrink-0 text-negative"
            />
          ) : (
            <Wallet
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="shrink-0 text-accent-quiet"
            />
          )}

          {usd !== null ? (
            <span
              className={cn(
                "type-mono-addr tabular-nums",
                /* A stale figure is dimmed rather than hidden. It was true,
                   and saying when beats saying nothing. */
                wallet.stale ? "text-text-secondary" : "text-text-primary",
              )}
            >
              {formatUsd(usd)}
            </span>
          ) : (
            /* Never "$0.00". Six characters is the width of "$75.29", which
               is what the figure will most often be. */
            <span className="skeleton h-4 w-[6ch]" aria-hidden />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  );
}
