import { StyleSheet, View } from "react-native";
import { Lock, ShieldCheck } from "lucide-react-native";
import { BinanceCard, HyperliquidCard } from "~/components/connections/Exchanges";
import { DetailScreen } from "~/components/portfolio/parts";
import { PolymarketLink } from "~/components/research/prediction/PolymarketLink";
import { Text } from "~/components/ui/Text";
import { useConnections } from "~/lib/stores/connections";
import { usePortfolio } from "~/lib/stores/portfolio";
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
  return (
    <DetailScreen title="Connections" onRefresh={feed.refetch} refreshing={feed.refreshing}>
      <View style={styles.strip}>
        <ShieldCheck size={16} strokeWidth={1.5} color={color.positive} />
        <View style={styles.flex}>
          <Text variant="body-sm">Read-only access</Text>
          <Text variant="label" tone="secondary">
            View balances and positions. Nothing here can place, change or cancel a trade.
          </Text>
        </View>
      </View>
      {feed.error !== null && feed.data === null && (
        <Text variant="body-sm" tone="negative">
          Your connections could not be read. {feed.error}
        </Text>
      )}
      <Text variant="eyebrow" tone="muted">
        Exchanges
      </Text>
      <HyperliquidCard feed={feed} portfolio={portfolio} />
      <BinanceCard feed={feed} portfolio={portfolio} />
      <Text variant="eyebrow" tone="muted">
        Prediction markets
      </Text>
      <PolymarketLink />
      <View style={styles.foot}>
        <Lock size={12} strokeWidth={1.5} color={color["text-muted"]} />
        <Text variant="label" tone="muted">
          Connection access stays read-only
        </Text>
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  strip: { flexDirection: "row", gap: 12, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"] },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
});
