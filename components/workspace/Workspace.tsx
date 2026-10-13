"use client";

import { useRef } from "react";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { ChartPanel } from "@/components/panels/ChartPanel";
import { ColumnResizer } from "@/components/shell/Resizer";
import { AutomationSection } from "@/components/workspace/AutomationSection";
import { OverviewStrip } from "@/components/workspace/OverviewStrip";
import { TradingActivity } from "@/components/workspace/TradingActivity";
import { WidgetColumn } from "@/components/workspace/WidgetColumn";
import { COLUMN_BOUNDS, WORKSPACE_GAP, type ShellLayout } from "@/lib/layout";
import { useElyraStore } from "@/lib/store";
import { useStickyFill } from "@/lib/useStickyFill";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The market workspace.

   A page that scrolls under a fixed header: the heading and the portfolio
   overview, then three columns — widgets on the left, the chart with trading
   activity and automation under it in the centre, and the agent on the right.
   The centre takes whatever width is left, and `lib/layout.ts` guarantees it
   is never the column that pays.

   The two panels that hold long, independently scrolling content — the agent
   and an open route — are sticky: they start level with the chart, scroll up
   with the page until they reach the top, and then stay while the centre
   keeps going. Their height is measured so the bottom edge, and the agent's
   composer with it, is always on screen.
--------------------------------------------------------------------------- */

/** A side column that sticks under the header and fills to the viewport's bottom. */
function StickyColumn({
  id,
  side,
  className,
  children,
}: {
  id: "agent" | "route";
  side: "start" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useStickyFill(ref, WORKSPACE_GAP);

  return (
    <div
      ref={ref}
      data-shell-column={id}
      className={cn(
        "sticky top-[var(--gap-workspace)] min-w-0 flex-col self-start",
        className,
      )}
    >
      {children}
      <ColumnResizer id={id} side={side} />
    </div>
  );
}

export function Workspace({
  hidden,
  layout,
  focus,
  route,
}: {
  /** A route has the body. Hidden, not unmounted, so the chart survives. */
  hidden: boolean;
  layout: ShellLayout;
  focus: boolean;
  /** The route that opens beside the chart, or null on Home. */
  route: React.ReactNode;
}) {
  const agentOpen = useElyraStore((state) => state.agentOpen);
  const setAgentOpen = useElyraStore((state) => state.setAgentOpen);
  const agentWidth = useElyraStore((state) => state.columnWidths.agent);
  const setColumnWidth = useElyraStore((state) => state.setColumnWidth);
  const resetColumnWidth = useElyraStore((state) => state.resetColumnWidth);
  /* "Widen" takes the agent to its maximum; "restore" puts it back to the
     default. Either way the fitter still holds the centre above its floor. */
  const agentExpanded = (agentWidth ?? COLUMN_BOUNDS.agent.initial) >= COLUMN_BOUNDS.agent.max - 20;

  return (
    <div
      hidden={hidden}
      className="flex flex-col gap-[var(--gap-workspace)] px-4 py-4 compact:p-[var(--pad-workspace)]"
    >
      <OverviewStrip focus={focus} />

      <div
        className="workspace-grid grid items-start gap-[var(--gap-workspace)]"
        style={
          {
            "--ws-mid": layout.workspace.mid,
            "--ws-full": layout.workspace.full,
          } as React.CSSProperties
        }
      >
        {/* Left: the widgets — or, with a route open, the route in their
            place. Below 900px the widgets stack under the centre (`order`),
            whatever the toggle says, so every module stays reachable. */}
        {route !== null ? (
          <StickyColumn id="route" side="end" className="hidden mid:flex">
            <div className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">{route}</div>
          </StickyColumn>
        ) : (
          !focus && (
            <WidgetColumn
              className={cn("order-2 mid:order-none", layout.left !== "widgets" && "mid:hidden")}
            />
          )
        )}

        <div className="order-1 flex min-w-0 flex-col gap-[var(--gap-workspace)] mid:order-none">
          <ChartPanel focus={focus} />
          {!focus && <TradingActivity />}
          {!focus && <AutomationSection />}
        </div>

        {/* Right: the agent, from 1280px. Below that it is a drawer. */}
        {agentOpen && !focus && (
          <StickyColumn id="agent" side="start" className="hidden full:flex">
            <AgentPanel
              onClose={() => setAgentOpen(false)}
              expanded={agentExpanded}
              onToggleExpand={() =>
                agentExpanded
                  ? resetColumnWidth("agent")
                  : setColumnWidth("agent", COLUMN_BOUNDS.agent.max)
              }
              className="min-h-0 flex-1"
            />
          </StickyColumn>
        )}
      </div>
    </div>
  );
}
