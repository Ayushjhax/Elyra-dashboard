import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Exposure } from "~/components/research/prediction/Exposure";
import { AlertsList, SignalHistory, WatchedList } from "~/components/research/prediction/Lists";
import { Markets } from "~/components/research/prediction/Markets";
import { Chips } from "~/components/research/parts";

/* ---------------------------------------------------------------------------
   Prediction markets — read-only analytics and alerts. The website's
   PredictionMarketsTab and PolymarketCard, the chat's prediction commands,
   and the Mini App's Prediction, Trending, Signals and Alerts views, each a
   native view here:

     Markets    trending, by category, or searched; a market opens its screen
     Watchlist  the markets you keep an eye on
     Exposure   your linked Polymarket account: positions, P&L, expiring,
                activity, orders — read-only
     Alerts     your rules, set on a market's screen
     Signals    the signals computed for you, tracked forward

   Data is Polymarket's and attributed as such; Elyra is not affiliated with
   it. Nothing here places an order.
--------------------------------------------------------------------------- */

type Section = "markets" | "watchlist" | "exposure" | "alerts" | "signals";

const SECTIONS: readonly { value: Section; label: string }[] = [
  { value: "markets", label: "Markets" },
  { value: "watchlist", label: "Watchlist" },
  { value: "exposure", label: "Your exposure" },
  { value: "alerts", label: "Alerts" },
  { value: "signals", label: "Signals" },
];

export function PredictionTab({ active }: { active: boolean }) {
  const [section, setSection] = useState<Section>("markets");
  return (
    <View style={styles.tab}>
      <Chips<Section> label="Prediction markets view" value={section} onChange={setSection} options={SECTIONS} />
      {section === "markets" && <Markets active={active} />}
      {section === "watchlist" && <WatchedList />}
      {section === "exposure" && <Exposure active={active} />}
      {section === "alerts" && <AlertsList />}
      {section === "signals" && <SignalHistory active={active} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 12 },
});
