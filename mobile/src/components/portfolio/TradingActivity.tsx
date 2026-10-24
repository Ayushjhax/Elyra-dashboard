import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { deriveAccounts } from "@/lib/assets/derive";
import { formatCompactUsd, formatPct, formatPriceUsd, formatRelativeTime, formatTimestamp } from "@/lib/format";
import {
  ledgerHistory,
  ledgerOrders,
  ledgerPositions,
  markToLive,
  type LedgerAction,
  type LedgerEvent,
  type LedgerOrder,
  type LedgerPosition,
} from "@/lib/portfolio/ledger";
import { LEDGER_EMPTY } from "@/lib/portfolio/ledgerEmpty";
import { txExplorerUrl } from "@/lib/solana/address";
import type { LedgerTab, MarketFilter, MarketType } from "@/lib/types";
import { Button } from "~/components/ui/controls";
import { DataList, type DataColumn } from "~/components/ui/DataList";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Money, Quantity } from "~/components/ui/values";
import { Notice, openExternal } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletActivity } from "~/lib/stores/activity";
import { useAssets, useAssetsBySymbols, usePrices } from "~/lib/stores/market";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { useAppStore, useBalancesHidden } from "~/lib/store";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Trading activity — the website's TradingActivity: positions, orders and
   history, from /api/portfolio and the wallet's transaction list, marked to
   the live Pyth price between portfolio reads.

   Read-only by design: a wallet holding can be sold through the swap
   screen, which the person's wallet signs; everything on a venue is a link
   to the venue, because Elyra's connections there are read-only. Nothing
   here closes a position or cancels an order.

   On a phone each row is a card (the website's positionCard, orderCard and
   historyCard); on a tablet it is a table whose lowest-priority columns
   drop first.
--------------------------------------------------------------------------- */

const TABS: { value: LedgerTab; label: string }[] = [
  { value: "positions", label: "Positions" },
  { value: "orders", label: "Orders" },
  { value: "history", label: "History" },
];

const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "spot", label: "Spot" },
  { value: "perps", label: "Perps" },
  { value: "prediction", label: "Prediction" },
  { value: "defi", label: "DeFi" },
];

/** Left behind on a SOL sale for network fees and rent. */
const SOL_FEE_RESERVE = 0.01;

function inFilter(market: MarketType, filter: MarketFilter): boolean {
  return filter === "all" || market === filter;
}

function venueLabel(venue: string): string {
  if (venue === "okx") return "OKX";
  return venue.charAt(0).toUpperCase() + venue.slice(1);
}

function price(value: number | null): string | null {
  return value === null ? null : formatPriceUsd(value);
}

function SideBadge({ side }: { side: "long" | "short" | "buy" | "sell" }) {
  const positive = side === "long" || side === "buy";
  return (
    <View style={[styles.badge, { backgroundColor: positive ? color["positive-bg"] : color["negative-bg"] }]}>
      <Text variant="label" tone={positive ? "positive" : "negative"}>
        {side.charAt(0).toUpperCase() + side.slice(1)}
      </Text>
    </View>
  );
}

function PositionKind({ row }: { row: LedgerPosition }) {
  if (row.side !== null) return <SideBadge side={row.side} />;
  return (
    <Text variant="label" tone="secondary">
      {row.category ? row.category.charAt(0).toUpperCase() + row.category.slice(1) : "Spot"}
    </Text>
  );
}

/** One labelled figure on a card; null leaves it out, so a card is never a row of dashes. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null) return null;
  return (
    <View style={styles.fact}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text variant="data" numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/** What a row offers: Sell (a wallet holding, signed in the wallet) or the venue's own page. */
function Action({ action, canSign }: { action: LedgerAction; canSign: boolean }) {
  if (action === null) return null;
  if (action.kind === "swap") {
    const amount = action.symbol === "SOL" ? Math.max(0, action.quantity - SOL_FEE_RESERVE) : action.quantity;
    return (
      <Button
        label="Sell"
        size="sm"
        disabled={!canSign}
        accessibilityLabel={`Sell ${action.symbol} for USDC, signed in your wallet`}
        onPress={() =>
          router.push({ pathname: "/swap", params: { from: action.symbol, to: "USDC", amount: amount.toFixed(9).replace(/\.?0+$/, "") } })
        }
      />
    );
  }
  if (action.href === null) return null;
  const href = action.href;
  return (
    <Button
      label={venueLabel(action.venue)}
      size="sm"
      variant="ghost"
      icon={<ExternalLink size={13} strokeWidth={1.5} color={color["text-secondary"]} />}
      accessibilityLabel={`Open on ${venueLabel(action.venue)} — Elyra's connection there is read-only`}
      onPress={() => openExternal(href)}
    />
  );
}

function Pnl({ usd, pct }: { usd: number | null; pct: number | null }) {
  const tone = usd !== null && usd > 0 ? "positive" : usd !== null && usd < 0 ? "negative" : "secondary";
  return (
    <View style={styles.pnl}>
      <Money value={usd} sign tone={tone} reason="The venue has not reported a PnL for this position." />
      {pct !== null && (
        <Text variant="data-sm" tone={tone}>
          {formatPct(pct)}
        </Text>
      )}
    </View>
  );
}

function MaskedCompact({ value }: { value: number | null }) {
  const hidden = useBalancesHidden();
  if (value === null) return null;
  return <Text variant="data">{hidden ? "▒▒▒▒" : formatCompactUsd(value)}</Text>;
}

export function TradingActivity({ feed, limit = 5 }: { feed: PortfolioFeed; limit?: number }) {
  const auth = useElyraAuth();
  const marketType = useAppStore((state) => state.marketType);
  const setMarketType = useAppStore((state) => state.setMarketType);
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const [tab, setTab] = useState<LedgerTab>("positions");
  const now = useMinute();
  const wallet = useWalletActivity(25);
  const selectedSymbol = useAssets([selectedAssetId]).byId.get(selectedAssetId)?.symbol.toUpperCase() ?? "";
  const snapshot = feed.snapshot;
  const canSign = auth.solanaAddress !== null;
  const perpAccount = useMemo(() => snapshot === null ? null : deriveAccounts(snapshot).find((account) => account.id === "hyperliquid") ?? null, [snapshot]);

  const basePositions = useMemo(() => (snapshot === null ? [] : ledgerPositions(snapshot)), [snapshot]);
  const symbols = useMemo(() => [...new Set(basePositions.map((row) => row.symbol))], [basePositions]);
  const { bySymbol } = useAssetsBySymbols(symbols);
  const prices = usePrices(useMemo(() => [...bySymbol.values()].map((asset) => asset.id), [bySymbol]));

  /* The selected market comes first in every tab. */
  const selectedFirst = useCallback(
    <T extends { symbol: string }>(rows: T[]) => [
      ...rows.filter((row) => row.symbol === selectedSymbol),
      ...rows.filter((row) => row.symbol !== selectedSymbol),
    ],
    [selectedSymbol],
  );

  const allPositions = useMemo(
    () =>
      basePositions.map((row) => {
        const asset = bySymbol.get(row.symbol);
        return markToLive(row, asset ? prices.rows.get(asset.id)?.price : undefined);
      }),
    [basePositions, bySymbol, prices],
  );
  const allOrders = useMemo(() => (snapshot === null ? [] : ledgerOrders(snapshot)), [snapshot]);
  const allHistory = useMemo(() => ledgerHistory(snapshot, wallet.items, txExplorerUrl), [snapshot, wallet.items]);

  const positions = useMemo(() => selectedFirst(allPositions.filter((row) => inFilter(row.market, marketType))), [allPositions, marketType, selectedFirst]);
  const orders = useMemo(() => selectedFirst(allOrders.filter((row) => inFilter(row.market, marketType))), [allOrders, marketType, selectedFirst]);
  const history = useMemo(() => allHistory.filter((row) => inFilter(row.market, marketType)), [allHistory, marketType]);
  const counts: Record<LedgerTab, number> = { positions: positions.length, orders: orders.length, history: history.length };

  const eventTime = (row: LedgerEvent) => (row.at === null ? "Pending" : formatRelativeTime(row.at, now));

  /* ---- columns, for a tablet ---- */
  const positionColumns: DataColumn<LedgerPosition>[] = [
    { key: "market", header: "Market", width: 140, render: (row) => <Text variant="data" numberOfLines={1}>{row.label}</Text> },
    { key: "side", header: "Side", width: 70, render: (row) => <PositionKind row={row} /> },
    { key: "size", header: "Size", align: "right", width: 90, render: (row) => row.size === null ? <Text variant="data" tone="muted">—</Text> : <Quantity value={row.size} /> },
    { key: "entry", header: "Entry", align: "right", width: 90, priority: 2, render: (row) => <Text variant="data">{price(row.entryPrice) ?? "—"}</Text> },
    { key: "mark", header: "Mark", align: "right", width: 90, render: (row) => <Text variant="data">{price(row.markPrice) ?? "—"}</Text> },
    { key: "liq", header: "Liq. price", align: "right", width: 90, priority: 1, render: (row) => <Text variant="data">{price(row.liquidationPrice) ?? "—"}</Text> },
    { key: "value", header: "Value", align: "right", width: 90, render: (row) => (row.valueUsd === null ? <Text variant="data" tone="muted">—</Text> : <MaskedCompact value={row.valueUsd} />) },
    { key: "pnl", header: "PnL", align: "right", width: 100, render: (row) => <Pnl usd={row.pnlUsd} pct={row.pnlPct} /> },
    { key: "action", header: "", align: "right", width: 90, render: (row) => <Action action={row.action} canSign={canSign} /> },
  ];
  const orderColumns: DataColumn<LedgerOrder>[] = [
    { key: "time", header: "Time", width: 110, render: (row) => <Text variant="data-sm" tone="secondary">{formatTimestamp(row.createdAt)}</Text> },
    { key: "market", header: "Market", width: 130, render: (row) => <Text variant="data" numberOfLines={1}>{row.label}</Text> },
    { key: "type", header: "Type", width: 72, priority: 1, render: (row) => <Text variant="label" tone="secondary">{row.type}</Text> },
    { key: "side", header: "Side", width: 64, render: (row) => <SideBadge side={row.side} /> },
    { key: "price", header: "Price", align: "right", width: 90, render: (row) => <Text variant="data">{price(row.priceUsd) ?? "—"}</Text> },
    { key: "size", header: "Size", align: "right", width: 90, render: (row) => <Quantity value={row.quantity} /> },
    { key: "filled", header: "Filled", align: "right", width: 60, priority: 2, render: (row) => <Text variant="data">{formatPct(row.filledPct, { sign: false, decimals: 0 })}</Text> },
    { key: "status", header: "Status", width: 76, render: (row) => <Text variant="label" tone="secondary">{row.status}</Text> },
    { key: "action", header: "", align: "right", width: 100, render: (row) => <Action action={row.action} canSign={false} /> },
  ];
  const historyColumns: DataColumn<LedgerEvent>[] = [
    { key: "time", header: "Time", width: 100, render: (row) => <Text variant="data-sm" tone="secondary">{eventTime(row)}</Text> },
    { key: "summary", header: "Activity", width: 260, render: (row) => <Text variant="body-sm" numberOfLines={2}>{row.summary}</Text> },
    { key: "venue", header: "Venue", width: 90, priority: 1, render: (row) => <Text variant="label" tone="secondary">{venueLabel(row.venue)}</Text> },
    { key: "status", header: "Status", width: 84, render: (row) => <Text variant="label" tone={row.status === "failed" ? "negative" : "secondary"}>{row.status}</Text> },
    { key: "link", header: "", align: "right", width: 70, render: (row) => <EventLink href={row.href} /> },
  ];

  /* ---- cards, for a phone ---- */
  const positionCard = (row: LedgerPosition) => {
    const perp = snapshot?.perps.find((entry) => `perp:${entry.id}` === row.id);
    const logo = snapshot?.spot.find((entry) => entry.symbol.toUpperCase() === row.symbol && entry.verified)?.logo ?? null;
    return (
    <View style={[styles.cardBody, row.symbol === selectedSymbol && styles.selected]}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <CoinMark symbol={row.symbol} logo={logo} size={32} />
          <View style={styles.flex}>
            <Text variant="h2" numberOfLines={2}>{row.market === "perps" ? `${row.symbol}-PERP` : row.label.split(" · ")[0]}</Text>
            <View style={styles.kindRow}>
              <PositionKind row={row} />
              {perp?.leverage !== null && perp?.leverage !== undefined && <Text variant="data-sm" tone="secondary">{perp.leverage}×</Text>}
            </View>
          </View>
        </View>
        <View style={styles.pnl}>
          <Text variant="label" tone="muted">{row.market === "perps" ? "Open PnL" : "Value"}</Text>
          {row.market === "perps" ? <Pnl usd={row.pnlUsd} pct={row.pnlPct} /> : <Money value={row.valueUsd} reason="This position could not be valued." />}
        </View>
      </View>
      <View style={styles.facts}>
        {row.market === "perps" && <Fact label="Notional" value={row.valueUsd === null ? null : <MaskedCompact value={row.valueUsd} />} />}
        <Fact label="Size" value={row.size === null ? null : <Quantity value={row.size} />} />
        <Fact label="Entry" value={price(row.entryPrice)} />
        <Fact label="Mark" value={price(row.markPrice)} />
        <Fact label="Liq. price" value={price(row.liquidationPrice)} />
        {row.market === "perps" && <Fact label="Margin" value={row.marginUsd === null ? null : <Money value={row.marginUsd} />} />}
      </View>
      <View style={styles.cardAction}>
        <Text variant="label" tone="muted">{venueLabel(row.venue)}</Text>
        <Action action={row.action} canSign={canSign} />
      </View>
    </View>
    );
  };
  const orderCard = (row: LedgerOrder) => (
    <View style={[styles.cardBody, row.symbol === selectedSymbol && styles.selected]}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <Text variant="data" numberOfLines={1} style={styles.shrink}>
            {row.label}
          </Text>
          <SideBadge side={row.side} />
        </View>
        <Text variant="data-sm" tone="secondary">
          {formatTimestamp(row.createdAt)}
        </Text>
      </View>
      <View style={styles.facts}>
        <Fact label="Type" value={row.type} />
        <Fact label="Price" value={price(row.priceUsd)} />
        <Fact label="Size" value={<Quantity value={row.quantity} />} />
        <Fact label="Filled" value={formatPct(row.filledPct, { sign: false, decimals: 0 })} />
        <Fact label="Status" value={row.status} />
      </View>
      {row.action !== null && (
        <View style={styles.cardAction}>
          <Action action={row.action} canSign={false} />
        </View>
      )}
    </View>
  );
  const historyCard = (row: LedgerEvent) => (
    <View style={styles.historyCard}>
      <View style={styles.flex}>
        <Text variant="data" numberOfLines={2}>
          {row.summary}
        </Text>
        <Text variant="label" tone="secondary">
          {eventTime(row)} · {venueLabel(row.venue)} ·{" "}
          <Text variant="label" tone={row.status === "failed" ? "negative" : row.status === "pending" ? "muted" : "secondary"}>
            {row.status}
          </Text>
        </Text>
      </View>
      <EventLink href={row.href} />
    </View>
  );

  /* ---- what is shown ---- */
  const ordersMissing = snapshot?.notes.find((note) => note.scope === "orders" && note.kind === "missing");
  const failedNotes = snapshot?.notes.filter((note) => note.kind === "failed") ?? [];
  const prediction = snapshot?.prediction;

  let body: React.ReactNode;
  if (feed.loading && snapshot === null) {
    body = (
      <View style={styles.padded} accessibilityLabel="Loading trading activity">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height={18} />
        ))}
      </View>
    );
  } else if (snapshot === null) {
    body = (
      <View style={styles.padded}>
      <EmptyState
        title={feed.unconfigured ? "Balances are not configured" : "Your accounts could not be read"}
        body={feed.error ?? "Try again in a moment."}
        action={<Button label="Try again" size="sm" onPress={feed.refetch} />}
      />
      </View>
    );
  } else if (tab === "positions" && marketType === "prediction" && prediction) {
    body = (
      <View style={styles.padded}>
      <EmptyState
        title={
          prediction.connected
            ? `${prediction.activeMarkets ?? 0} active prediction ${prediction.activeMarkets === 1 ? "market" : "markets"}`
            : "Prediction markets are not connected"
        }
        body={
          prediction.connected
            ? "Each position is listed under Research → Prediction markets."
            : (prediction.unavailableReason ?? "Elyra cannot see prediction positions for this account.")
        }
      />
      {prediction.connected && <View style={styles.facts}>
        <Fact label="Value at mark" value={<Money value={prediction.valueUsd} reason="Prediction value is unavailable." />} />
        <Fact label="Open PnL" value={<Money value={prediction.unrealisedPnlUsd} sign reason="Prediction PnL is unavailable." />} />
      </View>}
      </View>
    );
  } else if (tab === "positions" && positions.length > 0) {
    body = <DataList label="Open positions" rows={positions.slice(0, limit)} columns={positionColumns} getKey={(row) => row.id} card={positionCard} />;
  } else if (tab === "orders" && orders.length > 0) {
    body = <DataList label="Resting orders" rows={orders.slice(0, limit)} columns={orderColumns} getKey={(row) => row.id} card={orderCard} />;
  } else if (tab === "history" && history.length > 0) {
    body = <DataList label="Account history" rows={history.slice(0, limit)} columns={historyColumns} getKey={(row) => row.id} card={historyCard} />;
  } else if (tab === "positions" && marketType === "perps" && perpAccount !== null && (perpAccount.connection !== "connected" || perpAccount.status === "error")) {
    const failed = perpAccount.status === "error";
    body = <EmptyState
      title={failed ? "Perps could not be read" : "Connect your perps account"}
      body={failed ? perpAccount.errorReason ?? "The latest venue read failed." : "Connect Hyperliquid to see perpetual positions, margin, liquidation prices and open PnL here."}
      action={<Button label={failed ? "Try again" : "Manage connections"} size="sm" onPress={failed ? feed.refetch : () => router.push("/connections")} />}
    />;
  } else if (tab === "history" && wallet.loading) {
    body = (
      <View style={styles.padded} accessibilityLabel="Loading history">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height={18} />
        ))}
      </View>
    );
  } else {
    const copy =
      tab === "orders" && ordersMissing && marketType !== "defi"
        ? { title: "Open orders are not read yet", body: `${ordersMissing.reason} Positions and balances on your connected venues are.` }
        : tab === "history" && wallet.error !== null
          ? { title: "Transactions could not be read", body: wallet.error }
          : LEDGER_EMPTY[tab][marketType];
    /* The web's empty copy points at the website's Agent page for venues; on
       the phone the place is Account. */
    body = <EmptyState title={copy.title} body={copy.body.replace("Connect a venue from Agent.", "Connect a venue from Account.")} />;
  }

  return (
    <View accessibilityLabel="Trading activity" style={styles.section}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((entry) => {
          const active = entry.value === tab;
          return (
            <Pressable
              key={entry.value}
              onPress={() => setTab(entry.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${entry.label}${snapshot !== null ? `, ${counts[entry.value]}` : ""}`}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text variant="label" tone={active ? "primary" : "secondary"}>
                {entry.label}
              </Text>
              {snapshot !== null && (
                <Text variant="data-sm" tone="muted">
                  {counts[entry.value]}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Market type">
        {FILTERS.map((filter) => {
          const active = filter.value === marketType;
          return (
            <Pressable
              key={filter.value}
              onPress={() => setMarketType(filter.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[styles.filter, active && styles.filterActive]}
            >
              <Text variant="label" tone={active ? "primary" : "secondary"}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selectedSymbol !== "" && snapshot !== null && tab !== "history" && (
        <Text variant="label" tone="muted" style={styles.hint}>
          {selectedSymbol} rows first
        </Text>
      )}
      {failedNotes.length > 0 && (
        <View style={styles.padded}>
          <Notice tone="caution">Incomplete — {failedNotes.map((note) => `${note.scope}: ${note.reason}`).join(" · ")}</Notice>
        </View>
      )}
      {body}
      {counts[tab] > limit && <View style={styles.more}>
        <Text variant="label" tone="muted">Showing {limit} of {counts[tab]}</Text>
        <Button label={tab === "positions" ? "All accounts" : tab === "orders" ? "All orders" : "All activity"} variant="ghost" size="sm" onPress={() => router.push(tab === "positions" ? "/capital" : tab === "orders" ? "/orders" : "/activity")} />
      </View>}
    </View>
  );
}

function EventLink({ href }: { href: string | null }) {
  if (href === null) return null;
  return (
    <Button
      label="View"
      size="sm"
      variant="ghost"
      icon={<ExternalLink size={13} strokeWidth={1.5} color={color["text-secondary"]} />}
      accessibilityLabel="View on the explorer or venue"
      onPress={() => openExternal(href)}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"], paddingHorizontal: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, height: 48, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: color.accent },
  filters: { flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
  filter: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  filterActive: { backgroundColor: color["surface-hover"], borderColor: color["border-accent"] },
  hint: { paddingHorizontal: 16, paddingBottom: 6 },
  padded: { padding: 16, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  badge: { borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  cardBody: { gap: 12 },
  selected: { marginHorizontal: -16, marginVertical: -12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: color["surface-raised"] },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  cardTitle: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  kindRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  fact: { width: "50%", paddingRight: 8 },
  cardAction: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  more: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: 1, borderTopColor: color["border-subtle"] },
  pnl: { alignItems: "flex-end" },
  historyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
