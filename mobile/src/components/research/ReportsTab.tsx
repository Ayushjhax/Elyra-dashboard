import { useRef, useState } from "react";
import { Text as NativeText, Pressable, StyleSheet, TextInput, View } from "react-native";
import { ArrowRight, FileText, Search } from "lucide-react-native";
import { reportRequest, type ReportKind } from "@/lib/research/intent";
import { reportSettled, type ReportRecord } from "@/lib/research/reportTypes";
import { Chips, Empty, Loading, PdfButtons, Problem, TabIntro, useResearch } from "~/components/research/parts";
import { ReportCard } from "~/components/research/report";
import { WideButton } from "~/components/shell/flow";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { api, ApiError } from "~/lib/api";
import { reportPdf } from "~/lib/pdf";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Reports — the website's ReportsTab.

   A company report built from SEC filings: a query, a type (Auto reads the
   question; Earnings, 10-Q and 10-K say it outright) and three starters.
   The list polls every few seconds while one is being written and stops
   once all have settled. A finished report opens on its own screen; a
   failed one says why and can be sent again as an edited request.

   The API limits how often one person can start a report; its own sentence
   ("Wait a moment and try again") is shown when it applies. A request is
   sent once: a second press while one is starting does nothing.
--------------------------------------------------------------------------- */

type Kind = ReportKind;
type Filter = "all" | "complete" | "running" | "failed";

const STARTERS = ["NVDA latest earnings", "NVDA 10-Q", "MSFT 10-K"];
const RUNNING_POLL_MS = 2_500;

const MAX_QUERY = 250;

function ReportRow({ report, onEdit }: { report: ReportRecord; onEdit: () => void }) {
  const title = `${report.subjectName ?? report.query}${report.periodLabel ? ` · ${report.periodLabel}` : ""}`;
  const pdf = report.status === "complete" && report.hasPdf;
  const failed = report.status === "failed";
  return (
    <ReportCard
      report={report}
      footer={
        pdf || failed ? (
          <>
            {pdf && (
              <PdfButtons
                title={title}
                load={async () => {
                  const { url } = await api.get<{ url: string }>(`/api/research/reports/${encodeURIComponent(report.id)}/download?as=json`);
                  return reportPdf(url, title);
                }}
              />
            )}
            {failed && <Button label="Edit request" size="sm" variant="ghost" onPress={onEdit} />}
          </>
        ) : undefined
      }
    />
  );
}

export function ReportsTab({ active }: { active: boolean }) {
  const library = useResearch<{ reports: ReportRecord[] }>(active ? "/api/research/reports" : null, {
    pollMs: (data) => (data?.reports.some((report) => !reportSettled(report.status)) ? RUNNING_POLL_MS : null),
  });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("auto");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = query.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_QUERY;

  const submit = async () => {
    if (sending.current || !valid) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/research/reports", { query: reportRequest(query, kind) });
      setQuery("");
      library.reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Could not start that report.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const reports = library.data?.reports ?? [];
  const visible = reports.filter((report) =>
    filter === "all" ? true : filter === "running" ? !reportSettled(report.status) : report.status === filter,
  );

  return (
    <View style={styles.tab}>
      <TabIntro title="Clarity starts here." lead="Research public companies with Elyra." />

      <SurfaceCard>
        <Text variant="body" accessibilityRole="header" style={styles.cardTitle}>
          Create a report
        </Text>
        <View style={styles.field}>
          <Text variant="body" tone="secondary" style={styles.label}>
            Company, ticker or research question
          </Text>
          <View style={styles.input}>
            <Search size={24} strokeWidth={1.5} color={color["text-primary"]} />
            <TextInput
              value={query}
              onChangeText={(next) => {
                setQuery(next);
                setError(null);
              }}
              maxLength={MAX_QUERY}
              placeholder="NVDA, Microsoft, or a question…"
              placeholderTextColor={color["text-muted"]}
              selectionColor={color.accent}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              accessibilityLabel="Company, ticker or research question"
              style={styles.inputText}
            />
          </View>
        </View>
        <Chips<Kind>
          label="Report type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "auto", label: "Auto" },
            { value: "earnings", label: "Earnings" },
            { value: "10-Q", label: "10-Q" },
            { value: "10-K", label: "10-K" },
          ]}
        />
        <WideButton
          label={busy ? "Starting…" : "Research"}
          variant={valid ? "accent" : "outline"}
          trailing={busy ? undefined : ArrowRight}
          busy={busy}
          disabled={!valid}
          onPress={() => void submit()}
        />
        {error !== null && <Problem>{error}</Problem>}
        <Rule />
        <View style={styles.field}>
          <Text variant="body" tone="secondary" style={styles.label}>
            Suggested queries
          </Text>
          <View style={styles.suggestions}>
            {STARTERS.map((starter) => (
              <Pressable
                key={starter}
                onPress={() => {
                  setQuery(starter);
                  setKind("auto");
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use “${starter}”`}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.suggestionText}>
                  {starter}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Rule />
        <View style={styles.basis}>
          <FileText size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          <Text variant="body" tone="secondary" style={[styles.flex, styles.basisText]}>
            SEC filings · XBRL · Public companies only.
          </Text>
        </View>
      </SurfaceCard>

      <View style={styles.heading}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.sectionTitle}>
          Your reports
        </NativeText>
        <Text variant="data" tone="secondary" style={styles.count} accessibilityLabel={library.data ? `${reports.length} reports` : "Count loading"}>
          {library.data ? String(reports.length) : "—"}
        </Text>
      </View>
      <Chips<Filter>
        label="Filter reports"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "complete", label: "Completed" },
          { value: "running", label: "Generating" },
          { value: "failed", label: "Failed" },
        ]}
      />
      {library.loading && <Loading>Loading reports…</Loading>}
      {library.error !== null && <Problem retry={library.reload}>{library.error}</Problem>}
      {library.data !== null && visible.length === 0 && (
        <Empty
          title={reports.length === 0 ? "No reports yet" : "No matching reports"}
          body={reports.length === 0 ? "Choose a company above to start your research." : "Choose another filter to see your reports."}
        />
      )}
      {visible.map((report) => (
        <ReportRow
          key={report.id}
          report={report}
          onEdit={() => {
            setQuery(report.query);
            setKind("auto");
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: color["surface-hover"] },
  cardTitle: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26 },
  field: { gap: 10 },
  label: { fontSize: 16, lineHeight: 22 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputText: { flex: 1, minWidth: 0, minHeight: 56, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 17 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestion: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
  },
  suggestionText: { fontSize: 15, lineHeight: 20 },
  basis: { flexDirection: "row", alignItems: "center", gap: 12 },
  basisText: { fontSize: 15, lineHeight: 21 },
  heading: { flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 8 },
  sectionTitle: { fontFamily: DISPLAY_SERIF, fontSize: 30, lineHeight: 36, color: color["text-primary"] },
  count: { fontSize: 18, lineHeight: 24 },
});
