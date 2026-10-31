import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { MarketsTabs, MarketsTitle, UnderlineTabs } from "~/components/market/parts";
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
import { refreshPrices } from "~/lib/stores/market";
import { usePulse, useSmartMoney } from "~/lib/stores/signals";
import { useWatchlist } from "~/lib/stores/watchlist";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Markets — the website's watchlist, live signals and market pulse, one
   view at a time on a phone. Each feed polls only while its view is on
   screen and the app is in front.

   Every view opens the same way: the serif title and the three main tabs,
   inside that view's own scrolling list, so the title scrolls away with the
   content and the brand header (the tab's `header`) stays put.
--------------------------------------------------------------------------- */

type View3 = "watchlist" | "signals" | "pulse";
type Feed = "market" | "smart";

const VIEWS = [
  { value: "watchlist", label: "Watchlist" },
  { value: "signals", label: "Signals" },
  { value: "pulse", label: "Pulse" },
] as const;

const FEEDS = [
  { value: "market", label: "Market" },
  { value: "smart", label: "Smart money" },
] as const;

export default function MarketsScreen() {
  const [view, setView] = useState<View3>("watchlist");
  const [feed, setFeed] = useState<Feed>("market");
  const focused = useIsFocused();
  const now = useMinute();

  const market = useMarketSignals(focused && view === "signals");
  const smart = useSmartMoney(focused && view === "signals" && feed === "smart");
  const pulse = usePulse(focused && view === "pulse");
  const watchlist = useWatchlist();

  const head = (
    <View style={styles.head}>
      <MarketsTitle />
      <MarketsTabs<View3> accessibilityLabel="Markets view" tabs={VIEWS} value={view} onChange={setView} />
    </View>
  );

  if (view === "watchlist") {
    return (
      <View style={styles.screen}>
        <Watchlist header={head} />
      </View>
    );
  }

  if (view === "signals") {
    const smartSource = smart.state.origin === "hyperliquid" ? "Hyperliquid" : smart.state.origin === "tracker" ? "Smart-money tracker" : null;
    const signalsHead = (
      <View style={styles.signalsHead}>
        {head}
        <UnderlineTabs<Feed> accessibilityLabel="Signal feed" tabs={FEEDS} value={feed} onChange={setFeed} />
        <FeedLine
          state={feed === "market" ? market.health : smartHealth(smart.state, now)}
          at={feed === "market" ? market.feed.fetchedAt : smart.state.fetchedAt}
          now={now}
          source={feed === "market" ? "Pyth" : smartSource}
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
        ListHeaderComponent={signalsHead}
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
          onRefresh={() => {
            refreshPrices();
            pulse.reload();
          }}
          tintColor={color.accent}
          colors={[color.accent]}
          progressBackgroundColor={color["surface-raised"]}
        />
      }
    >
      {head}
      <WatchlistPulse symbols={watchlist.symbols} />
      <PulseBoard pulse={pulse} now={now} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  head: { gap: 14, paddingBottom: 8 },
  signalsHead: { gap: 12, paddingBottom: 12 },
});
