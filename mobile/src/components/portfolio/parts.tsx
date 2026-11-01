import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import { orderBalances, venueLabel, type BalanceGrouping } from "@/lib/assets/derive";
import { formatCompactUsd, formatPrice, truncateMiddle } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import type { PerpPosition, SpotHolding } from "@/lib/portfolio/types";
import { Button } from "~/components/ui/controls";
import { DataList, type DataColumn } from "~/components/ui/DataList";
import { InfoTip } from "~/components/ui/InfoTip";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta, Money, Percent, Quantity } from "~/components/ui/values";
import { Notice, SheetHeader } from "~/components/wallet/parts";
import { useBalancesHidden } from "~/lib/store";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The pieces the portfolio's screens share: the detail screen itself (a
   back header, pull to refresh, and the read's state said in words), a
   share bar, and the holdings and perps lists — cards on a phone, a table
   with column priority on a tablet.
--------------------------------------------------------------------------- */

export function DetailScreen({
  title,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  /** Omitted on a screen with nothing to read again (settings, legal). */
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <SheetHeader title={title} back closeLabel="Back" onRefresh={onRefresh} refreshing={refreshing} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={color.accent}
              colors={[color.accent]}
              progressBackgroundColor={color["surface-raised"]}
            />
          )
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** A panel on the forest: --surface-panel on a hairline. */
export function Block({ children, padded = true, label }: { children: ReactNode; padded?: boolean; label?: string }) {
  return (
    <View accessibilityLabel={label} style={[styles.block, padded && styles.blockPadded]}>
      {children}
    </View>
  );
}

/** Loading, failed or stale — the read's state, before its figures. */
export function ReadState({
  loading,
  error,
  stale,
  hasData,
  onRetry,
  refreshing,
  unavailable = null,
}: {
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasData: boolean;
  onRetry: () => void;
  refreshing: boolean;
  /** A state no retry changes — said as what it is, without a Try again. */
  unavailable?: Unavailable | null;
}): ReactNode {
  if (loading && !hasData) {
    return (
      <Block label="Loading">
        <Skeleton width="70%" />
        <Skeleton width="50%" />
        <Skeleton width="60%" />
      </Block>
    );
  }
  if (!hasData && unavailable !== null) {
    return (
      <Block>
        <EmptyState
          title={unavailable.title}
          body={unavailable.body}
          action={
            unavailable.connect ? (
              <Button label="Connect Hyperliquid" variant="accent" size="sm" onPress={() => router.push("/connections")} />
            ) : undefined
          }
        />
      </Block>
    );
  }
  if (!hasData && error !== null) {
    return (
      <Block>
        <EmptyState
          title="This couldn't be read"
          body={error}
          action={<Button label={refreshing ? "Retrying…" : "Try again"} size="sm" disabled={refreshing} onPress={onRetry} />}
        />
      </Block>
    );
  }
  if (stale && error !== null) {
    return <Notice tone="caution">Showing the last good reading — the latest refresh failed: {error}</Notice>;
  }
  return null;
}

/** A state no retry changes; `connect` offers Connections, where it can be put right. */
export interface Unavailable {
  title: string;
  body: string;
  connect?: boolean;
}

/**
 * The venue tools answer "No wallet is connected" when the account has no
 * Ethereum wallet, which is what Hyperliquid reads orders and fills by. That
 * is not a failed read, and retrying will not change it — adding a
 * Hyperliquid address in Connections does, so that is what it offers. A
 * Solana sign-in is the usual reason, and is said as such.
 */
export function noHyperliquidWallet(error: string | null, what: string): Unavailable | null {
  if (error === null || !/^No wallet is connected/i.test(error)) return null;
  return {
    title: "Hyperliquid isn't connected",
    body: `${what} come from Hyperliquid, which knows an account by its Ethereum address, and this account has none linked. Add your Hyperliquid address in Connections to see them here.`,
    connect: true,
  };
}

/** A share of a whole, as a bar. Neutral: a share is not good or bad. */
export function ShareBar({ pct }: { pct: number | null }) {
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${width}%` }]} />
    </View>
  );
}

/* ---- holdings ---- */

function UnverifiedMark() {
  return (
    <InfoTip
      label="Unverified token"
      text="Unverified mint. Shown because it is held; never counted in a total, because anyone can mint a token under a name that is already taken."
      icon={<ShieldAlert size={14} strokeWidth={1.5} color={color.negative} />}
    />
  );
}

function holdingName(holding: SpotHolding): string {
  return holding.name ?? (holding.address !== null ? truncateMiddle(holding.address, 4, 4) : holding.symbol);
}

export function HoldingsList({ holdings, grouping = "asset" }: { holdings: SpotHolding[]; grouping?: BalanceGrouping }) {
  const rows = orderBalances(holdings, grouping);
  const columns: DataColumn<SpotHolding>[] = [
    {
      key: "asset",
      header: "Asset",
      width: 180,
      render: (row) => (
        <View style={styles.assetCell}>
          <CoinMark symbol={row.symbol} logo={row.logo} size={24} />
          <Text variant="data" numberOfLines={1} style={styles.shrink}>
            {row.symbol}
          </Text>
          {!row.verified && <UnverifiedMark />}
        </View>
      ),
    },
    { key: "venue", header: "Account", width: 100, priority: 2, render: (row) => <Text variant="label" tone="secondary">{venueLabel(row.venue)}</Text> },
    { key: "qty", header: "Quantity", align: "right", width: 110, render: (row) => <Quantity value={row.quantity} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: 100,
      priority: 3,
      render: (row) => <Text variant="data">{row.priceUsd === null ? "—" : formatPrice(row.priceUsd, priceDecimals(row.priceUsd))}</Text>,
    },
    { key: "value", header: "Value", align: "right", width: 100, render: (row) => <Money value={row.valueUsd} reason={row.verified ? "No price for this token." : "Unverified tokens are never valued."} /> },
    { key: "change", header: "24h", align: "right", width: 80, priority: 1, render: (row) => <Delta pct={row.change24hPct} variant="data-sm" reason="No 24h change." /> },
    { key: "share", header: "Share", align: "right", width: 70, priority: 4, render: (row) => <Percent value={row.allocationPct} reason="Not counted." variant="data-sm" tone="secondary" /> },
  ];
  const card = (row: SpotHolding) => (
    <View style={styles.cardRow}>
      <CoinMark symbol={row.symbol} logo={row.logo} size={32} />
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Text variant="data" numberOfLines={1} style={styles.shrink}>
            {row.symbol}
          </Text>
          {!row.verified && <UnverifiedMark />}
        </View>
        <Text variant="label" tone="muted" numberOfLines={1}>
          {holdingName(row)} · {venueLabel(row.venue)}
          {row.allocationPct !== null ? ` · ${row.allocationPct.toFixed(1)}% of the portfolio` : ""}
        </Text>
      </View>
      <View style={styles.right}>
        <Money value={row.valueUsd} reason={row.verified ? "No price for this token." : "Unverified tokens are never valued."} />
        <View style={styles.inline}>
          <Quantity value={row.quantity} variant="data-sm" tone="secondary" />
          <Delta pct={row.change24hPct} variant="data-sm" reason="No 24h change." />
        </View>
      </View>
    </View>
  );
  return <DataList label="Holdings" rows={rows} columns={columns} getKey={(row) => row.id} card={card} />;
}

/* ---- perps ---- */

function priceText(value: number | null): string {
  return value === null ? "—" : formatPrice(value, priceDecimals(value));
}

function CompactMoney({ value }: { value: number }) {
  const hidden = useBalancesHidden();
  return <Text variant="data">{hidden ? "▒▒▒▒" : formatCompactUsd(value)}</Text>;
}

export function PerpsList({ positions }: { positions: PerpPosition[] }) {
  const columns: DataColumn<PerpPosition>[] = [
    { key: "market", header: "Market", width: 120, render: (row) => <Text variant="data">{row.market}</Text> },
    { key: "side", header: "Side", width: 64, render: (row) => <Text variant="label" tone={row.side === "long" ? "positive" : "negative"}>{row.side === "long" ? "Long" : "Short"}</Text> },
    { key: "size", header: "Size", align: "right", width: 90, render: (row) => <Quantity value={row.size} /> },
    { key: "entry", header: "Entry", align: "right", width: 90, priority: 2, render: (row) => <Text variant="data">{priceText(row.entryPrice)}</Text> },
    { key: "mark", header: "Mark", align: "right", width: 90, render: (row) => <Text variant="data">{priceText(row.markPrice)}</Text> },
    { key: "liq", header: "Liq. price", align: "right", width: 90, priority: 1, render: (row) => <Text variant="data">{priceText(row.liquidationPrice)}</Text> },
    { key: "lev", header: "Leverage", align: "right", width: 70, priority: 3, render: (row) => <Text variant="data">{row.leverage === null ? "—" : `${row.leverage}x`}</Text> },
    { key: "notional", header: "Notional", align: "right", width: 90, render: (row) => <CompactMoney value={row.notionalUsd} /> },
    { key: "pnl", header: "PnL", align: "right", width: 90, render: (row) => <Money value={row.unrealizedPnlUsd} sign reason="No PnL reported." tone={(row.unrealizedPnlUsd ?? 0) >= 0 ? "positive" : "negative"} /> },
  ];
  const card = (row: PerpPosition) => (
    <View style={styles.perpCard}>
      <View style={styles.between}>
        <View style={styles.inline}>
          <Text variant="data">{row.market}</Text>
          <Text variant="label" tone={row.side === "long" ? "positive" : "negative"}>
            {row.side === "long" ? "Long" : "Short"}
            {row.leverage !== null ? ` · ${row.leverage}x` : ""}
          </Text>
        </View>
        <Money value={row.unrealizedPnlUsd} sign reason="No PnL reported." tone={(row.unrealizedPnlUsd ?? 0) >= 0 ? "positive" : "negative"} />
      </View>
      <View style={styles.facts}>
        {(
          [
            ["Notional", <CompactMoney key="n" value={row.notionalUsd} />],
            ["Margin", <Money key="m" value={row.marginUsd} reason="Not reported." />],
            ["Entry", priceText(row.entryPrice)],
            ["Mark", priceText(row.markPrice)],
            ["Liq. price", priceText(row.liquidationPrice)],
            ["Venue", venueLabel(row.venue)],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.fact}>
            <Text variant="label" tone="muted">
              {label}
            </Text>
            {typeof value === "string" ? <Text variant="data">{value}</Text> : value}
          </View>
        ))}
      </View>
    </View>
  );
  return <DataList label="Perpetual positions" rows={positions} columns={columns} getKey={(row) => row.id} card={card} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  block: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  blockPadded: { padding: 16, gap: 10 },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: color["surface-hover"], overflow: "hidden" },
  fill: { height: 4, backgroundColor: color["text-secondary"] },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  between: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  right: { alignItems: "flex-end" },
  assetCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  perpCard: { gap: 8 },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  fact: { width: "33%", paddingRight: 8 },
});
