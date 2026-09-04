"use client";

import { RowResizer } from "@/components/shell/Resizer";
import { CHART_GROW, LEDGER_GROW } from "@/lib/layout";
import { useElyraStore } from "@/lib/store";

/**
 * The boundary between the chart and the ledger.
 *
 * It lives in the page rather than in the shell because the middle column's
 * contents come from the route: only Home stacks a chart over a ledger, and
 * only Home has a boundary to move. The two panels read the same weights from
 * the store, so this is the one component that has to know they are a pair.
 *
 * The chart cannot be closed from here, and there is no handle above it: the
 * market header is a fixed height and the chart is the thing every other
 * boundary in the terminal moves against.
 */
export function MainSplit() {
  const rowGrow = useElyraStore((state) => state.rowGrow);

  return (
    <RowResizer
      a={{ id: "chart", grow: rowGrow.chart ?? CHART_GROW, base: CHART_GROW }}
      b={{ id: "ledger", grow: rowGrow.ledger ?? LEDGER_GROW, base: LEDGER_GROW }}
      label="the chart and the ledger"
    />
  );
}
