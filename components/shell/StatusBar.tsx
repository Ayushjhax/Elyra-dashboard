"use client";

import { Menu } from "lucide-react";
import { BalanceChip } from "@/components/shell/status/BalanceChip";
import { Clock } from "@/components/shell/status/Clock";
import { HealthMeter } from "@/components/shell/status/HealthMeter";
import { KillSwitch } from "@/components/shell/status/KillSwitch";
import { TelegramLink } from "@/components/shell/status/TelegramLink";
import { usePrices } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import { health, priceStateOf, rpcStateOf } from "@/lib/wallet/health";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The status bar: one row above the whole shell, on every route.

   Right-aligned, monospace, and every value in it is live. Nothing here is a
   placeholder — the health score is computed from the two upstreams, the
   clock is the viewer's own, and the balance is read from chain.

   Below 640px it collapses to the balance and a menu button, which is the
   width at which the shell itself stops showing columns.
--------------------------------------------------------------------------- */

export function StatusBar() {
  const wallet = useWalletDashboard();
  const setNavSheetOpen = useElyraStore((state) => state.setNavSheetOpen);

  /* An empty id list adds no subscription; it reads the shared feed's status,
     which the market column keeps alive for the life of the session. */
  const prices = usePrices([]);

  const score = health({
    rpc: rpcStateOf({
      unconfigured: wallet.unconfigured,
      isLoading: wallet.isLoading,
      error: wallet.error,
      stale: wallet.stale,
      hasSnapshot: wallet.snapshot !== null,
    }),
    prices: priceStateOf(prices.status),
    latencyMs: wallet.latencyMs,
  });

  return (
    <div
      role="status"
      aria-label="System status"
      className={cn(
        "flex h-10 shrink-0 items-center justify-end gap-3 px-3",
        "rim rounded-panel border border-border-subtle bg-surface-panel",
      )}
    >
      {/* The full group, from 640px up. */}
      <div className="hidden items-center gap-3 compact:flex">
        <HealthMeter health={score} />
        <Clock />
        <TelegramLink />
        <KillSwitch />
      </div>

      <BalanceChip />

      {/* Below 640px the rail is a sheet, and this is the way into it. */}
      <button
        type="button"
        onClick={() => setNavSheetOpen(true)}
        aria-haspopup="dialog"
        aria-label="Open navigation"
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-control compact:hidden",
          "border border-border-subtle text-text-secondary",
          "transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <Menu size={16} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
