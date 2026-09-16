"use client";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Applied to the <col> so widths never shift as values tick. */
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
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  minWidth,
  rowClassName,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Extra classes per row — used to mark rows on the selected market. */
  rowClassName?: (row: T) => string | undefined;
  /** Screen-reader description of what the table holds. */
  caption: string;
  /** Sum of the column widths, so the table scrolls rather than squeezing. */
  minWidth?: number;
  className?: string;
}) {
  return (
    <table
      className={cn("w-full border-collapse text-left", className)}
      style={{ tableLayout: "fixed", minWidth }}
    >
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
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
}
