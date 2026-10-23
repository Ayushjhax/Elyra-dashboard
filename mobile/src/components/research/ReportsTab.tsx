import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, FileText } from "lucide-react-native";
import { reportRequest, type ReportKind } from "@/lib/research/intent";
import { reportSettled, type ReportRecord } from "@/lib/research/reportTypes";
import { Card, Chips, Empty, Loading, PdfButtons, Problem, Timestamp, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { api, ApiError } from "~/lib/api";
import { reportPdf } from "~/lib/pdf";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Reports — the website's ReportsTab.

   A company report built from SEC filings: a query, a type (Auto reads the
   question; Earnings, 10-Q and 10-K say it outright) and three starters.
   The list polls every few seconds while one is being written and stops
   once all have settled. A finished report opens on its own screen; a
   failed one says why and can be sent again as an edited request.

   The API limits how often one person can start a report; its own sentence
   ("Wait a moment and try again") is shown when it applies.
--------------------------------------------------------------------------- */

type Kind = ReportKind;
type Filter = "all" | "complete" | "running" | "failed";

const STARTERS = ["NVDA latest earnings", "NVDA 10-Q", "MSFT 10-K"];
const RUNNING_POLL_MS = 2_500;

function statusLine(report: ReportRecord): string {
  if (report.status === "complete") {
    return report.quality === "verified_with_warnings"
      ? "Saved · Verified with warnings"
      : report.quality === "incomplete"
        ? "Saved · Incomplete"
        : "Saved · Complete";
  }
  if (report.status === "failed") return report.error ?? "Report failed";
  return report.statusDetail ?? report.status;
}

function ReportRow({ report, onEdit }: { report: ReportRecord; onEdit: () => void }) {
  const title = `${report.subjectName ?? report.query}${report.periodLabel ? ` · ${report.periodLabel}` : ""}`;
  const complete = report.status === "complete";
  const running = !reportSettled(report.status);
  const body = (
    <>
      <View style={shared.row}>
        <FileText size={18} strokeWidth={1.5} color={color["text-muted"]} />
        <Text variant="body" style={shared.flex} numberOfLines={2}>
          {title}
        </Text>
        {complete && <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />}
      </View>
      <Text variant="label" tone={report.status === "failed" ? "negative" : running ? "secondary" : "muted"} accessibilityLiveRegion={running ? "polite" : "none"}>
        {statusLine(report)}
      </Text>
      <Timestamp at={report.createdAt} label="Created" />
    </>
  );
  return (
    <Card>
      {complete ? (
        <Pressable
          onPress={() => router.push({ pathname: "/report/[id]", params: { id: report.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Open the report on ${title}`}
          style={styles.open}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {complete && report.hasPdf && (
        <PdfButtons
          title={title}
          load={async () => {
            const { url } = await api.get<{ url: string }>(`/api/research/reports/${encodeURIComponent(report.id)}/download?as=json`);
            return reportPdf(url, title);
          }}
        />
      )}
      {report.status === "failed" && (
        <View style={shared.row}>
          <Button label="Edit request" size="sm" variant="ghost" onPress={onEdit} />
        </View>
      )}
    </Card>
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
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || query.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/research/reports", { query: reportRequest(query, kind) });
      setQuery("");
      library.reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Could not start that report.");
    } finally {
      setBusy(false);
    }
  };

  const reports = library.data?.reports ?? [];
  const visible = reports.filter((report) =>
    filter === "all" ? true : filter === "running" ? !reportSettled(report.status) : report.status === filter,
  );

  return (
    <View style={styles.tab}>
      <Card>
        <Text variant="h2">Create a report</Text>
        <TextField
          label="Company, ticker or research question"
          value={query}
          onChangeText={setQuery}
          maxLength={250}
          placeholder="NVDA, Microsoft, or a question…"
          autoCapitalize="characters"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
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
        <Button label={busy ? "Starting…" : "Research"} variant="accent" loading={busy} disabled={busy || query.trim().length === 0} onPress={() => void submit()} />
        <View style={shared.row}>
          {STARTERS.map((starter) => (
            <Button
              key={starter}
              label={starter}
              size="sm"
              variant="ghost"
              onPress={() => {
                setQuery(starter);
                setKind("auto");
              }}
            />
          ))}
        </View>
        <Text variant="label" tone="muted">
          Built from SEC filings · XBRL · Public companies only.
        </Text>
        {error !== null && <Problem>{error}</Problem>}
      </Card>

      <View style={shared.heading}>
        <Text variant="h2" style={shared.flex}>
          Your reports{" "}
          <Text variant="data" tone="muted">
            {library.data ? reports.length : "—"}
          </Text>
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
  tab: { gap: 12 },
  open: { gap: 4, minHeight: 48 },
});
