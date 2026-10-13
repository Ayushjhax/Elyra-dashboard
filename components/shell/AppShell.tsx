"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/shell/AppHeader";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { AgentDrawer, NavSheet } from "@/components/shell/Drawers";
import { NavRail } from "@/components/shell/NavRail";
import { TerminalRuntime } from "@/components/shell/TerminalRuntime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletSheet } from "@/components/wallet/WalletSheet";
import { Workspace } from "@/components/workspace/Workspace";
import { isFullBleedRoute, isStandaloneRoute, shellLayout } from "@/lib/layout";
import { useElyraStore } from "@/lib/store";

/**
 * The terminal shell.
 *
 *   ≥1280   rail | header                                   (fixed)
 *                | heading · overview                      (scrolls)
 *                | widgets-or-route | centre | agent        (agent sticks)
 *   ≥900    rail | …                 widgets-or-route | centre   agent → drawer
 *   ≥640    icon rail | centre, then widgets, stacked       agent → drawer
 *   <640    header with menu | centre, then widgets         agent → drawer
 *
 * The chart is not a route. The workspace that holds it is mounted here for
 * the life of the session, so the TradingView widget is never torn down by a
 * navigation. A route opens beside the chart, in the widgets' place, from
 * 900px; a full-bleed route — and any route below 900px, where there is no
 * room for both — takes the workspace body, and the workspace is hidden
 * rather than unmounted underneath it.
 *
 * None of the widths are written here. `shellLayout` turns the stored widths,
 * the open columns and the measured viewport into one track string per
 * breakpoint, published as custom properties; the media queries in
 * app/globals.css pick between them. The rule the fitter enforces is that the
 * centre is never the column that pays.
 *
 * `children` is the current route's panel, and is empty on Home.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const columnWidths = useElyraStore((state) => state.columnWidths);
  const railExpanded = useElyraStore((state) => state.railExpanded);
  const widgetsOpen = useElyraStore((state) => state.widgetsOpen);
  const agentOpen = useElyraStore((state) => state.agentOpen);
  const focusMode = useElyraStore((state) => state.focusMode);
  const resizing = useElyraStore((state) => state.resizing);

  const onRoute = pathname !== "/";
  const fullBleed = isFullBleedRoute(pathname);
  const standalone = isStandaloneRoute(pathname);

  /* Null until the first measurement — on the server and for the first paint,
     where the stored widths stand on their own and nothing has to be fitted.
     window.innerWidth rather than an observed element, because that is exactly
     what the media queries are answering to. */
  const [viewport, setViewport] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => setViewport(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* Where the route's panel goes. Resolved in JS rather than by a media query
     because the panel must be mounted in exactly one place — rendering it
     twice and hiding one would run its effects and its fetches twice. Before
     the first measurement this assumes the wide layout, which is what the
     server renders and what the first client render has to agree with. */
  const routeBeside =
    onRoute && !fullBleed && (viewport === null || viewport >= 900);
  const routeTakesBody = onRoute && !routeBeside;

  const layout = shellLayout({
    viewport,
    widths: columnWidths,
    railExpanded,
    widgetsOpen,
    agentOpen,
    routeOpen: routeBeside,
    focus: focusMode && !onRoute,
  });

  if (standalone) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-resizing={resizing ? "true" : undefined}
        className="shell-frame grid h-dvh w-full overflow-hidden"
        style={
          {
            "--frame-compact": layout.frame.compact,
            "--frame-mid": layout.frame.mid,
            "--frame-full": layout.frame.full,
          } as React.CSSProperties
        }
      >
        <NavRail icons={layout.railIcons} className="hidden compact:flex" />

        <div className="flex min-h-0 min-w-0 flex-col">
          <AppHeader />

          {/* The one scroll container. The document never scrolls, so the
              header stays put and the agent can stick under it. */}
          <div
            data-workspace-scroll
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          >
            <Workspace
              hidden={routeTakesBody}
              layout={layout}
              focus={focusMode && !onRoute}
              route={routeBeside ? children : null}
            />

            {routeTakesBody && (
              <main
                className="flex h-full min-h-[480px] flex-col p-4 compact:p-[var(--pad-workspace)]"
              >
                <div className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">
                  {children}
                </div>
              </main>
            )}
          </div>
        </div>
      </div>

      <AgentDrawer />
      <NavSheet />
      <CommandPalette />
      {/* Opened from the account menu or the rail's profile. */}
      <WalletSheet />
      <TerminalRuntime />
    </TooltipProvider>
  );
}
