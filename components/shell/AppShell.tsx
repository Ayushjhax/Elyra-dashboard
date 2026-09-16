"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistPanel } from "@/components/panels/AssistPanel";
import { ComponentPalette } from "@/components/shell/ComponentPalette";
import { MarketColumn } from "@/components/shell/MarketColumn";
import {
  LeftSheet,
  MobilePanelSheet,
  MobileTabBar,
  NavSheet,
  RightDrawer,
} from "@/components/shell/CollapsedSurfaces";
import { NavRail } from "@/components/shell/NavRail";
import { PanelStack } from "@/components/shell/PanelStack";
import { StatusBar } from "@/components/shell/StatusBar";
import { WalletSheet } from "@/components/wallet/WalletSheet";
import { ColumnResizer } from "@/components/shell/Resizer";
import { TerminalRuntime } from "@/components/shell/TerminalRuntime";
import { ShellAtmosphere } from "@/components/ui/Glow";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isFullBleedRoute, shellLayout, type ShellColumnId } from "@/lib/layout";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The terminal shell: one fixed-height screen, 12px gap, 12px outer padding on
 * --surface-base. Nothing here scrolls — every panel handles its own overflow.
 *
 * The grid paints no background of its own. --surface-base comes from body, so
 * ShellAtmosphere can sit on a negative layer between the two and light the gaps
 * between panels without a stacking context standing in the way.
 *
 *   ≥1280   nav | palette | panels | section | chart | assistant
 *   ≥900    nav | palette | panels | section | chart      assistant → drawer
 *   ≥640     56 | chart                        panels → sheet, nav → icons
 *   <640    chart + bottom tab bar             header, chart, ledger stacked
 *
 * The chart is not a route. It is mounted here for the life of the session, and
 * every route other than Home renders in a column beside it — so navigating to
 * Portfolio no longer takes the market off screen, and the TradingView widget
 * is not torn down and rebuilt on every trip out and back. Below 900px there is
 * no room for both, and the route takes the middle column instead.
 *
 * Every one of those side columns is the operator's to size and to close. The
 * widths are not written here: `shellLayout` turns the stored widths and the
 * measured viewport into one `grid-template-columns` per breakpoint, published
 * as custom properties that `.shell-grid` in globals.css picks between. The
 * media queries stay the single authority on which columns are on screen, so
 * the tracks and the items can never disagree.
 *
 * The rule the fitter enforces is that the chart is never the column that
 * pays. Opening the palette, or dragging a neighbour wider, takes width from
 * the other side columns in a fixed order and stops at MAIN_MIN — the chart is
 * always open, whatever else is.
 *
 * One exception, by name: a route in FULL_BLEED_ROUTES takes the middle track
 * for itself and the chart, palette, panel column and assistant all stand
 * down. Assets is the only one. It is an allowlist rather than a per-route
 * opt-in so that the invariant above stays the default and each departure from
 * it is a deliberate, visible decision — see the note in lib/layout.ts.
 *
 * `children` is the current route's panel, and is empty on Home.
 */

/**
 * One resizable column of the grid.
 *
 * The wrapper is the grid item, so the panel inside keeps its own
 * `overflow-hidden` and the handle can hang outside it into the gap.
 */
function ShellColumn({
  id,
  side = "end",
  resizable = true,
  className,
  children,
}: {
  id: ShellColumnId;
  side?: "start" | "end";
  /** False for a column pinned to one width, which has nothing to drag. */
  resizable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-shell-column={id}
      className={cn("relative min-h-0 min-w-0 flex-col", className)}
    >
      {children}
      {resizable && <ColumnResizer id={id} side={side} />}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const paletteOpen = useElyraStore((state) => state.paletteOpen);
  const stackOpen = useElyraStore((state) => state.stackOpen);
  const assistOpen = useElyraStore((state) => state.assistOpen);
  const columnWidths = useElyraStore((state) => state.columnWidths);
  const railCollapsed = useElyraStore((state) => state.railCollapsed);
  const resizing = useElyraStore((state) => state.resizing);
  const pathname = usePathname();
  const onRoute = pathname !== "/";

  /* A route that takes the whole main column — see FULL_BLEED_ROUTES. The
     chart, the composed panel column, the palette and the assistant all
     stand down for it, which is what turns Assets from a 360px strip beside
     a candlestick chart into the treasury console it is meant to be.

     Only the RENDERING is suppressed. `paletteOpen`, `stackOpen` and
     `assistOpen` are left exactly as the operator set them, so navigating
     away restores the workspace they had rather than one this route decided
     for them. */
  const fullBleed = isFullBleedRoute(pathname);

  /* Null until the first measurement — on the server and for the first paint,
     where the stored widths stand on their own and nothing has to be fitted.
     window.innerWidth rather than an observed element, because that is exactly
     what the media queries below are answering to. */
  const [viewport, setViewport] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => setViewport(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* Where the route's panel goes. Beside the chart wherever there is room for
     both, and in the middle column below 900px, where there is not.

     Resolved in JS rather than by a media query because the panel must be
     mounted in exactly one place — rendering it twice and hiding one would run
     its effects and its fetches twice over. Before the first measurement this
     assumes the wide layout, which is what the server renders and what the
     first client render therefore has to agree with. */
  const routeAside =
    onRoute && !fullBleed && (viewport === null || viewport >= 900);

  /* The tracks have to agree with what is rendered, so the fitter is told
     these columns are closed rather than being left to reserve width for
     panels this route does not mount. */
  const layout = shellLayout({
    viewport,
    widths: columnWidths,
    paletteOpen: paletteOpen && !fullBleed,
    stackOpen: stackOpen && !fullBleed,
    assistOpen: assistOpen && !fullBleed,
    routeOpen: routeAside,
    railCollapsed,
  });

  return (
    <TooltipProvider delayDuration={300}>
      {/* The status bar is a row above the grid rather than a track inside it.
          The grid's tracks are decided by media queries in `.shell-grid` — see
          the note in CLAUDE.md about the tracks and the items having exactly
          one authority — so adding a row would mean editing three breakpoints
          to add something that never varies with them. A flex column outside
          leaves `.shell-grid` untouched and the bar the same height at every
          width. The outer element owns the page padding and the gap; the grid
          keeps everything else it had. */}
      <div className="flex h-dvh w-full flex-col gap-[var(--gap-shell)] overflow-hidden p-3">
        <StatusBar />

        <div
          data-resizing={resizing ? "true" : undefined}
          className="shell-grid grid min-h-0 w-full flex-1 gap-[var(--gap-shell)] overflow-hidden"
          style={
            {
              "--cols-compact": layout.compact,
              "--cols-mid": layout.mid,
              "--cols-full": layout.full,
            } as React.CSSProperties
          }
        >
          <ShellAtmosphere />

          {/* No handle while it is collapsed: the rail is pinned to its icon
              width there, so a drag would have nothing to move. The control in
              the rail is the way back. */}
          <ShellColumn id="rail" className="hidden compact:flex" resizable={!railCollapsed}>
            <NavRail icons={layout.railIcons} />
          </ShellColumn>

          {paletteOpen && !fullBleed && (
            <ShellColumn id="palette" className="hidden mid:flex">
              <ComponentPalette />
            </ShellColumn>
          )}

          {/* Column 2 — whatever the operator has composed. */}
          {stackOpen && !fullBleed && (
            <ShellColumn id="stack" className="hidden mid:flex">
              <PanelStack className="flex min-h-0 flex-1" />
            </ShellColumn>
          )}

          {/* The route you are on, beside the chart rather than instead of it.
              Its own column, resizable like every other, and closed from the X
              in its header — see RouteClose. */}
          {routeAside && (
            <ShellColumn
              id="route"
              className="hidden min-h-0 flex-col mid:flex column-enter"
            >
              <div className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">
                {children}
              </div>
            </ShellColumn>
          )}

          {/* Column 3 — market header, chart, ledger. The one column with no
              handle of its own: it is what every other handle moves against, and
              the one thing that is always on screen. */}
          <main className="flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]">
            {routeAside || !onRoute ? <MarketColumn /> : children}
          </main>

          {/* Column 4 — chat and signals, one at a time behind a tab. Its handle
              is on its left edge, being the one column right of the chart. */}
          {assistOpen && !fullBleed && (
            <ShellColumn id="assist" side="start" className="hidden full:flex">
              <AssistPanel />
            </ShellColumn>
          )}

          <MobileTabBar />

          <RightDrawer />
          <LeftSheet />
          <NavSheet />
          <MobilePanelSheet />
          {/* Opened from the balance chip in the status bar. Mounted here
              rather than inside StatusBar so it is a sibling of the grid and
              is not clipped by the bar's own overflow. */}
          <WalletSheet />
          <TerminalRuntime />
        </div>
      </div>
    </TooltipProvider>
  );
}
