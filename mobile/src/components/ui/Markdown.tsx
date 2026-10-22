import { useMemo } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { Text } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The assistant's Markdown, rendered natively from the same tree the website
   renders (lib/markdown.ts). Every node becomes a component — there is no
   HTML path, so a message cannot carry script or styling. Links are http(s)
   and mailto only (the parser drops the rest) and open in the system
   browser, never inside the app.

   A table becomes one card per row — "Header: value" lines — because a
   table wider than a phone would otherwise scroll sideways.
--------------------------------------------------------------------------- */

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.t) {
          case "text":
            return node.v;
          case "code":
            return (
              <Text key={index} variant="mono-addr" style={styles.code}>
                {node.v}
              </Text>
            );
          case "strong":
            return (
              <Text key={index} variant="body" style={styles.strong}>
                <Inlines nodes={node.c} />
              </Text>
            );
          case "em":
            return (
              <Text key={index} variant="body" style={styles.em}>
                <Inlines nodes={node.c} />
              </Text>
            );
          case "link":
            return (
              <Text
                key={index}
                variant="body"
                accessibilityRole="link"
                onPress={() => void Linking.openURL(node.href)}
                style={styles.link}
              >
                <Inlines nodes={node.c} />
              </Text>
            );
        }
      })}
    </>
  );
}

function plain(nodes: Inline[]): string {
  return nodes.map((node) => (node.t === "text" || node.t === "code" ? node.v : plain(node.c))).join("");
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.t) {
          case "p":
            return (
              <Text key={index} variant="body" tone="secondary">
                <Inlines nodes={block.c} />
              </Text>
            );
          case "h":
            return (
              <Text key={index} variant="h2" accessibilityRole="header">
                <Inlines nodes={block.c} />
              </Text>
            );
          case "ul":
          case "ol":
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={styles.item}>
                    <Text variant="body" tone="muted" style={styles.marker}>
                      {block.t === "ol" ? `${block.start + itemIndex}.` : "•"}
                    </Text>
                    <Text variant="body" tone="secondary" style={styles.itemText}>
                      <Inlines nodes={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "code":
            return (
              <View key={index} style={styles.codeBlock}>
                <Text variant="mono-addr">{block.v}</Text>
              </View>
            );
          case "quote":
            return (
              <View key={index} style={styles.quote}>
                <Blocks blocks={block.c} />
              </View>
            );
          case "table":
            return (
              <View key={index} style={styles.table}>
                {block.rows.map((row, rowIndex) => (
                  <View key={rowIndex} style={[styles.tableRow, rowIndex > 0 && styles.tableRule]}>
                    {row.map((cell, cellIndex) => (
                      <Text key={cellIndex} variant="body-sm" tone="secondary">
                        <Text variant="body-sm" tone="muted">
                          {plain(block.head[cellIndex] ?? [])}:{" "}
                        </Text>
                        <Inlines nodes={cell} />
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          case "hr":
            return <View key={index} style={styles.rule} />;
        }
      })}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.root}>
      <Blocks blocks={blocks} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  strong: { fontFamily: fontFamily("sans", 600), color: color["text-primary"] },
  em: { fontStyle: "italic" },
  link: { color: color["text-primary"], textDecorationLine: "underline" },
  code: { backgroundColor: color["surface-raised"] },
  list: { gap: 4 },
  item: { flexDirection: "row", gap: 8 },
  marker: { minWidth: 16 },
  itemText: { flex: 1 },
  codeBlock: {
    backgroundColor: color["surface-base"],
    borderColor: color["border-subtle"],
    borderWidth: 1,
    borderRadius: radius.control,
    padding: 12,
  },
  quote: { borderLeftColor: color["border-strong"], borderLeftWidth: 2, paddingLeft: 12, gap: 8 },
  table: { borderColor: color["border-subtle"], borderWidth: 1, borderRadius: radius.control, overflow: "hidden" },
  tableRow: { padding: 10, gap: 2 },
  tableRule: { borderTopColor: color["border-subtle"], borderTopWidth: 1 },
  rule: { height: 1, backgroundColor: color["border-subtle"] },
});
