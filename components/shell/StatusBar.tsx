"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { BalanceChip } from "@/components/shell/status/BalanceChip";
import { Clock } from "@/components/shell/status/Clock";
import { HealthMeter } from "@/components/shell/status/HealthMeter";
import { KillSwitch } from "@/components/shell/status/KillSwitch";
import { TelegramLink } from "@/components/shell/status/TelegramLink";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePrices } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import { health, priceStateOf, rpcStateOf } from "@/lib/wallet/health";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The status bar: one row above the whole shell, on every route.

   The mark, the wordmark and the rail's collapse control sit on the left —
   they used to open the nav rail below, but the rail is a list of routes now
   and this is the one row that is always on screen, whatever the rail is
   doing. Live status is right-aligned, monospace, and every value in it is
   real: the health score is computed from the two upstreams, the clock is
   the viewer's own, and the balance is read from chain.

   Below 640px both sides collapse to the balance and a menu button, which is
   the width at which the shell itself stops showing columns — the rail
   included, so its collapse control has nothing to control down there.
--------------------------------------------------------------------------- */

/**
 * Collapse the rail to its icons, and bring it back.
 *
 * It writes a flag rather than a width, so the width the operator dragged the
 * rail to is still theirs when they expand it — see `railCollapsed` in
 * `lib/layout.ts`. Everything else follows from the width the fitter then
 * returns: the labels glide shut, and the rail's own resize handle stands down
 * while it is pinned.
 */
function RailCollapseToggle() {
  const collapsed = useElyraStore((state) => state.railCollapsed);
  const setRailCollapsed = useElyraStore((state) => state.setRailCollapsed);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand the navigation" : "Collapse the navigation"}
          onClick={() => setRailCollapsed(!collapsed)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-control",
            "border border-border-subtle text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {collapsed ? "Expand the navigation" : "Collapse to icons"}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The mark and wordmark. Only from 640px up, alongside the rail it now
 * fronts for — below that the rail is a sheet reached from the menu button
 * on the right, not this row.
 */
function Brand() {
  return (
    <div className="hidden shrink-0 items-center gap-2 compact:flex">
      {/* Circular. `logo.png` is a square with a lime ground, so at 28px
          square it read as a lime tile rather than as a mark. The image is
          scaled slightly inside the crop so the green disc reaches the edge
          and only a hairline of lime is left. */}
      <Link
        href="/"
        aria-label="Elyra home"
        className={cn(
          "relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden",
          "rounded-pill border border-border-subtle",
          "transition-shadow duration-[var(--dur-fast)] ease-brand hover:shadow-lift-accent",
        )}
      >
        <Image
          src="/logo.png"
          alt="Elyra"
          width={28}
          height={28}
          priority
          className="size-full scale-[1.14] object-cover"
        />
      </Link>

      {/* Wordmark, set in Parastoo — the one place that face appears — so it
          reads distinctly from the UI type around it. White regardless of
          theme, matching the mark rather than the bar's muted text. */}
      <Link
        href="/"
        aria-label="Elyra home"
        className="font-[family-name:var(--font-parastoo)] text-[15px] font-normal leading-none text-white"
      >
        Elyra
      </Link>

      <RailCollapseToggle />
    </div>
  );
}

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
        "flex h-10 shrink-0 items-center justify-between gap-3 px-3",
        "rim rounded-panel border border-border-subtle bg-surface-panel",
      )}
    >
      <Brand />

      <div className="flex items-center gap-3">
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
    </div>
  );
}
