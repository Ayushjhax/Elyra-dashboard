import { StyleSheet, View } from "react-native";
import { formatPrice, formatQty, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { fillTotals, type FillsView } from "@/lib/portfolio/views";
import { Block, DetailScreen, noHyperliquidWallet, ReadState } from "~/components/portfolio/parts";
import { DataList, type DataColumn } from "~/components/ui/DataList";
import { EmptyState } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Money } from "~/components/ui/values";
import { ActivityRow } from "~/components/wallet/ActivityRow";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletActivity } from "~/lib/stores/activity";
import { useAppView } from "~/lib/stores/portfolioViews";
import { useMinute } from "~/lib/useClock";

/* ---------------------------------------------------------------------------
   Fills — what actually executed (the recent_activity tool, the chat's
   /activity): market, direction, size at price, realised PnL and the fee,
   newest first, with the realised PnL and fees over the list totalled.

   A fill that opened a position realises nothing; it shows a dash, not $0.

   Hyperliquid knows an account by its Ethereum address. An account signed
   in with a Solana wallet has none, so instead of a dead end it is offered
   Connections, and shown what did execute in its Solana wallet: the swaps
   among its recent transactions, each opening on Solscan.
--------------------------------------------------------------------------- */

type Fill = FillsView["fills"][number];

function price(value: number): string {
  return formatPrice(value, priceDecimals(value));
}

function Pnl({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <Text variant="data" tone="muted" accessibilityLabel="No realised PnL — this fill opened or added to a position">
        —
      </Text>
    );
  }
  return <Money value={value} sign tone={value > 0 ? "positive" : value < 0 ? "negative" : "secondary"} />;
}

/** The swaps among the Solana wallet's recent transactions. */
function SolanaSwaps({ now }: { now: number }) {
  const activity = useWalletActivity(25);
  const swaps = activity.items.filter((item) => item.summary?.kind === "swap");
  return (
    <Block label="Solana swaps">
      <Text variant="h2">Your Solana swaps</Text>
      <Text variant="body-sm" tone="secondary">
        What executed in your Solana wallet, from its last 25 transactions.
      </Text>
      {activity.loading && activity.items.length === 0 ? (
        <Text variant="body-sm" tone="muted">
          Reading your transactions…
        </Text>
      ) : activity.error !== null && activity.items.length === 0 ? (
        <Text variant="body-sm" tone="negative">
          Your transactions could not be read: {activity.error}
        </Text>
      ) : swaps.length === 0 ? (
        <Text variant="body-sm" tone="muted">
          No swaps among your recent Solana transactions.
        </Text>
      ) : (
        <View>
          {swaps.map((item, index) => (
            <ActivityRow key={item.signature} item={item} now={now} first={index === 0} />
          ))}
        </View>
      )}
    </Block>
  );
}

export default function FillsScreen() {
  const fills = useAppView("fills");
  const auth = useElyraAuth();
  const now = useMinute();
  const data = fills.data;
  const totals = data === null ? null : fillTotals(data.fills);
  const unavailable = noHyperliquidWallet(fills.error, "Fills");

  const columns: DataColumn<Fill>[] = [
    { key: "at", header: "Time", width: 120, render: (row) => <Text variant="data-sm" tone="secondary">{formatTimestamp(row.at)}</Text> },
    { key: "market", header: "Market", width: 90, render: (row) => <Text variant="data">{row.symbol}</Text> },
    { key: "direction", header: "Direction", width: 110, priority: 2, render: (row) => <Text variant="label" tone="secondary">{row.direction || row.side}</Text> },
    { key: "size", header: "Size", align: "right", width: 90, render: (row) => <Text variant="data">{formatQty(row.size, row.size < 1 ? 4 : 2)}</Text> },
    { key: "price", header: "Price", align: "right", width: 90, render: (row) => <Text variant="data">{price(row.price)}</Text> },
    { key: "pnl", header: "Realised", align: "right", width: 100, render: (row) => <Pnl value={row.realisedPnl} /> },
    { key: "fee", header: "Fee", align: "right", width: 90, priority: 1, render: (row) => <Text variant="data-sm" tone="secondary">{row.fee === null ? "—" : `${row.fee} ${row.feeToken ?? ""}`.trim()}</Text> },
  ];
  const card = (row: Fill) => (
    <View style={styles.card}>
      <View style={styles.between}>
        <Text variant="data">
          {row.symbol} · {row.direction || row.side}
        </Text>
        <Pnl value={row.realisedPnl} />
      </View>
      <Text variant="label" tone="secondary">
        {formatQty(row.size, row.size < 1 ? 4 : 2)} @ {price(row.price)}
        {row.fee !== null ? ` · fee ${row.fee} ${row.feeToken ?? ""}`.trimEnd() : ""} · {formatRelativeTime(row.at, now)}
      </Text>
    </View>
  );

  return (
    <DetailScreen title="Fills" onRefresh={fills.refetch} refreshing={fills.refreshing}>
      <ReadState loading={fills.loading} error={fills.error} unavailable={unavailable} stale={fills.stale} hasData={data !== null} onRetry={fills.refetch} refreshing={fills.refreshing} />
      {data === null && unavailable !== null && auth.solanaAddress !== null && <SolanaSwaps now={now} />}
      {data !== null && totals !== null && (
        <>
          {data.fills.length > 0 && (
            <Block label="Totals">
              <View style={styles.totals}>
                <View style={styles.total}>
                  <Text variant="label" tone="muted">
                    Realised PnL · last {data.fills.length} fills
                  </Text>
                  <Money value={totals.realisedPnl} sign variant="h2" tone={totals.realisedPnl > 0 ? "positive" : totals.realisedPnl < 0 ? "negative" : "primary"} />
                </View>
                <View style={styles.total}>
                  <Text variant="label" tone="muted">
                    Fees paid
                  </Text>
                  <Text variant="h2">
                    {totals.fees.toLocaleString("en-US", { maximumFractionDigits: 4 })} {totals.feeTokens.join(" / ")}
                  </Text>
                </View>
              </View>
            </Block>
          )}
          <Block padded={false} label="Fills">
            {data.fills.length === 0 ? (
              <EmptyState title="No recent fills on Hyperliquid" body="Trades that execute there appear here with their realised PnL and fee." />
            ) : (
              <DataList label="Fills" rows={data.fills} columns={columns} getKey={(row) => `${row.at}-${row.symbol}-${row.size}-${row.price}`} card={card} />
            )}
          </Block>
          {data.unreadable.map((note) => (
            <Text key={note} variant="label" tone="muted">
              {note}
            </Text>
          ))}
        </>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  totals: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 24 },
  total: { gap: 2 },
});
