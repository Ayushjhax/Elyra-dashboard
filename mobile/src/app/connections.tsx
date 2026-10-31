import { StyleSheet, View } from "react-native";
import { Lock, ShieldCheck } from "lucide-react-native";
import { BinanceCard, HyperliquidCard } from "~/components/connections/Exchanges";
import { PolymarketLink } from "~/components/research/prediction/PolymarketLink";
import { GroupLabel, SettingsPage } from "~/components/shell/settings";
import { Text } from "~/components/ui/Text";
import { Notice } from "~/components/wallet/parts";
import { useConnections } from "~/lib/stores/connections";
import { usePortfolio } from "~/lib/stores/portfolio";
import { usePredictionAccount } from "~/lib/stores/prediction";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Connections — the website's Connections drawer: what Elyra can read on
   the person's behalf.

   Every connection is read-only, and that is enforced rather than promised:
   the API refuses a Binance key that can trade, transfer or withdraw before
   it stores it, and Hyperliquid and Polymarket are read by address. A
   venue says Connected only once it has answered in the latest portfolio
   reading.
--------------------------------------------------------------------------- */

export default function ConnectionsScreen() {
  const feed = useConnections();
  const portfolio = usePortfolio();
  /* The Polymarket card reads the same shared store; this is for refresh. */
  const prediction = usePredictionAccount();
  return (
    <SettingsPage
      title="Connections"
      subtitle="Your capital, connected."
      onRefresh={() => {
        feed.refetch();
        portfolio.refetch();
        prediction.refetch();
      }}
      refreshing={feed.refreshing}
    >
      <View style={styles.strip} accessible accessibilityLabel="Read-only access. View balances and positions. No trading or transfers.">
        <ShieldCheck size={30} strokeWidth={1.5} color={color["accent-hover"]} />
        <View style={styles.flex}>
          <Text variant="body" style={styles.stripTitle}>
            Read-only access
          </Text>
          <Text variant="body" tone="secondary" style={styles.stripText}>
            View balances and positions. No trading or transfers.
          </Text>
        </View>
      </View>
      {feed.error !== null && feed.data === null && !feed.loading && <Notice tone="negative">Your connections could not be read. {feed.error}</Notice>}

      <View style={styles.section}>
        <GroupLabel>Exchanges</GroupLabel>
        <HyperliquidCard feed={feed} portfolio={portfolio} />
        <BinanceCard feed={feed} portfolio={portfolio} />
      </View>

      <View style={styles.section}>
        <GroupLabel>Prediction markets</GroupLabel>
        <PolymarketLink />
      </View>

      <View style={styles.foot}>
        <Lock size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        <Text variant="body" tone="secondary" style={styles.footText}>
          Connection access stays read-only
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  stripTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  stripText: { fontSize: 15, lineHeight: 21 },
  section: { gap: 12 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 8 },
  footText: { fontSize: 15, lineHeight: 21 },
});
