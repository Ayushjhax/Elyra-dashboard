import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FullReport } from "@/lib/research/reportTypes";
import { Loading, Problem, useResearch } from "~/components/research/parts";
import { ReportView } from "~/components/research/ReportView";
import { TitleBar } from "~/components/shell/flow";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One research report, by id — read with the Research tabs' useResearch
   and drawn by ReportView (components/research/ReportView.tsx).
--------------------------------------------------------------------------- */

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const report = useResearch<FullReport>(`/api/research/reports/${encodeURIComponent(id ?? "")}`);
  const data = report.data;

  return (
    <View style={styles.screen}>
      <TitleBar title={data?.subjectTicker ?? "Report"} onRefresh={report.reload} refreshing={report.refreshing} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {report.loading && <Loading>Opening report…</Loading>}
        {report.error !== null && <Problem retry={report.reload}>{report.error}</Problem>}
        {data !== null && <ReportView data={data} onRetry={report.reload} />}
        {data !== null && (
          <Text variant="body-sm" tone="secondary" style={styles.foot}>
            Built from SEC filings as filed, and figures as tagged in XBRL. Not advice.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  foot: { fontSize: 14, lineHeight: 19, textAlign: "center" },
});
