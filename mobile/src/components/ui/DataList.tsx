import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/components/ui/Text";
import { color, space } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Rows of data that never scroll sideways (CLAUDE.md).

   On a phone — a container under 600dp — each row is a card, laid out by the
   caller (`card`). Wider, it is a table, and columns that do not fit are
   dropped lowest priority first, so the figures that matter (value, P&L, an
   action) stay on screen. The website's DataTable does the same with
   container queries; here the container's own width decides.
--------------------------------------------------------------------------- */

export interface DataColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** The column's width, in dp. */
  width: number;
  /** Lower stays longer. Columns without one are never dropped. */
  priority?: number;
  render: (row: T) => ReactNode;
}

const TABLE_FROM = 600;

/** The columns that fit `width`, dropping the highest priority numbers first. */
export function fittingColumns<T>(columns: readonly DataColumn<T>[], width: number): DataColumn<T>[] {
  const kept = [...columns];
  const total = () => kept.reduce((sum, column) => sum + column.width, 0);
  const droppable = [...columns]
    .filter((column) => column.priority !== undefined)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const column of droppable) {
    if (total() <= width) break;
    kept.splice(kept.indexOf(column), 1);
  }
  return kept;
}

export function DataList<T>({
  rows,
  columns,
  getKey,
  card,
  label,
}: {
  rows: readonly T[];
  columns: readonly DataColumn<T>[];
  getKey: (row: T) => string;
  /** The row as a card, for a phone-width container. */
  card: (row: T) => ReactNode;
  /** What the rows are, for screen readers. */
  label: string;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const asTable = width !== null && width >= TABLE_FROM;
  const shown = asTable ? fittingColumns(columns, width - space["pad-panel"] * 2) : [];

  return (
    <View accessibilityLabel={label} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {asTable ? (
        <>
          <View style={[styles.row, styles.head]}>
            {shown.map((column) => (
              <Text
                key={column.key}
                variant="label"
                tone="secondary"
                style={[{ flexGrow: column.width, flexBasis: 0 }, column.align === "right" && styles.right]}
              >
                {column.header}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={getKey(row)} style={styles.row}>
              {shown.map((column) => (
                <View
                  key={column.key}
                  style={[{ flexGrow: column.width, flexBasis: 0 }, column.align === "right" && styles.rightCell]}
                >
                  {column.render(row)}
                </View>
              ))}
            </View>
          ))}
        </>
      ) : (
        rows.map((row) => (
          <View key={getKey(row)} style={styles.card}>
            {card(row)}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: space["row-h"] + 8,
    paddingHorizontal: space["pad-panel"],
    gap: 8,
    borderBottomColor: color["border-subtle"],
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  head: { minHeight: 32 },
  right: { textAlign: "right" },
  rightCell: { alignItems: "flex-end" },
  card: {
    paddingHorizontal: space["pad-panel"],
    paddingVertical: 12,
    borderBottomColor: color["border-subtle"],
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
});
