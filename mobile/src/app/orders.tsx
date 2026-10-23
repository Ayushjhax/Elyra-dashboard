import { StyleSheet, View } from "react-native";
import { formatPrice, formatQty, formatTimestamp } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { venueUrl } from "@/lib/portfolio/ledger";
import type { OrdersView } from "@/lib/portfolio/views";
import { Block, DetailScreen, noHyperliquidWallet, ReadState } from "~/components/portfolio/parts";
import { Button } from "~/components/ui/controls";
import { DataList, type DataColumn } from "~/components/ui/DataList";
import { EmptyState } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { useAppView } from "~/lib/stores/portfolioViews";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Orders — what is resting on a venue (the open_orders tool, the chat's
   /orders): market, side, size at the limit price, type, trigger and
   reduce-only.

   Read-only. An order is managed on its venue, which a row links to;
   nothing here places, changes or cancels one. A venue Elyra cannot read is
   named, because "no orders" there would be a claim nobody checked.
--------------------------------------------------------------------------- */

type Order = OrdersView["orders"][number];

function price(value: number | null): string {
  return value === null ? "—" : formatPrice(value, priceDecimals(value));
}

function Side({ side }: { side: string }) {
  const buy = side === "buy";
  return (
    <View style={[styles.badge, { backgroundColor: buy ? color["positive-bg"] : color["negative-bg"] }]}>
      <Text variant="label" tone={buy ? "positive" : "negative"}>
        {buy ? "Buy" : "Sell"}
      </Text>
    </View>
  );
}

function VenueLink({ order }: { order: Order }) {
  const href = venueUrl(order.venue, order.symbol);
  if (href === null) return null;
  return (
    <Button
      label="Manage on Hyperliquid"
      size="sm"
      variant="ghost"
      accessibilityLabel={`Manage ${order.symbol} on ${order.venue} — Elyra's connection there is read-only`}
      onPress={() => openExternal(href)}
    />
  );
}

export default function OrdersScreen() {
  const orders = useAppView("orders");
  const data = orders.data;

  const columns: DataColumn<Order>[] = [
    { key: "time", header: "Placed", width: 120, priority: 2, render: (row) => <Text variant="data-sm" tone="secondary">{formatTimestamp(row.placedAt)}</Text> },
    { key: "market", header: "Market", width: 100, render: (row) => <Text variant="data">{row.symbol}</Text> },
    { key: "side", header: "Side", width: 64, render: (row) => <Side side={row.side} /> },
    { key: "size", header: "Size", align: "right", width: 90, render: (row) => <Text variant="data">{formatQty(row.size, row.size < 1 ? 4 : 2)}</Text> },
    { key: "price", header: "Limit", align: "right", width: 90, render: (row) => <Text variant="data">{price(row.limitPrice)}</Text> },
    { key: "type", header: "Type", width: 90, priority: 1, render: (row) => <Text variant="label" tone="secondary">{row.orderType}{row.reduceOnly ? " · reduce-only" : ""}</Text> },
    { key: "trigger", header: "Trigger", align: "right", width: 90, priority: 3, render: (row) => <Text variant="data">{row.triggerPrice === null ? "—" : price(row.triggerPrice)}</Text> },
    { key: "link", header: "", align: "right", width: 170, render: (row) => <VenueLink order={row} /> },
  ];
  const card = (row: Order) => (
    <View style={styles.card}>
      <View style={styles.between}>
        <View style={styles.inline}>
          <Text variant="data">{row.symbol}</Text>
          <Side side={row.side} />
        </View>
        <Text variant="data">
          {formatQty(row.size, row.size < 1 ? 4 : 2)} @ {price(row.limitPrice)}
        </Text>
      </View>
      <Text variant="label" tone="secondary">
        {row.orderType}
        {row.triggerPrice !== null ? ` · trigger ${price(row.triggerPrice)}` : ""}
        {row.reduceOnly ? " · reduce-only" : ""} · {row.venue} · {formatTimestamp(row.placedAt)}
      </Text>
      <VenueLink order={row} />
    </View>
  );

  return (
    <DetailScreen title="Orders" onRefresh={orders.refetch} refreshing={orders.refreshing}>
      <ReadState loading={orders.loading} error={orders.error} unavailable={noHyperliquidWallet(orders.error, "Open orders")} stale={orders.stale} hasData={data !== null} onRetry={orders.refetch} refreshing={orders.refreshing} />
      {data !== null && (
        <>
          <Block padded={false} label="Resting orders">
            {data.orders.length === 0 ? (
              <EmptyState title="Nothing resting on Hyperliquid" body="Limit and trigger orders you place there appear here." />
            ) : (
              <DataList label="Resting orders" rows={data.orders} columns={columns} getKey={(row) => `${row.symbol}-${row.placedAt}-${row.limitPrice}`} card={card} />
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
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: { borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
});
