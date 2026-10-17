"use client";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Applied to the header cell, so widths never shift as values tick. */
  width?: string;
  headerSrOnly?: boolean;
  /**
   * Applied to this column's header cell and every body cell in it.
   *
   * Exists for responsive column priority: a container query class such as
   * `hidden @[34rem]:table-cell` drops a lower-priority column when the panel
   * is narrow, rather than letting every column squeeze until none of them
   * are readable. Purely additive — a column without one is unaffected.
   */
  className?: string;
  render: (row: T) => React.ReactNode;
}

/**
 * A real <table> with a sticky header row. Rows are --row-h tall, divided by
 * hairlines, and hover to --surface-hover. Every numeric cell inherits
 * tabular figures from the base stylesheet, so a tick never moves a column.
 *
 * With `card`, a container too narrow for the table gets a list of cards
 * instead: a table of eight columns three hundred pixels wide shows two of
 * them and hides the rest behind a sideways scroll, where the figure that
 * matters (a PnL, an action) is always last. "Too narrow" is the table's own
 * `minWidth`, never less than 40rem — a phone always gets cards — so a
 * tablet-wide panel does not land in the gap between the two and scroll.
 * Both are rendered and a container query shows one, so the choice is CSS's,
 * like every other layout decision here, and the hidden one is out of the
 * accessibility tree.
 */
/* Where the table takes over from the cards, by the smallest width that holds
   it. Spelled out in full so Tailwind generates each container query. */
const CARD_BREAKPOINTS: readonly { px: number; table: string; cards: string }[] = [
  { px: 640, table: "hidden @[40rem]:block", cards: "@[40rem]:hidden" },
  { px: 672, table: "hidden @[42rem]:block", cards: "@[42rem]:hidden" },
  { px: 704, table: "hidden @[44rem]:block", cards: "@[44rem]:hidden" },
  { px: 768, table: "hidden @[48rem]:block", cards: "@[48rem]:hidden" },
  { px: 832, table: "hidden @[52rem]:block", cards: "@[52rem]:hidden" },
  { px: 896, table: "hidden @[56rem]:block", cards: "@[56rem]:hidden" },
  { px: 1024, table: "hidden @[64rem]:block", cards: "@[64rem]:hidden" },
];

function cardBreakpoint(minWidth: number | undefined) {
  const needed = minWidth ?? 0;
  return CARD_BREAKPOINTS.find((breakpoint) => breakpoint.px >= needed) ?? CARD_BREAKPOINTS[CARD_BREAKPOINTS.length - 1];
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  minWidth,
  rowClassName,
  card,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Extra classes per row — used to mark rows on the selected market. */
  rowClassName?: (row: T) => string | undefined;
  /** Screen-reader description of what the table holds. */
  caption: string;
  /** Sum of the widths of the columns always shown — those without a
      container-query `className` — so the table scrolls rather than squeezing. */
  minWidth?: number;
  /** The row laid out for a narrow container. */
  card?: (row: T) => React.ReactNode;
  className?: string;
}) {
  const table = (
    <table
      className={cn("w-full border-collapse text-left", className)}
      style={{ tableLayout: "fixed", minWidth }}
    >
      <caption className="sr-only">{caption}</caption>
      {/* Widths live on the header cells, not a <colgroup>: fixed layout
          reads the first row either way, and a column dropped by its
          container query then takes its width with it. A <col> stays
          behind, and every width after it lands one column off. */}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={column.width ? { width: column.width } : undefined}
              className={cn(
                "type-label sticky top-0 z-10 h-8 whitespace-nowrap bg-surface-panel px-2",
                "border-b border-border-subtle font-medium text-text-secondary",
                column.align === "right" ? "text-right" : "text-left",
                column.className,
              )}
            >
              <span className={cn(column.headerSrOnly && "sr-only")}>
                {column.header}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={getRowKey(row)}
            className={cn(
              "group border-b border-border-subtle last:border-b-0",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
              rowClassName?.(row),
            )}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                className={cn(
                  "type-data h-[var(--row-h)] truncate px-2 text-text-primary",
                  column.align === "right" ? "text-right" : "text-left",
                  column.className,
                )}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (card === undefined) return table;

  const breakpoint = cardBreakpoint(minWidth);
  return (
    <div className="@container">
      <div className={breakpoint.table}>{table}</div>
      <ul aria-label={caption} className={cn("list-none", breakpoint.cards)}>
        {rows.map((row) => (
          <li
            key={getRowKey(row)}
            className={cn("border-b border-border-subtle px-4 py-3 last:border-b-0", rowClassName?.(row))}
          >
            {card(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}
