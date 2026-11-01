import { Text as NativeText, Pressable, StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import type { FullReport } from "@/lib/research/reportTypes";
import { askElyra, PdfButtons, Problem } from "~/components/research/parts";
import { KIND_LABEL, QualityBadge, ReportBlockView, ReportSectionCard, SourceCard, utcTime } from "~/components/research/report";
import { CalloutNotice } from "~/components/shell/surface";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api";
import { reportPdf } from "~/lib/pdf";
import { DISPLAY_SERIF } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One research report — its sections, figures and sources, in the order the
   document gives them (the same object the PDF is rendered from).

   The verification verdict is the document's own: "with warnings" is said at
   the top and again by the sources, and never upgraded. A figure carries the
   change the server formatted, against the comparison period named under
   the section; a stated absence ("omission") is shown, never dropped; a
   table becomes one card per row because a filing's table is wider than a
   phone. Each source is a full-width card that opens on its own URL, and
   one without a URL has no link.

   No PDF, no download: the line says so instead of offering a dead button.
--------------------------------------------------------------------------- */

const WARNING = "Some figures could not be checked against a second source.";
const INCOMPLETE = "Some sections could not be built from the filings.";

/** A loaded report, top to bottom. `onRetry` reads it again when its document is not there yet. */
export function ReportView({ data, onRetry }: { data: FullReport; onRetry: () => void }) {
  const name = data.subjectName ?? data.query;
  const title = `${name}${data.periodLabel ? ` · ${data.periodLabel}` : ""}`;
  const ticker = data.subjectTicker;
  const meta = [data.periodLabel, KIND_LABEL[data.kind] ?? data.kind].filter((part): part is string => !!part).join(" · ");
  const created = utcTime(data.createdAt);
  const prior = data.document?.priorPeriod?.label ?? null;
  return (
    <>
    <View style={styles.intro}>
      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.name}>
        {name}
      </NativeText>
      {meta.length > 0 && (
        <NativeText maxFontSizeMultiplier={1.25} style={styles.meta}>
          {meta}
        </NativeText>
      )}
      {created !== null && (
        <Text variant="body" tone="secondary" style={styles.created}>
          Created {created}
        </Text>
      )}
      {data.quality === "verified" && (
        <View style={styles.badge}>
          <QualityBadge quality="verified" />
        </View>
      )}
    </View>

    {data.quality === "verified_with_warnings" && <CalloutNotice title="Verified with warnings" body={WARNING} />}
    {data.quality === "incomplete" && <CalloutNotice title="Incomplete" body={INCOMPLETE} />}

    {data.hasPdf ? (
      <PdfButtons
        title={title}
        load={async () => {
          const { url } = await api.get<{ url: string }>(`/api/research/reports/${encodeURIComponent(data.id)}/download?as=json`);
          return reportPdf(url, title);
        }}
      />
    ) : (
      <Text variant="body" tone="secondary" style={styles.note}>
        No PDF was stored for this report.
      </Text>
    )}

    <Pressable
      onPress={() =>
        askElyra(`I have a research report on ${title}. What are the most important things in its latest filings, and what should I watch next?`)
      }
      accessibilityRole="button"
      accessibilityLabel={`Ask Elyra about ${ticker ?? name}`}
      accessibilityHint="Opens Elyra with this report as the question"
      style={({ pressed }) => [styles.ask, pressed && styles.pressed]}
    >
      <Sparkles size={24} strokeWidth={1.5} color={color["accent-hover"]} />
      <NativeText maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.askText}>
        Ask Elyra about {ticker ?? "this report"}
      </NativeText>
    </Pressable>

    {data.document === null ? (
      <Problem retry={onRetry}>{data.error ?? data.statusDetail ?? "The report document is not available yet."}</Problem>
    ) : (
      <>
        {data.document.sections.map((section) => (
          <ReportSectionCard
            key={section.id}
            title={section.title}
            note={prior !== null && section.blocks.some((block) => block.kind === "metrics" && block.metrics.some((metric) => metric.change)) ? `Changes against ${prior}` : null}
          >
            {section.blocks.map((block, index) => (
              <ReportBlockView key={index} block={block} />
            ))}
          </ReportSectionCard>
        ))}
        <ReportSectionCard
          title="Sources"
          note={`${data.document.sources.length} ${data.document.sources.length === 1 ? "reference" : "references"}`}
        >
          {data.document.sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </ReportSectionCard>
        {data.quality === "verified_with_warnings" && <CalloutNotice body={WARNING} />}
      </>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { backgroundColor: color["surface-hover"] },
  intro: { gap: 4 },
  name: { fontFamily: DISPLAY_SERIF, fontSize: 40, lineHeight: 46, color: color["text-primary"], letterSpacing: -0.4 },
  meta: { fontFamily: DISPLAY_SERIF, fontSize: 22, lineHeight: 28, color: color["text-secondary"] },
  created: { fontSize: 16, lineHeight: 22 },
  badge: { marginTop: 8 },
  note: { fontSize: 15, lineHeight: 21 },
  ask: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: TOUCH_TARGET + 10,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["accent-hover"],
  },
  askText: { fontFamily: DISPLAY_SERIF, fontSize: 21, lineHeight: 26, color: color["text-primary"], flexShrink: 1 },
});
