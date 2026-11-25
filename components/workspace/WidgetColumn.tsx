"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { ColumnResizer } from "@/components/shell/Resizer";
import { SectionControl } from "@/components/ui/Section";
import { ActivityWidget } from "@/components/workspace/ActivityWidget";
import { SignalsWidget } from "@/components/workspace/SignalsWidget";
import { WatchlistWidget } from "@/components/workspace/WatchlistWidget";
import { useElyraStore } from "@/lib/store";
import type { WidgetKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   The left column: Watchlist, Live signals and Activity by default, in the
   operator's order.

   Each widget folds on its own and moves up or down with the two controls in
   its header — buttons rather than drag and drop, because a drag is pointer
   only and these have to be reachable from the keyboard. Order and folds
   persist. Every widget bounds its own list and scrolls inside it, so the
   column stays a column rather than becoming the tallest thing on the page.
--------------------------------------------------------------------------- */

export interface WidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The move controls, rendered in the widget's header after its own. */
  controls: React.ReactNode;
}

const TITLES: Record<WidgetKey, string> = {
  activity: msg("Activity"),
  watchlist: msg("Watchlist"),
  signals: msg("Live signals"),
};

const RENDER: Record<WidgetKey, (props: WidgetProps) => React.ReactNode> = {
  activity: (props) => <ActivityWidget {...props} />,
  watchlist: (props) => <WatchlistWidget {...props} />,
  signals: (props) => <SignalsWidget {...props} />,
};

function MoveControls({ widget, index, count }: { widget: WidgetKey; index: number; count: number }) {
  const t = useT();
  const moveWidget = useElyraStore((state) => state.moveWidget);
  const title = t(TITLES[widget]);

  return (
    <>
      <SectionControl
        label={t("Move {title} up", { title })}
        disabled={index === 0}
        onClick={() => moveWidget(widget, -1)}
        className="size-6"
      >
        <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
      </SectionControl>
      <SectionControl
        label={t("Move {title} down", { title })}
        disabled={index === count - 1}
        onClick={() => moveWidget(widget, 1)}
        className="size-6"
      >
        <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
      </SectionControl>
    </>
  );
}

export function WidgetColumn({ className }: { className?: string }) {
  const t = useT();
  const order = useElyraStore((state) => state.widgetOrder);
  const collapsed = useElyraStore((state) => state.collapsedWidgets);
  const toggle = useElyraStore((state) => state.toggleWidgetCollapsed);

  return (
    <aside
      aria-label={t("Widgets")}
      data-shell-column="widgets"
      className={cn("relative flex min-w-0 flex-col gap-[var(--gap-workspace)]", className)}
    >
      {order.map((key, index) => (
        <div key={key} className="min-w-0">
          {RENDER[key]({
            open: !collapsed.includes(key),
            onOpenChange: () => toggle(key),
            controls: <MoveControls widget={key} index={index} count={order.length} />,
          })}
        </div>
      ))}
      <ColumnResizer id="widgets" side="end" />
    </aside>
  );
}
