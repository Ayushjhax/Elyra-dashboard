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
import { ColumnResizer } from "@/components/shell/Resizer";
import { TerminalRuntime } from "@/components/shell/TerminalRuntime";
import { ShellAtmosphere } from "@/components/ui/Glow";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shellLayout, type ShellColumnId } from "@/lib/layout";
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
  const routeAside = onRoute && (viewport === null || viewport >= 900);

  const layout = shellLayout({
    viewport,
    widths: columnWidths,
    paletteOpen,
    stackOpen,
    assistOpen,
    routeOpen: routeAside,
    railCollapsed,
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-resizing={resizing ? "true" : undefined}
        className="shell-grid grid h-dvh w-full gap-[var(--gap-shell)] overflow-hidden p-3"
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

        {paletteOpen && (
          <ShellColumn id="palette" className="hidden mid:flex">
            <ComponentPalette />
          </ShellColumn>
        )}

        {/* Column 2 — whatever the operator has composed. */}
        {stackOpen && (
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
        {assistOpen && (
          <ShellColumn id="assist" side="start" className="hidden full:flex">
            <AssistPanel />
          </ShellColumn>
        )}

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
