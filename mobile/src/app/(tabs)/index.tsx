import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { Watchlist } from "~/components/market/Watchlist";
import {
  FeedLine,
  MarketSignals,
  PulseBoard,
  SmartMoney,
  smartHealth,
  useMarketSignals,
  WatchlistPulse,
} from "~/components/market/Signals";
import { SegmentedControl } from "~/components/ui/controls";
import { refreshPrices } from "~/lib/stores/market";
import { usePulse, useSmartMoney } from "~/lib/stores/signals";
import { useWatchlist } from "~/lib/stores/watchlist";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Markets — the website's watchlist, live signals and market pulse, one
   view at a time on a phone. Each feed polls only while its view is on
   screen and the app is in front.
--------------------------------------------------------------------------- */

type View3 = "watchlist" | "signals" | "pulse";
type Feed = "market" | "smart";

function ViewSwitch({ value, onChange }: { value: View3; onChange: (next: View3) => void }) {
  return (
    <SegmentedControl<View3>
      accessibilityLabel="Markets view"
      value={value}
      onChange={onChange}
      choices={[
        { value: "watchlist", label: "Watchlist" },
        { value: "signals", label: "Signals" },
        { value: "pulse", label: "Pulse" },
      ]}
    />
  );
}

export default function MarketsScreen() {
  const [view, setView] = useState<View3>("watchlist");
  const [feed, setFeed] = useState<Feed>("market");
  const focused = useIsFocused();
  const now = useMinute();

  const market = useMarketSignals(focused && view === "signals");
  const smart = useSmartMoney(focused && view === "signals" && feed === "smart");
  const pulse = usePulse(focused && view === "pulse");
  const watchlist = useWatchlist();

  const switcher = (
    <View style={styles.switcher}>
      <ViewSwitch value={view} onChange={setView} />
    </View>
  );

  if (view === "watchlist") {
    return (
      <View style={styles.screen}>
        <Watchlist header={switcher} />
      </View>
    );
  }

  if (view === "signals") {
    const health = feed === "market" ? market.health : smartHealth(smart.state, now);
    const head = (
      <View>
        {switcher}
        <SegmentedControl<Feed>
          accessibilityLabel="Signal feed"
          value={feed}
          onChange={setFeed}
          choices={[
            { value: "market", label: `Market · ${market.health}` },
            { value: "smart", label: `Smart money · ${smartHealth(smart.state, now)}` },
          ]}
        />
        <FeedLine
          state={health}
          at={feed === "market" ? market.feed.fetchedAt : smart.state.fetchedAt}
          now={now}
          source={feed === "market" ? "Pyth" : smart.state.origin === "hyperliquid" ? "Elyra's Hyperliquid read" : smart.state.origin === "tracker" ? "Smart-money tracker" : null}
        />
      </View>
    );
    const refresh = (
      <RefreshControl
        refreshing={false}
        onRefresh={() => {
          smart.reload();
          refreshPrices();
        }}
        tintColor={color.accent}
        colors={[color.accent]}
        progressBackgroundColor={color["surface-raised"]}
      />
    );
    return (
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={[feed]}
        keyExtractor={(item) => item}
        ListHeaderComponent={head}
        renderItem={() => (feed === "market" ? <MarketSignals market={market} now={now} /> : <SmartMoney state={smart.state} now={now} reload={smart.reload} />)}
        refreshControl={refresh}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={refreshPrices}
          tintColor={color.accent}
          colors={[color.accent]}
          progressBackgroundColor={color["surface-raised"]}
        />
      }
    >
      {switcher}
      <WatchlistPulse symbols={watchlist.symbols} />
      <PulseBoard pulse={pulse} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  switcher: { paddingTop: 12, paddingBottom: 8 },
});
