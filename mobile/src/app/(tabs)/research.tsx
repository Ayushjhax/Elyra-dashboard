import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { BacktestsTab } from "~/components/research/BacktestsTab";
import { openMarket } from "~/components/research/prediction/Markets";
import { PredictionTab } from "~/components/research/prediction/PredictionTab";
import { RecapTab } from "~/components/research/RecapTab";
import { ReportsTab } from "~/components/research/ReportsTab";
import { SecTab } from "~/components/research/sec/SecTab";
import { SignalsTab } from "~/components/research/SignalsTab";
import { TabStrip } from "~/components/research/TabStrip";
import { UnlocksTab } from "~/components/research/UnlocksTab";
import { YieldTab } from "~/components/research/YieldTab";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Research — the website's ResearchWorkspace, and the chat's /research,
   /report, /recap, /signals, /yield, /unlocks and /backtest.

   The selected tab lives in the route (`/research?tab=yield`), so a link or
   a shortcut can open one directly and back returns to it. A tab is
   mounted the first time it is opened and kept, so switching back keeps its
   form and results; only the tab on screen reads and polls.
--------------------------------------------------------------------------- */

const TABS = [
  { id: "reports", label: "Reports" },
  { id: "backtests", label: "Backtests" },
  { id: "prediction", label: "Prediction markets" },
  { id: "recap", label: "Market recap" },
  { id: "signals", label: "Signals" },
  { id: "yield", label: "Yield" },
  { id: "unlocks", label: "Unlocks" },
  { id: "sec", label: "SEC" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function isTab(value: unknown): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

export default function ResearchScreen() {
  /* `marketId` is where a prediction alert's notification lands
     (lib/notifications/routes.ts): the prediction tab, with that market open. */
  const params = useLocalSearchParams<{ tab?: string; marketId?: string }>();
  const tab: Tab = params.marketId ? "prediction" : isTab(params.tab) ? params.tab : "reports";
  const focused = useIsFocused();
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  /* A pull to refresh remounts the tab on screen, which reads it afresh. */
  const [generation, setGeneration] = useState(0);
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));

  const select = (next: Tab) => router.setParams({ tab: next, marketId: undefined });

  /* Opened once per link, then the param is cleared so back returns here. */
  useEffect(() => {
    if (!params.marketId) return;
    const id = params.marketId;
    router.setParams({ tab: "prediction", marketId: undefined });
    openMarket(id);
  }, [params.marketId]);

  const render = (id: Tab) => {
    const active = focused && id === tab;
    switch (id) {
      case "reports":
        return <ReportsTab active={active} />;
      case "backtests":
        return <BacktestsTab active={active} />;
      case "prediction":
        return <PredictionTab active={active} />;
      case "recap":
        return <RecapTab active={active} />;
      case "signals":
        return <SignalsTab active={active} />;
      case "yield":
        return <YieldTab active={active} />;
      case "unlocks":
        return <UnlocksTab active={active} onReports={() => select("reports")} />;
      case "sec":
        return <SecTab active={active} />;
    }
  };

  return (
    <View style={styles.screen}>
      <TabStrip tabs={TABS} value={tab} onChange={select} label="Research" />
      {TABS.filter(({ id }) => visited.has(id)).map(({ id }) => (
        <ScrollView
          key={`${id}-${id === tab ? generation : 0}`}
          style={id === tab ? styles.fill : styles.hidden}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => setGeneration((value) => value + 1)}
              tintColor={color.accent}
              colors={[color.accent]}
              progressBackgroundColor={color["surface-raised"]}
            />
          }
        >
          {render(id)}
        </ScrollView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  fill: { flex: 1 },
  hidden: { display: "none" },
  content: { padding: 16, paddingBottom: 32 },
});
