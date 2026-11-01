import type { ReactNode } from "react";
import { ActivityIndicator, Text as NativeText, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, BadgeCheck, ChevronRight, CircleAlert, Database, ExternalLink, FileText, Globe, type LucideIcon } from "lucide-react-native";
import type { ReportBlock, ReportMetric, ResearchSource, SourceKind } from "@/lib/research/report";
import { reportSettled, type QualityLevel, type ReportRecord } from "@/lib/research/reportTypes";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Research reports, drawn — the list's card, the badges, a report's
   sections, its figures and its sources.

   Two states are never merged. GENERATION (queued … complete, failed) says
   whether the document exists; VERIFICATION (verified, with warnings,
   incomplete) says how far its figures were checked. A saved report is not
   thereby verified, and a warning is never hidden or upgraded.

   Every figure is the document's own pre-formatted string, with its change
   as the server wrote it ("+105.9%", "+2.6 pts") — this file does no
   arithmetic. A source opens only where it has a URL.
--------------------------------------------------------------------------- */

export const KIND_LABEL: Record<string, string> = { earnings: "Earnings", "10-Q": "10-Q", "10-K": "10-K", custom: "Research" };

/** "23 Oct 2026, 08:40 UTC", or null for a missing or unreadable time. */
export function utcTime(at: string | null | undefined): string | null {
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return `${new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

type BadgeTone = "positive" | "caution" | "negative" | "neutral";

const BADGE: Record<BadgeTone, { border: string; background: string; ink: string }> = {
  positive: { border: color["border-subtle"], background: color["positive-bg"], ink: color.positive },
  caution: { border: color.caution, background: color["caution-bg"], ink: color.caution },
  negative: { border: color.negative, background: color["negative-bg"], ink: color.negative },
  neutral: { border: color["border-strong"], background: "transparent", ink: color["text-secondary"] },
};

/** A small rounded badge with an icon and its word. */
export function Badge({ tone, icon: Icon, label, busy = false }: { tone: BadgeTone; icon?: LucideIcon; label: string; busy?: boolean }) {
  const look = BADGE[tone];
  return (
    <View style={[styles.badge, { borderColor: look.border, backgroundColor: look.background }]} accessible accessibilityLabel={label}>
      {busy ? <ActivityIndicator size="small" color={look.ink} /> : Icon !== undefined ? <Icon size={18} strokeWidth={1.75} color={look.ink} /> : null}
      {/* Wraps rather than truncates: a cut-off "Verified with wa…" would hide the warning. */}
      <Text variant="body" maxFontSizeMultiplier={1.3} style={[styles.badgeText, { color: look.ink }]}>
        {label}
      </Text>
    </View>
  );
}

const QUALITY: Record<QualityLevel, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  verified: { tone: "positive", icon: BadgeCheck, label: "Verified" },
  verified_with_warnings: { tone: "caution", icon: AlertTriangle, label: "Verified with warnings" },
  incomplete: { tone: "caution", icon: CircleAlert, label: "Incomplete" },
};

/** How far a finished report's figures were checked. Nothing for a report with no verdict. */
export function QualityBadge({ quality }: { quality: QualityLevel | null }) {
  if (quality === null) return null;
  const look = QUALITY[quality];
  return <Badge tone={look.tone} icon={look.icon} label={look.label} />;
}

/** Where a report's generation stands, for one that is not yet saved. */
export function GenerationBadge({ report }: { report: ReportRecord }) {
  if (report.status === "complete") return null;
  if (report.status === "failed") return <Badge tone="negative" icon={CircleAlert} label="Failed" />;
  return <Badge tone="neutral" busy label={report.statusDetail ?? "Generating"} />;
}

/** One report in the list: its subject, period and type, both states, and when. Opens only once saved. */
export function ReportCard({ report, footer }: { report: ReportRecord; footer?: ReactNode }) {
  const complete = report.status === "complete";
  const running = !reportSettled(report.status);
  const name = report.subjectName ?? report.query;
  const meta = [report.periodLabel, KIND_LABEL[report.kind] ?? report.kind].filter((part): part is string => !!part).join(" · ");
  const when = utcTime(complete ? (report.completedAt ?? report.createdAt) : report.createdAt);
  const body = (
    <View style={styles.reportRow}>
      <View style={styles.reportIcon}>
        <FileText size={26} strokeWidth={1.5} color={color["text-secondary"]} />
      </View>
      <View style={styles.reportWords}>
        <NativeText numberOfLines={2} maxFontSizeMultiplier={1.25} style={styles.reportName}>
          {name}
        </NativeText>
        {meta.length > 0 && (
          <Text variant="body" tone="secondary" style={styles.reportMeta}>
            {meta}
          </Text>
        )}
        <View style={styles.badges}>
          <GenerationBadge report={report} />
          {complete && <QualityBadge quality={report.quality} />}
        </View>
        {report.status === "failed" && report.error !== null && (
          <Text variant="body-sm" tone="negative">
            {report.error}
          </Text>
        )}
        {when !== null && (
          <Text variant="body" tone="secondary" style={styles.reportMeta} accessibilityLiveRegion={running ? "polite" : "none"}>
            {complete ? "Saved" : "Started"} · {when}
          </Text>
        )}
      </View>
      {complete && <ChevronRight size={24} strokeWidth={1.5} color={color["text-secondary"]} />}
    </View>
  );
  return (
    <View style={styles.reportCard}>
      {complete ? (
        <Pressable
          onPress={() => router.push({ pathname: "/report/[id]", params: { id: report.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Open the report on ${name}${meta ? `, ${meta}` : ""}${report.quality ? `, ${QUALITY[report.quality].label}` : ""}`}
          android_ripple={{ color: color["surface-hover"] }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {footer !== undefined && <View style={styles.reportFooter}>{footer}</View>}
    </View>
  );
}

/* ---- a report's sections ---- */

function MetricCell({ metric, right, top, wide }: { metric: ReportMetric; right: boolean; top: boolean; wide: boolean }) {
  const tone = metric.changeDirection === "up" ? "positive" : metric.changeDirection === "down" ? "negative" : "secondary";
  return (
    <View
      style={[styles.cell, wide ? styles.cellWide : styles.cellHalf, right && styles.cellRight, !top && styles.cellRuled]}
      accessible
      accessibilityLabel={`${metric.label}${metric.nonGaap ? ", non-GAAP" : ""}: ${metric.value}${metric.change ? `, change ${metric.change}` : ""}`}
    >
      <Text variant="body" tone="secondary" style={styles.cellLabel}>
        {metric.label}
        {metric.nonGaap ? " · non-GAAP" : ""}
      </Text>
      <View style={wide ? styles.cellLine : undefined}>
        <Text variant="price" style={styles.cellValue}>
          {metric.value}
        </Text>
        {metric.change ? (
          <Text variant="data" tone={tone} style={styles.cellChange}>
            {metric.change}
          </Text>
        ) : null}
      </View>
      {metric.note ? (
        <Text variant="body-sm" tone="secondary">
          {metric.note}
        </Text>
      ) : null}
    </View>
  );
}

/** Figures two to a row with hairlines between; an odd last one spans the row. */
export function MetricGrid({ metrics }: { metrics: ReportMetric[] }) {
  return (
    <View style={styles.grid}>
      {metrics.map((metric, index) => {
        const wide = index === metrics.length - 1 && metrics.length % 2 === 1;
        return <MetricCell key={`${metric.label}-${index}`} metric={metric} right={!wide && index % 2 === 1} top={index < 2 && !(wide && index > 0)} wide={wide} />;
      })}
    </View>
  );
}

export function ReportBlockView({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <Text variant="body" tone="secondary" style={styles.paragraph}>
          {block.text}
        </Text>
      );
    case "omission":
      return (
        <Text variant="body" tone="muted" style={styles.paragraph}>
          {block.text}
        </Text>
      );
    case "bullets":
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.bullet}>
              <Text variant="body" tone="secondary" style={styles.paragraph}>
                •
              </Text>
              <Text variant="body" tone="secondary" style={[styles.flex, styles.paragraph]}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "metrics":
      return <MetricGrid metrics={block.metrics} />;
    case "table":
      /* A filing's table is wider than a phone: one card per row, "Column: value". */
      return (
        <View style={styles.table}>
          {block.table.caption ? (
            <Text variant="body-sm" tone="secondary">
              {block.table.caption}
            </Text>
          ) : null}
          {block.table.rows.map((row, index) => (
            <View key={index} style={[styles.tableRow, index > 0 && styles.cellRuled]}>
              {row.map((cell, column) => (
                <View key={column} style={styles.tableCell}>
                  <Text variant="body-sm" tone="secondary" style={styles.flex}>
                    {block.table.columns[column] ?? ""}
                  </Text>
                  <Text variant={column === 0 ? "body" : "data"} style={styles.tableValue}>
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

/** A section as a card: its serif title, then its blocks in the document's order. */
export function ReportSectionCard({ title, children, note }: { title: string; children: ReactNode; note?: string | null }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={styles.sectionTitle}>
          {title}
        </NativeText>
        {note ? (
          <Text variant="body" tone="secondary" style={styles.reportMeta}>
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/* ---- sources ---- */

const SOURCE: Record<SourceKind, { icon: LucideIcon; label: string }> = {
  sec_filing: { icon: FileText, label: "SEC filing" },
  sec_xbrl: { icon: Database, label: "XBRL fact" },
  company_ir: { icon: Globe, label: "Company investor relations" },
  market_data: { icon: Database, label: "Market data" },
  protocol_api: { icon: Database, label: "Protocol data" },
  token_unlock_provider: { icon: Database, label: "Token unlock data" },
};

/**
 * One source, full width: its kind, the server's own label for it, the
 * identifiers that pin it down (accession, XBRL concept) as secondary
 * lines that wrap whole, when it was published, and Open source — only
 * where there is a URL.
 */
export function SourceCard({ source }: { source: ResearchSource }) {
  const look = SOURCE[source.kind] ?? { icon: FileText, label: "Source" };
  const Icon = look.icon;
  const updated = utcTime(source.asOf);
  const ids = [source.concept, source.accession].filter((part): part is string => !!part);
  return (
    <View style={styles.source}>
      <View style={styles.sourceHead}>
        <View style={styles.sourceIcon}>
          <Icon size={24} strokeWidth={1.5} color={color["accent-hover"]} />
        </View>
        <View style={styles.flex}>
          <Text variant="body-sm" tone="secondary" style={styles.sourceKind}>
            {look.label} · {source.id}
          </Text>
          <Text variant="body" style={styles.sourceTitle}>
            {source.label}
          </Text>
          {ids.length > 0 && (
            <Text variant="body-sm" tone="secondary" selectable style={styles.sourceIds}>
              {ids.join(" · ")}
            </Text>
          )}
        </View>
      </View>
      {(updated !== null || source.url !== null) && (
        <View style={styles.sourceFoot}>
          <Text variant="body-sm" tone="secondary" style={styles.flex}>
            {updated === null ? "" : `Updated ${updated}`}
          </Text>
          {source.url !== null && (
            <Pressable
              onPress={() => openExternal(source.url as string)}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${source.label}`}
              accessibilityHint="Opens in your browser"
              style={styles.open}
            >
              <ExternalLink size={20} strokeWidth={1.5} color={color["accent-hover"]} />
              <Text variant="body" style={styles.openText}>
                Open source
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: color["surface-hover"] },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 34, maxWidth: "100%", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.panel, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontSize: 15, lineHeight: 20, flexShrink: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  /* list */
  reportCard: { borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"], overflow: "hidden" },
  reportRow: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18 },
  reportIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  reportWords: { flex: 1, minWidth: 0, gap: 4 },
  reportName: { fontFamily: DISPLAY_SERIF, fontSize: 24, lineHeight: 30, color: color["text-primary"] },
  reportMeta: { fontSize: 15, lineHeight: 21 },
  reportFooter: { paddingHorizontal: 18, paddingBottom: 16, gap: 8 },
  /* sections */
  section: { gap: 14, padding: 20, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"] },
  sectionHead: { gap: 2 },
  sectionTitle: { fontFamily: DISPLAY_SERIF, fontSize: 28, lineHeight: 34, color: color["text-primary"], letterSpacing: -0.2 },
  paragraph: { fontSize: 16, lineHeight: 24 },
  list: { gap: 6 },
  bullet: { flexDirection: "row", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { gap: 4, paddingVertical: 12 },
  cellHalf: { width: "50%", paddingRight: 12 },
  cellWide: { width: "100%" },
  cellRight: { paddingLeft: 16, paddingRight: 0, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-subtle"] },
  cellRuled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  cellLabel: { fontSize: 15, lineHeight: 20 },
  cellLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 12 },
  cellValue: { fontSize: 24, lineHeight: 30 },
  cellChange: { fontSize: 15, lineHeight: 20 },
  table: { gap: 4, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-subtle"], padding: 12 },
  tableRow: { gap: 4, paddingVertical: 8 },
  tableCell: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  tableValue: { flexShrink: 1, textAlign: "right", fontSize: 15, lineHeight: 21 },
  /* sources */
  source: { gap: 12, padding: 16, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-base"] },
  sourceHead: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  sourceIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    alignItems: "center",
    justifyContent: "center",
  },
  sourceKind: { fontSize: 14, lineHeight: 19 },
  sourceTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  sourceIds: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  sourceFoot: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  open: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, paddingLeft: 8 },
  openText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
});
