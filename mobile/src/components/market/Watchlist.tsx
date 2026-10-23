import { useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Plus, SearchX } from "lucide-react-native";
import type { PythAsset, PythAssetType } from "@/lib/market/pyth/types";
import { ROW_HEIGHT, WatchRow } from "~/components/market/WatchRow";
import { Button, OptionMenu, SegmentedControl } from "~/components/ui/controls";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Notice } from "~/components/wallet/parts";
import { refreshPrices, useAssetsBySymbols, usePrices } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useWatchlist } from "~/lib/stores/watchlist";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The watchlist — the website's WatchlistWidget, synced with the account
   (/api/watchlist), so it is the same list on every surface.

   Add from search, remove, reorder (drag, or Move up / Move down), star a
   favourite, and filter by market type. The source line says where the
   prices come from and whether they are live. Pull to refresh.
--------------------------------------------------------------------------- */

type Show = "all" | "favorites";
type Kind = "any" | PythAssetType;

const KINDS: { value: Kind; label: string }[] = [
  { value: "any", label: "All types" },
  { value: "crypto", label: "Crypto" },
  { value: "equity", label: "Stocks" },
  { value: "metal", label: "Metals" },
  { value: "commodity", label: "Commodities" },
  { value: "fx", label: "FX" },
  { value: "crypto-index", label: "Indices" },
];

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function Watchlist({ header }: { header?: React.ReactElement }) {
  const watchlist = useWatchlist();
  const favorites = useAppStore((state) => state.favorites);
  const [show, setShow] = useState<Show>("all");
  const [kind, setKind] = useState<Kind>("any");
  const [reordering, setReordering] = useState(false);

  const { bySymbol, resolved } = useAssetsBySymbols(watchlist.symbols);
  const ids = useMemo(() => [...bySymbol.values()].map((asset) => asset.id), [bySymbol]);
  const feed = usePrices(ids);

  const visible = useMemo(
    () =>
      watchlist.symbols.filter((symbol) => {
        if (show === "favorites" && !favorites.includes(symbol)) return false;
        if (kind === "any") return true;
        return bySymbol.get(symbol)?.assetType === kind;
      }),
    [watchlist.symbols, show, favorites, kind, bySymbol],
  );

  const source = (
    <View style={styles.source}>
      <View
        style={[
          styles.dot,
          { backgroundColor: feed.status === "live" ? color.positive : feed.status === "error" ? color.negative : color["text-muted"] },
        ]}
      />
      <Text variant="label" tone="muted">
        {feed.status === "live" ? "Pyth live" : feed.status === "error" ? "Prices delayed" : "Connecting"} · USD
      </Text>
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {header}
      <View style={styles.headRow}>
        <Text variant="h2" accessibilityRole="header" style={styles.flex}>
          Watchlist
        </Text>
        {watchlist.symbols.length > 1 && (
          <Button
            label={reordering ? "Done" : "Reorder"}
            size="sm"
            variant={reordering ? "accent" : "ghost"}
            onPress={() => setReordering(!reordering)}
          />
        )}
        <Button
          label="Add"
          size="sm"
          icon={<Plus size={16} strokeWidth={1.5} color={color["text-primary"]} />}
          accessibilityLabel="Add a market"
          onPress={() => router.push("/search")}
        />
      </View>
      {!reordering && (
        <View style={styles.filters}>
          <View style={styles.flex}>
            <SegmentedControl<Show>
              accessibilityLabel="Show"
              value={show}
              onChange={setShow}
              choices={[
                { value: "all", label: "All markets" },
                { value: "favorites", label: "Favorites" },
              ]}
            />
          </View>
          <OptionMenu<Kind> label="Market type" value={kind} onChange={setKind} choices={KINDS} />
        </View>
      )}
      {watchlist.writeError !== null && <Notice tone="negative">{watchlist.writeError}</Notice>}
      {feed.status === "error" && feed.rows.size > 0 && (
        <Notice tone="caution">Showing the last prices Pyth returned. {feed.error ?? ""}</Notice>
      )}
    </View>
  );

  const refreshing = watchlist.refreshing && !watchlist.loading;
  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        watchlist.refetch();
        refreshPrices();
      }}
      tintColor={color.accent}
      colors={[color.accent]}
      progressBackgroundColor={color["surface-raised"]}
    />
  );

  if (reordering) {
    return (
      <ReorderList
        symbols={watchlist.symbols}
        bySymbol={bySymbol}
        header={controls}
        footer={source}
        onCommit={(order) => void watchlist.reorder(order)}
        onRemove={(symbol) => void watchlist.remove(symbol)}
      />
    );
  }

  let empty: React.ReactElement;
  if (watchlist.loading) {
    empty = (
      <View accessibilityLabel="Loading the watchlist">
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <Skeleton width={32} height={32} rounded={radius.pill} />
            <View style={styles.flex}>
              <Skeleton width={70} />
            </View>
            <Skeleton width={70} />
          </View>
        ))}
      </View>
    );
  } else if (watchlist.fetchedAt === null && watchlist.error !== null) {
    empty = (
      <EmptyState
        title="The watchlist could not be read"
        body={watchlist.error}
        action={<Button label={watchlist.refreshing ? "Retrying…" : "Try again"} size="sm" onPress={watchlist.refetch} />}
      />
    );
  } else if (watchlist.symbols.length === 0) {
    empty = (
      <EmptyState
        title="Nothing on the watchlist"
        body="Add a market to follow its live Pyth price here."
        action={<Button label="Add a market" size="sm" variant="accent" onPress={() => router.push("/search")} />}
      />
    );
  } else {
    empty = (
      <EmptyState
        icon={<SearchX size={22} strokeWidth={1.5} color={color["text-muted"]} />}
        title={show === "favorites" ? "No favourites here" : "Nothing matches that"}
        body={show === "favorites" ? "Star a market to keep it here." : "No watchlist market is of that type."}
      />
    );
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(symbol) => symbol}
      renderItem={({ item }) => {
        const asset = bySymbol.get(item);
        return (
          <WatchRow
            symbol={item}
            asset={asset}
            missing={asset === undefined && resolved.has(item)}
            row={asset ? feed.rows.get(asset.id) : undefined}
            previous={asset ? feed.previous.get(asset.id) : undefined}
            seq={feed.seq}
          />
        );
      }}
      getItemLayout={(_data, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      ListHeaderComponent={controls}
      ListEmptyComponent={empty}
      ListFooterComponent={visible.length > 0 ? source : undefined}
      refreshControl={refresh}
      contentContainerStyle={styles.content}
      style={styles.list}
    />
  );
}

/* ---- reordering ---- */

function ReorderList({
  symbols,
  bySymbol,
  header,
  footer,
  onCommit,
  onRemove,
}: {
  symbols: string[];
  bySymbol: Map<string, PythAsset>;
  header: React.ReactElement;
  footer: React.ReactElement;
  onCommit: (order: string[]) => void;
  onRemove: (symbol: string) => void;
}) {
  const [drag, setDragState] = useState<Drag | null>(null);
  /* Read on release, from the gesture's own handlers — never during render. */
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const live = drag === null ? symbols : reordered(symbols, drag);

  return (
    <ScrollView scrollEnabled={drag === null} contentContainerStyle={styles.content} style={styles.list}>
      {header}
      <Text variant="label" tone="muted" style={styles.hint}>
        Drag a handle, or use the arrows. The order is saved to your account.
      </Text>
      {live.map((symbol, index) => {
        const dragging = drag?.symbol === symbol;
        const offset = dragging && drag !== null ? drag.dy - (index - drag.from) * ROW_HEIGHT : 0;
        return (
          <View key={symbol} style={dragging ? { transform: [{ translateY: offset }], zIndex: 2 } : undefined}>
            <WatchRow
              symbol={symbol}
              asset={bySymbol.get(symbol)}
              row={undefined}
              previous={undefined}
              seq={0}
              reorder={{
                index,
                count: live.length,
                dragging,
                drag: {
                  onStart: () => setDrag({ symbol, from: symbols.indexOf(symbol), dy: 0 }),
                  onMove: (dy) => {
                    const current = dragRef.current;
                    if (current !== null) setDrag({ ...current, dy });
                  },
                  onEnd: () => {
                    const current = dragRef.current;
                    setDrag(null);
                    if (current === null) return;
                    const order = reordered(symbols, current);
                    if (order.join() !== symbols.join()) onCommit(order);
                  },
                },
                onMoveBy: (step) => onCommit(move(symbols, index, index + step)),
                onRemove: () => onRemove(symbol),
              }}
            />
          </View>
        );
      })}
      {footer}
    </ScrollView>
  );
}

interface Drag {
  symbol: string;
  from: number;
  dy: number;
}

/** The order with the dragged row where the finger has taken it. */
function reordered(symbols: readonly string[], drag: Drag): string[] {
  return move(symbols, drag.from, clamp(drag.from + Math.round(drag.dy / ROW_HEIGHT), symbols.length));
}

function clamp(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  controls: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filters: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  source: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12 },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  skeletonRow: { height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12 },
  hint: { paddingBottom: 4 },
});
