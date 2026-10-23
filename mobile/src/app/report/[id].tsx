import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import type { ReportBlock, ReportMetric } from "@/lib/research/report";
import type { FullReport } from "@/lib/research/reportTypes";
import { DetailScreen } from "~/components/portfolio/parts";
import { AskButton, Card, Loading, PdfButtons, Problem, Timestamp, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { api } from "~/lib/api";
import { reportPdf } from "~/lib/pdf";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One research report — its sections, figures and sources, in the order the
   document gives them (the same object the PDF is rendered from).

   A figure carries its change and whether it is non-GAAP; a stated absence
   ("omission") is shown, never dropped. A table becomes one card per row —
   "Column: value" — because a filing's table is wider than a phone. Each
   source opens on sec.gov in the browser.
--------------------------------------------------------------------------- */

function Metric({ metric }: { metric: ReportMetric }) {
  return (
    <View style={styles.metric}>
      <Text variant="label" tone="muted">
        {metric.label}
        {metric.nonGaap ? " · non-GAAP" : ""}
      </Text>
      <Text variant="data">
        {metric.value}
        {metric.change ? (
          <Text variant="data-sm" tone={metric.changeDirection === "up" ? "positive" : metric.changeDirection === "down" ? "negative" : "secondary"}>
            {"  "}
            {metric.change}
          </Text>
        ) : null}
      </Text>
      {metric.note ? (
        <Text variant="label" tone="muted">
          {metric.note}
        </Text>
      ) : null}
    </View>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <Text variant="body-sm">{block.text}</Text>;
    case "omission":
      return (
        <Text variant="body-sm" tone="muted">
          {block.text}
        </Text>
      );
    case "bullets":
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.bullet}>
              <Text variant="body-sm" tone="muted">
                •
              </Text>
              <Text variant="body-sm" style={shared.flex}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "metrics":
      return (
        <View style={styles.metrics}>
          {block.metrics.map((metric, index) => (
            <Metric key={`${metric.label}-${index}`} metric={metric} />
          ))}
        </View>
      );
    case "table":
      return (
        <View style={styles.table}>
          {block.table.caption ? (
            <Text variant="label" tone="secondary">
              {block.table.caption}
            </Text>
          ) : null}
          {block.table.rows.map((row, index) => (
            <View key={index} style={[styles.tableRow, index > 0 && styles.rule]}>
              {row.map((cell, column) => (
                <View key={column} style={styles.cell}>
                  <Text variant="label" tone="muted" style={shared.flex}>
                    {block.table.columns[column] ?? ""}
                  </Text>
                  <Text variant={column === 0 ? "body-sm" : "data-sm"} style={styles.value}>
                    {cell}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const report = useResearch<FullReport>(`/api/research/reports/${encodeURIComponent(id ?? "")}`);
  const data = report.data;
  const title = data ? `${data.subjectName ?? data.query}${data.periodLabel ? ` · ${data.periodLabel}` : ""}` : "Report";

  return (
    <DetailScreen title={data?.subjectTicker ?? "Report"} onRefresh={report.reload} refreshing={report.refreshing}>
      {report.loading && <Loading>Opening report…</Loading>}
      {report.error !== null && <Problem retry={report.reload}>{report.error}</Problem>}
      {data !== null && (
        <View style={styles.document}>
          <View style={styles.head}>
            <Text variant="h1">{data.subjectName ?? data.query}</Text>
            {data.periodLabel ? (
              <Text variant="body-sm" tone="secondary">
                {data.periodLabel} · {data.kind}
              </Text>
            ) : null}
            <Timestamp at={data.createdAt} label="Created" />
            {data.quality === "verified_with_warnings" && (
              <Text variant="label" tone="caution">
                Verified with warnings — some figures could not be checked against a second source.
              </Text>
            )}
            {data.quality === "incomplete" && (
              <Text variant="label" tone="caution">
                Incomplete — some sections could not be built from the filings.
              </Text>
            )}
          </View>
          {data.hasPdf ? (
            <PdfButtons
              title={title}
              load={async () => {
                const { url } = await api.get<{ url: string }>(`/api/research/reports/${encodeURIComponent(data.id)}/download?as=json`);
                return reportPdf(url, title);
              }}
            />
          ) : (
            <Text variant="label" tone="muted">
              No PDF was stored for this report, so there is nothing to download.
            </Text>
          )}
          <AskButton
            label={`Ask Elyra about ${data.subjectTicker ?? "this report"}`}
            prompt={`I have a research report on ${title}. What are the most important things in its latest filings, and what should I watch next?`}
          />

          {data.document === null ? (
            <Problem retry={report.reload}>{data.error ?? data.statusDetail ?? "The report document is not available yet."}</Problem>
          ) : (
            <>
              {data.document.sections.map((section) => (
                <Card key={section.id}>
                  <Text variant="h2" accessibilityRole="header">
                    {section.title}
                  </Text>
                  {section.blocks.map((block, index) => (
                    <Block key={index} block={block} />
                  ))}
                </Card>
              ))}
              <Card>
                <Text variant="h2" accessibilityRole="header">
                  Sources
                </Text>
                {data.document.sources.map((source) => (
                  <View key={source.id} style={styles.source}>
                    <Text variant="data-sm" tone="muted">
                      {source.id}
                    </Text>
                    <View style={shared.flex}>
                      <Text variant="body-sm">{source.label}</Text>
                      <Timestamp at={source.asOf} />
                    </View>
                    {source.url !== null && (
                      <Button
                        label="Open"
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={`Open ${source.label} in the browser`}
                        icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
                        onPress={() => openExternal(source.url as string)}
                      />
                    )}
                  </View>
                ))}
              </Card>
            </>
          )}
          <Text variant="label" tone="muted">
            Built from SEC filings as filed, and figures as tagged in XBRL. Not advice.
          </Text>
        </View>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  document: { gap: 12 },
  head: { gap: 4 },
  list: { gap: 4 },
  bullet: { flexDirection: "row", gap: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", rowGap: 10, columnGap: 16 },
  metric: { minWidth: "44%", flexGrow: 1, gap: 2 },
  table: { gap: 4, borderRadius: radius.control, borderWidth: 1, borderColor: color["border-subtle"], padding: 10 },
  tableRow: { gap: 2, paddingVertical: 6 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  cell: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  value: { flexShrink: 1, textAlign: "right" },
  source: { flexDirection: "row", alignItems: "center", gap: 8 },
});
