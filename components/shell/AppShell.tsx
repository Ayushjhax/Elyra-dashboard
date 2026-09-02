import { ActivityPanel } from "@/components/panels/ActivityPanel";
import { AssistPanel } from "@/components/panels/AssistPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";
import { WatchlistPanel } from "@/components/panels/WatchlistPanel";
import {
  LeftSheet,
  MobilePanelSheet,
  MobileTabBar,
  NavSheet,
  RightDrawer,
} from "@/components/shell/CollapsedSurfaces";
import { NavRail } from "@/components/shell/NavRail";
import { TerminalRuntime } from "@/components/shell/TerminalRuntime";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The terminal shell: one fixed-height screen, 12px gap, 12px outer padding on
 * --surface-base. Nothing here scrolls — every panel handles its own overflow.
 *
 *   ≥1280   216px | 288px | 1fr | 352px
 *   ≥900    216px | 288px | 1fr           right column → drawer
 *   ≥640     56px | 1fr                   column 2 → sheet, nav → icon rail
 *   <640     1fr + bottom tab bar         header, chart, ledger stacked
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={[
          "grid h-dvh w-full overflow-hidden bg-surface-base p-3",
          "gap-[var(--gap-shell)]",
          "grid-cols-1 grid-rows-[minmax(0,1fr)_auto]",
          "compact:grid-cols-[56px_minmax(0,1fr)] compact:grid-rows-[minmax(0,1fr)]",
          "mid:grid-cols-[216px_288px_minmax(0,1fr)]",
          "full:grid-cols-[216px_288px_minmax(0,1fr)_352px]",
        ].join(" ")}
      >
        <NavRail />

        {/* Column 2 — Activity / Watchlist / Automation, split 1fr / 1.2fr / 0.8fr */}
        <div className="hidden min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-[var(--gap-shell)] mid:grid">
          <ActivityPanel />
          <WatchlistPanel />
          <AutomationPanel />
        </div>

        {/* Column 3 — market header, chart, ledger */}
        <main className="flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]">
          {children}
        </main>

        {/* Column 4 — chat and signals, one at a time behind a tab */}
        <div className="hidden min-h-0 min-w-0 full:flex full:flex-col">
          <AssistPanel />
        </div>

        <MobileTabBar />

        <RightDrawer />
        <LeftSheet />
        <NavSheet />
        <MobilePanelSheet />
        <TerminalRuntime />
      </div>
    </TooltipProvider>
  );
}
