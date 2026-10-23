import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { ChevronDown, ChevronUp, GripVertical, Star, Trash2 } from "lucide-react-native";
import { formatPriceUsd } from "@/lib/format";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import { PriceFlash } from "~/components/market/PriceFlash";
import { IconButton } from "~/components/ui/controls";
import { CoinMark } from "~/components/ui/marks";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { directionOf } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One market on the watchlist — the website's WatchRow, for a finger: the
   mark, the ticker and name, the live price at the instrument's precision
   with its tick flash, the 24h move, and the star.

   In reorder mode the row grows a drag handle and Move up / Move down — the
   buttons are the same reorder for anyone who cannot drag, and for a screen
   reader — and Remove.
--------------------------------------------------------------------------- */

export const ROW_HEIGHT = 64;

export interface DragHandlers {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
}

export function WatchRow({
  symbol,
  asset,
  missing = false,
  row,
  previous,
  seq,
  reorder = null,
}: {
  symbol: string;
  asset: PythAsset | undefined;
  /** The catalogue answered and has no such market. */
  missing?: boolean;
  row: PriceRow | undefined;
  previous: number | undefined;
  seq: number;
  reorder?: {
    index: number;
    count: number;
    drag: DragHandlers;
    onMoveBy: (step: -1 | 1) => void;
    onRemove: () => void;
    dragging: boolean;
  } | null;
}) {
  const favorite = useAppStore((state) => state.favorites.includes(symbol));
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const name = asset?.name ?? (missing ? "Not in the Pyth catalogue" : null);

  const identity = (
    <>
      <CoinMark symbol={symbol} logo={asset?.logo ?? null} size={32} />
      <View style={styles.names}>
        <Text variant="data" numberOfLines={1}>
          {symbol}
        </Text>
        {name !== null ? (
          <Text variant="label" tone="muted" numberOfLines={1}>
            {name}
          </Text>
        ) : (
          <Skeleton width={80} height={12} />
        )}
      </View>
    </>
  );

  const body = (
    <>
      {identity}
      <View style={styles.figures}>
        {row ? (
          <PriceFlash seq={seq} direction={directionOf(row, previous)}>
            <Text variant="data" maxFontSizeMultiplier={1.3}>
              {formatPriceUsd(row.price)}
            </Text>
          </PriceFlash>
        ) : (
          <Skeleton width={64} />
        )}
        {/* No 24h window from the exchanges: a dash, never an invented figure. */}
        <View style={styles.delta}>
          <Delta pct={row?.change24hPct ?? null} variant="data-sm" reason="No 24h change for this market." />
        </View>
      </View>
    </>
  );

  if (reorder !== null) {
    return (
      <View style={[styles.row, reorder.dragging && styles.dragging]}>
        <DragHandle handlers={reorder.drag} label={symbol} />
        {/* No prices while reordering: the row's room goes to the controls. */}
        {identity}
        <IconButton accessibilityLabel={`Move ${symbol} up`} disabled={reorder.index === 0} onPress={() => reorder.onMoveBy(-1)}>
          <ChevronUp size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
        <IconButton
          accessibilityLabel={`Move ${symbol} down`}
          disabled={reorder.index === reorder.count - 1}
          onPress={() => reorder.onMoveBy(1)}
        >
          <ChevronDown size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
        <IconButton accessibilityLabel={`Remove ${symbol} from the watchlist`} onPress={reorder.onRemove}>
          <Trash2 size={17} strokeWidth={1.5} color={color.negative} />
        </IconButton>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.push({ pathname: "/asset/[symbol]", params: { symbol, ...(asset ? { id: String(asset.id) } : {}) } })}
        accessibilityRole="button"
        accessibilityLabel={`${symbol}${name ? `, ${name}` : ""}${row ? `, ${formatPriceUsd(row.price)}` : ""}`}
        accessibilityHint="Opens the chart"
        android_ripple={{ color: color["surface-hover"] }}
        style={styles.main}
      >
        {body}
      </Pressable>
      <IconButton
        accessibilityLabel={favorite ? `Remove ${symbol} from favourites` : `Add ${symbol} to favourites`}
        onPress={() => toggleFavorite(symbol)}
      >
        <Star size={17} strokeWidth={1.5} color={favorite ? color.accent : color["text-muted"]} fill={favorite ? color.accent : "none"} />
      </IconButton>
    </View>
  );
}

function DragHandle({ handlers, label }: { handlers: DragHandlers; label: string }) {
  /* On the JS thread: the list's order is React state, and a watchlist is at
     most fifty rows. */
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 2,
    onActivate: () => handlers.onStart(),
    onUpdate: (event) => handlers.onMove(event.translationY),
    onFinalize: () => handlers.onEnd(),
  });
  return (
    <GestureDetector gesture={pan}>
      <View accessible accessibilityLabel={`Drag to reorder ${label}`} style={styles.handle}>
        <GripVertical size={18} strokeWidth={1.5} color={color["text-muted"]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  dragging: { backgroundColor: color["surface-raised"], borderRadius: radius.card, zIndex: 2, elevation: 2 },
  main: { flex: 1, height: "100%", flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 4 },
  names: { flex: 1, minWidth: 0 },
  figures: { alignItems: "flex-end", flexShrink: 0 },
  delta: { paddingHorizontal: 4 },
  handle: { width: 36, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
});
