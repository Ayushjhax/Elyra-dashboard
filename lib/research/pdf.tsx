import "server-only";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  ReportBlock,
  ReportMetric,
  ResearchReportDocument,
} from "@/lib/research/report";

/* ---------------------------------------------------------------------------
   The PDF.

   ── Why react-pdf and not headless Chromium ────────────────────────────

   Chromium gives better typography and real CSS, and costs a ~50MB binary,
   a cold start measured in seconds, and a class of deployment failure that
   only appears in production. react-pdf is pure JavaScript: it runs in the
   same serverless function as everything else, and a rendering bug is a
   TypeScript error rather than a missing shared library.

   The tradeoff is that layout is explicit. Every table column width is
   declared below, because the renderer will not reflow them for us.

   ── Dark cover, light body ─────────────────────────────────────────────

   The cover carries Elyra's near-black surface; the body pages do not. A
   thirty-page financial report printed in reverse is unreadable on paper and
   burns a cartridge, and these are documents people print. Deep Forest
   headings on Ivory for the body, Clay reserved for genuine negatives.

   ── Fonts ──────────────────────────────────────────────────────────────

   The built-in Helvetica family is used rather than registering Fustat.
   Embedding a licensed font into a distributable file is a licensing
   decision, not a styling one, and it is not mine to make. Helvetica renders
   identically everywhere and keeps text selectable.
--------------------------------------------------------------------------- */

const COLOR = {
  /* Elyra palette, from docs/ELYRA_BRAND.md. */
  forestDeep: "#1B3118",
  forest: "#2E5129",
  moss: "#45703D",
  sage: "#7A9E70",
  mist: "#C3D6BC",
  lime: "#D2DC76",
  limeDeep: "#7C8535",
  ivory: "#F7F8EA",
  ash: "#B8BAA8",
  slate: "#5C5F52",
  ink: "#15170F",
  clay: "#C4633A",
} as const;

const styles = StyleSheet.create({
  cover: {
    backgroundColor: COLOR.ink,
    color: COLOR.ivory,
    padding: 56,
    height: "100%",
  },
  coverEyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    color: COLOR.lime,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  coverTitle: { fontSize: 30, lineHeight: 1.25, marginBottom: 14 },
  coverMeta: { fontSize: 10, color: COLOR.ash, marginTop: 4 },
  coverRule: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR.forest,
    marginVertical: 26,
  },
  coverFooter: {
    position: "absolute",
    bottom: 48,
    left: 56,
    right: 56,
    fontSize: 8,
    color: COLOR.slate,
  },

  page: {
    backgroundColor: COLOR.ivory,
    color: COLOR.ink,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontSize: 10,
  },
  sectionTitle: {
    fontSize: 15,
    color: COLOR.forestDeep,
    marginBottom: 10,
    marginTop: 4,
  },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, color: COLOR.ink },
  bullet: { fontSize: 10, lineHeight: 1.5, marginBottom: 4, paddingLeft: 10 },

  /* A stated absence. Visibly different from prose so it cannot be skimmed
     past as narrative. */
  omission: {
    fontSize: 9,
    color: COLOR.slate,
    backgroundColor: "#EDEFDD",
    borderLeftWidth: 2,
    borderLeftColor: COLOR.sage,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 8,
    lineHeight: 1.45,
  },

  metricRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.mist,
    paddingVertical: 6,
  },
  metricLabel: { width: "44%", fontSize: 10, color: COLOR.slate },
  metricValue: { width: "28%", fontSize: 11, color: COLOR.forestDeep },
  metricChange: { width: "18%", fontSize: 10 },
  metricRef: { width: "10%", fontSize: 7, color: COLOR.ash, textAlign: "right" },
  metricNote: { fontSize: 8, color: COLOR.slate, marginTop: 2, marginBottom: 4 },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLOR.mist,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderCell: { fontSize: 9, color: COLOR.forestDeep },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.mist,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableCell: { fontSize: 9 },

  sourceRow: { marginBottom: 7 },
  sourceLabel: { fontSize: 9, color: COLOR.ink },
  sourceMeta: { fontSize: 8, color: COLOR.slate, marginTop: 1 },
  sourceLink: { fontSize: 7, color: COLOR.moss, marginTop: 1 },

  checkRow: { flexDirection: "row", marginBottom: 5 },
  checkMark: { width: 16, fontSize: 9 },
  checkBody: { flex: 1 },
  checkLabel: { fontSize: 9, color: COLOR.ink },
  checkDetail: { fontSize: 8, color: COLOR.slate, marginTop: 1, lineHeight: 1.4 },

  pageNumber: {
    position: "absolute",
    bottom: 26,
    left: 52,
    right: 52,
    fontSize: 8,
    color: COLOR.ash,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

/** Change colour. Clay only for a genuine negative — never for emphasis. */
function changeColor(direction: ReportMetric["changeDirection"]): string {
  if (direction === "up") return COLOR.limeDeep;
  if (direction === "down") return COLOR.clay;
  return COLOR.slate;
}

function MetricRows({
  metrics,
  sourceIndex,
}: {
  metrics: ReportMetric[];
  sourceIndex: Map<string, number>;
}) {
  return (
    <View>
      {metrics.map((metric, index) => (
        /* `wrap={false}` keeps a row and its note on one page. A metric split
           across a page break puts a number above its caveat. */
        <View key={`${metric.label}-${index}`} wrap={false}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text
              style={{
                ...styles.metricChange,
                color: changeColor(metric.changeDirection ?? null),
              }}
            >
              {metric.change ?? ""}
            </Text>
            {/* Marker, not a URL. A giant SEC link inside a table destroys
                the column widths and is unreadable anyway. */}
            <Text style={styles.metricRef}>
              {metric.sources
                .map((id) => sourceIndex.get(id))
                .filter((n): n is number => n !== undefined)
                .map((n) => `S${n}`)
                .join(" ")}
            </Text>
          </View>
          {metric.note === null || metric.note === undefined ? null : (
            <Text style={styles.metricNote}>{metric.note}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Block({
  block,
  sourceIndex,
}: {
  block: ReportBlock;
  sourceIndex: Map<string, number>;
}) {
  if (block.kind === "paragraph") {
    return <Text style={styles.paragraph}>{block.text}</Text>;
  }
  if (block.kind === "omission") {
    return <Text style={styles.omission}>{block.text}</Text>;
  }
  if (block.kind === "bullets") {
    return (
      <View>
        {block.items.map((item, index) => (
          <Text key={index} style={styles.bullet}>
            •  {item}
          </Text>
        ))}
      </View>
    );
  }
  if (block.kind === "metrics") {
    return <MetricRows metrics={block.metrics} sourceIndex={sourceIndex} />;
  }

  const width = `${100 / Math.max(1, block.table.columns.length)}%`;
  return (
    <View>
      {block.table.caption === null ? null : (
        <Text style={styles.paragraph}>{block.table.caption}</Text>
      )}
      {/* The header repeats on every page the table spans. */}
      <View style={styles.tableHeader} fixed>
        {block.table.columns.map((column) => (
          <Text key={column} style={{ ...styles.tableHeaderCell, width }}>
            {column}
          </Text>
        ))}
      </View>
      {block.table.rows.map((row, index) => (
        <View key={index} style={styles.tableRow} wrap={false}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={{ ...styles.tableCell, width }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const QUALITY_LABEL = {
  verified: "Verified",
  verified_with_warnings: "Verified with warnings",
  incomplete: "Incomplete",
} as const;

function ReportPdf({ document }: { document: ResearchReportDocument }) {
  /* Sources are numbered once, here, so S1 means the same thing in every
     table and in the appendix. */
  const sourceIndex = new Map(
    document.sources.map((source, index) => [source.id, index + 1]),
  );

  return (
    <Document
      title={document.title}
      author="Elyra"
      subject={`${document.subject.name} research report`}
      creator="Elyra Research"
    >
      <Page size="A4" style={styles.cover}>
        <Text style={styles.coverEyebrow}>Elyra Research</Text>
        <Text style={styles.coverTitle}>{document.title}</Text>
        <View style={styles.coverRule} />
        {document.subject.ticker === null ? null : (
          <Text style={styles.coverMeta}>Ticker · {document.subject.ticker}</Text>
        )}
        {document.subject.cik === null ? null : (
          <Text style={styles.coverMeta}>SEC CIK · {document.subject.cik}</Text>
        )}
        {document.period === null ? null : (
          <Text style={styles.coverMeta}>
            Period · {document.period.label} (ended {document.period.end})
          </Text>
        )}
        <Text style={styles.coverMeta}>
          Quality · {QUALITY_LABEL[document.quality.level]}
        </Text>
        <Text style={styles.coverMeta}>
          Generated · {document.generatedAt.slice(0, 10)}
        </Text>
        <Text style={styles.coverFooter}>
          Compiled from SEC EDGAR filings and XBRL company facts. Figures are
          reported values with their sources listed in the appendix. This
          document is research, not investment advice.
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        {document.sections.map((section) => (
          <View key={section.id} style={{ marginBottom: 18 }}>
            {/* The title stays with at least the start of its content. */}
            <Text style={styles.sectionTitle} minPresenceAhead={40}>
              {section.title}
            </Text>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} sourceIndex={sourceIndex} />
            ))}
          </View>
        ))}

        <View break>
          <Text style={styles.sectionTitle}>Quality checks</Text>
          {document.quality.checks.map((check) => (
            <View key={check.id} style={styles.checkRow} wrap={false}>
              <Text
                style={{
                  ...styles.checkMark,
                  color: check.passed ? COLOR.limeDeep : COLOR.clay,
                }}
              >
                {check.passed ? "PASS" : "WARN"}
              </Text>
              <View style={styles.checkBody}>
                <Text style={styles.checkLabel}>{check.label}</Text>
                {check.detail === null ? null : (
                  <Text style={styles.checkDetail}>{check.detail}</Text>
                )}
              </View>
            </View>
          ))}

          {document.quality.omissions.length === 0 ? null : (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.sectionTitle}>Omitted</Text>
              {document.quality.omissions.map((omission, index) => (
                <Text key={index} style={styles.omission}>
                  {omission}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View break>
          <Text style={styles.sectionTitle}>Source appendix</Text>
          {document.sources.map((source, index) => (
            <View key={source.id} style={styles.sourceRow} wrap={false}>
              <Text style={styles.sourceLabel}>
                S{index + 1} · {source.label}
              </Text>
              <Text style={styles.sourceMeta}>
                {[
                  source.kind === "sec_xbrl" ? "SEC XBRL" : "SEC filing",
                  source.accession === null || source.accession === undefined
                    ? null
                    : `Accession ${source.accession}`,
                  source.asOf === null ? null : `Filed ${source.asOf}`,
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </Text>
              {source.url === null ? null : (
                <Link src={source.url} style={styles.sourceLink}>
                  {source.url}
                </Link>
              )}
            </View>
          ))}
        </View>

        <View style={styles.pageNumber} fixed>
          <Text>{document.subject.name}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export interface PdfResult {
  buffer: Buffer;
  bytes: number;
}

/**
 * Renders the document and checks the result is a real PDF.
 *
 * The size floor catches the failure mode that matters: a renderer that
 * silently produces a valid but empty document. A file that exists and opens
 * is not the same as a report.
 */
export async function renderReportPdf(
  document: ResearchReportDocument,
): Promise<PdfResult> {
  const buffer = await renderToBuffer(<ReportPdf document={document} />);

  if (buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("The renderer did not produce a PDF.");
  }
  if (buffer.length < 2_000) {
    throw new Error(`The rendered PDF is only ${buffer.length} bytes — it is empty.`);
  }

  return { buffer, bytes: buffer.length };
}
