import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, ArrowUpDown, Plus, SearchX, Star } from "lucide-react-native";
import type { PythAsset, PythAssetType } from "@/lib/market/pyth/types";
import { HealthTag, SectionLabel, panel, priceHealth } from "~/components/market/parts";
import { ROW_HEIGHT, WatchRow } from "~/components/market/WatchRow";
import { Button, OptionMenu, SegmentedControl } from "~/components/ui/controls";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Notice } from "~/components/wallet/parts";
import { refreshPrices, useAssetsBySymbols, usePrices } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useWatchlist } from "~/lib/stores/watchlist";
import { fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The watchlist — the website's WatchlistWidget, synced with the account
   (/api/watchlist), so it is the same list on every surface.

   Add from search, remove, reorder (drag, or Move up / Move down), star a
   favourite, and filter by market type. The source line says where the
   prices come from and whether they are live. Pull to refresh.

   The rows sit in one bordered panel whose head carries the column names and
   Reorder. "Make it yours" appears only while nothing on the list is
   starred, and its action opens the same reorder-and-remove mode.
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

  const health = priceHealth(feed.status, feed.rows.size > 0);
  const starred = watchlist.symbols.filter((symbol) => favorites.includes(symbol)).length;
  const count = visible.length === watchlist.symbols.length ? `${visible.length} ${visible.length === 1 ? "asset" : "assets"}` : `${visible.length} of ${watchlist.symbols.length} assets`;

  const source = (
    <View style={styles.source}>
      <HealthTag health={health} />
      <Text variant="body-sm" tone="muted" style={styles.flex}>
        · Pyth · USD
      </Text>
      <Text variant="body-sm" tone="muted">
        {count}
      </Text>
    </View>
  );

  /* While nothing is starred: what the star is for, and where the list is managed. */
  const helper =
    !reordering && show === "all" && starred === 0 && watchlist.symbols.length > 0 ? (
      <View style={[panel.box, styles.helper]}>
        <View style={styles.helperRing}>
          <Star size={20} strokeWidth={1.5} color={color["text-primary"]} />
        </View>
        <Text variant="h2" style={styles.center}>
          Make it yours
        </Text>
        <Text variant="body" tone="secondary" style={styles.center}>
          Star assets to keep your favorites close.
        </Text>
        <Pressable
          onPress={() => setReordering(true)}
          accessibilityRole="button"
          accessibilityHint="Reorder or remove the markets on your watchlist"
          style={({ pressed }) => [styles.manage, pressed && { opacity: 0.7 }]}
        >
          <Text variant="body" tone="accent" style={styles.manageLabel}>
            Manage watchlist
          </Text>
          <ArrowRight size={18} strokeWidth={1.5} color={color.accent} />
        </Pressable>
      </View>
    ) : null;

  const panelHead = (
    <View style={[styles.panelHead, reordering && styles.panelHeadAlone]}>
      <Text variant="body-sm" tone="muted" style={styles.flex}>
        {reordering ? "Drag a handle, or use the arrows" : "Asset"}
      </Text>
      {!reordering && (
        <Text variant="body-sm" tone="muted">
          Price · 24h
        </Text>
      )}
      {(watchlist.symbols.length > 1 || reordering) && (
        <Pressable
          onPress={() => setReordering(!reordering)}
          accessibilityRole="button"
          accessibilityLabel={reordering ? "Done reordering" : "Reorder the watchlist"}
          style={({ pressed }) => [styles.reorder, pressed && { opacity: 0.7 }]}
        >
          {!reordering && <ArrowUpDown size={18} strokeWidth={1.5} color={color["text-secondary"]} />}
          <Text variant="body-sm" tone={reordering ? "accent" : "secondary"}>
            {reordering ? "Done" : "Reorder"}
          </Text>
        </Pressable>
      )}
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {header}
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <SectionLabel label="Your watchlist" health={health} />
          <Text variant="h1" style={styles.lede}>
            The markets you follow.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/search")}
          accessibilityRole="button"
          accessibilityLabel="Add a market"
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
        >
          <Plus size={20} strokeWidth={1.75} color={color["text-on-accent"]} />
          <Text variant="body" tone="on-accent" style={styles.addLabel} maxFontSizeMultiplier={1.3}>
            Add
          </Text>
        </Pressable>
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
      {(visible.length > 0 || reordering) && <View style={styles.panelGap}>{panelHead}</View>}
    </View>
  );

  const footer = (
    <View>
      <View style={styles.panelFoot} />
      {source}
      {helper}
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
        footer={footer}
        onCommit={(order) => void watchlist.reorder(order)}
        onRemove={(symbol) => void watchlist.remove(symbol)}
      />
    );
  }

  let empty: React.ReactElement;
  if (watchlist.loading) {
    empty = (
      <View accessibilityLabel="Loading the watchlist" style={[panel.box, styles.skeletons]}>
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <Skeleton width={40} height={40} rounded={radius.pill} />
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
      renderItem={({ item, index }) => {
        const asset = bySymbol.get(item);
        return (
          <WatchRow
            last={index === visible.length - 1}
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
      ListFooterComponent={visible.length > 0 ? footer : helper ?? undefined}
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
      {live.map((symbol, index) => {
        const dragging = drag?.symbol === symbol;
        const offset = dragging && drag !== null ? drag.dy - (index - drag.from) * ROW_HEIGHT : 0;
        return (
          <View key={symbol} style={dragging ? { transform: [{ translateY: offset }], zIndex: 2 } : undefined}>
            <WatchRow
              last={index === live.length - 1}
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
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  controls: { gap: 16, paddingBottom: 0 },
  headRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingTop: 8 },
  lede: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24, marginTop: 4 },
  add: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: radius.panel,
    backgroundColor: color["accent-hover"],
  },
  addPressed: { backgroundColor: color.accent },
  addLabel: { fontFamily: fontFamily("sans", 600), fontSize: 16, lineHeight: 22 },
  filters: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  panelGap: { paddingTop: 4 },
  panelHead: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 16,
    paddingRight: 6,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: color["border-subtle"],
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: color["surface-panel"],
  },
  panelHeadAlone: {},
  panelFoot: {
    height: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: color["border-subtle"],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
    backgroundColor: color["surface-panel"],
  },
  reorder: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
  source: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 14 },
  skeletons: { paddingHorizontal: 16, marginTop: 4 },
  skeletonRow: { height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12 },
  helper: { alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 24, marginTop: 8 },
  helperRing: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-accent"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  manage: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  manageLabel: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
});
