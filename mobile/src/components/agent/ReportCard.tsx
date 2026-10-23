import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { FileText } from "lucide-react-native";
import { reportSettled, type ReportRecord, type ReportStatus } from "@/lib/research/reportTypes";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { api, ApiError } from "~/lib/api";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A research report the "/report" shortcut started, followed in the
   conversation: each stage as the server reports it, then the PDF — opened
   in the system browser from a link signed for sixty seconds — or the
   reason it failed. Polls every few seconds while on screen and the app is
   in front, and stops once the report settles.
--------------------------------------------------------------------------- */

const POLL_MS = 4_000;

const STAGE: Record<ReportStatus, string> = {
  queued: "Queued",
  resolving: "Finding the company",
  collecting: "Reading its SEC filings",
  analyzing: "Analysing",
  rendering: "Writing the PDF",
  complete: "Ready",
  failed: "Failed",
};

type Report = Pick<ReportRecord, "id" | "status" | "statusDetail" | "subjectName" | "subjectTicker" | "periodLabel" | "hasPdf" | "error">;

export function ReportCard({ id, query }: { id: string; query: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const settled = report !== null && reportSettled(report.status);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (settled || !foreground) return;
    let cancelled = false;
    const tick = () =>
      void api
        .get<Report>(`/api/research/reports/${encodeURIComponent(id)}`)
        .then((next) => {
          if (!cancelled) {
            setReport(next);
            setError(null);
          }
        })
        .catch((failure: unknown) => {
          if (!cancelled) setError(failure instanceof ApiError ? failure.message : "The report's progress could not be read.");
        });
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, settled, foreground]);

  const open = async () => {
    setOpening(true);
    try {
      const { url } = await api.get<{ url: string }>(`/api/research/reports/${encodeURIComponent(id)}/download?as=json`);
      openExternal(url);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "The PDF could not be opened.");
    } finally {
      setOpening(false);
    }
  };

  const title = report?.subjectName ?? report?.subjectTicker ?? query;
  return (
    <View style={styles.card} accessibilityLabel={`Research report: ${title}`}>
      <View style={styles.head}>
        <FileText size={14} strokeWidth={1.5} color={color["agent-accent"]} />
        <Text variant="eyebrow" tone="muted" style={styles.flex}>
          Research report
        </Text>
        <Text variant="label" tone={report?.status === "failed" ? "negative" : report?.status === "complete" ? "positive" : "secondary"} accessibilityLiveRegion="polite">
          {report === null ? "Starting" : STAGE[report.status]}
        </Text>
      </View>
      <Text variant="body">{title}</Text>
      {report?.periodLabel != null && (
        <Text variant="label" tone="secondary">
          {report.periodLabel}
        </Text>
      )}
      {report?.status === "failed" ? (
        <Text variant="label" tone="negative">
          {report.error ?? "The report could not be completed."}
        </Text>
      ) : report?.statusDetail != null && !settled ? (
        <Text variant="label" tone="muted">
          {report.statusDetail}
        </Text>
      ) : null}
      {error !== null && (
        <Text variant="label" tone="negative">
          {error}
        </Text>
      )}
      {report?.status === "complete" && !report.hasPdf && (
        <Text variant="label" tone="muted">
          The report is written, but its PDF could not be stored, so there is nothing to open yet.
        </Text>
      )}
      {report?.status === "complete" && report.hasPdf && (
        <View style={styles.actions}>
          <Button label={opening ? "Opening…" : "Open the PDF"} size="sm" loading={opening} onPress={() => void open()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: color["border-subtle"],
    borderLeftColor: color["agent-rail"],
    backgroundColor: color["surface-raised"],
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
});
