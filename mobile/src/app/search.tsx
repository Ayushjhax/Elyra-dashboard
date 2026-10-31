import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  ChartPie,
  CircleUser,
  Clock3,
  QrCode,
  Search as SearchIcon,
  Send,
  Sparkles,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react-native";
import type { PythAsset, PythAssetType } from "@/lib/market/pyth/types";
import { FilterChips } from "~/components/market/parts";
import { ActionRow, FlowBar, FlowTitle, closeFlow } from "~/components/shell/flow";
import { Button, IconButton } from "~/components/ui/controls";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { useAssets, useAssetSearch } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useWatchlist } from "~/lib/stores/watchlist";
import { fontFamily } from "~/theme/fonts";
import { color, radius, type as typeScale } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Search — the website's ⌘K palette, for a phone.

   Three kinds of answer. MARKETS: everything with a live Pyth feed, from
   /api/market/assets (debounced, and a late answer to an older query never
   replaces a newer one — useAssetSearch) — a row opens the market, its
   trailing button adds it to the watchlist or takes it off. QUICK ACTIONS:
   where to go and what to do; each opens its screen and nothing more, so no
   transfer or trade starts from here. RECENT: the last markets opened from
   here, on this phone.

   The list shrinks with the keyboard, frame by frame, so every row stays
   reachable above it, and a row takes the tap even while the keyboard is up.
--------------------------------------------------------------------------- */

type Filter = "all" | PythAssetType;

const TYPE_FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "equity", label: "Stocks" },
  { value: "metal", label: "Metals" },
  { value: "commodity", label: "Commodities" },
  { value: "fx", label: "FX" },
  { value: "crypto-index", label: "Indices" },
];

function classLabel(assetType: PythAssetType): string {
  if (assetType === "crypto-index") return "index";
  if (assetType === "commodity") return "cmdty";
  return assetType;
}

interface Action {
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  go: () => void;
}

/** Closes search, then opens where it was asked to go. */
function leaveFor(href: Href) {
  if (router.canDismiss()) router.dismiss();
  router.push(href);
}

/** Gives the list back what the keyboard covers, with the keyboard's own animation. */
function AboveKeyboard({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboard = useReanimatedKeyboardAnimation();
  const lifted = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -keyboard.height.value - insets.bottom) }));
  return <Animated.View style={[styles.fill, lifted]}>{children}</Animated.View>;
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [query, setQuery] = useState(params.q ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const [focused, setFocused] = useState(false);
  const watchlist = useWatchlist();
  const recent = useAppStore((state) => state.recentSearches);
  const addRecent = useAppStore((state) => state.addRecentSearch);
  const clearRecent = useAppStore((state) => state.clearRecentSearches);
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);

  /* Focus once the modal has finished sliding in: focusing mid-animation
     raised the keyboard over a screen that was still moving. */
  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const type = filter === "all" ? null : filter;
  const trimmed = query.trim();
  const search = useAssetSearch(query, type, trimmed.length > 0 || type !== null);
  const recentAssets = useAssets(useMemo(() => recent.map((entry) => entry.id), [recent]));

  const open = (asset: PythAsset, extra?: Record<string, string>) => {
    addRecent({ id: asset.id, symbol: asset.symbol });
    leaveFor({ pathname: "/asset/[symbol]", params: { symbol: asset.symbol, id: String(asset.id), ...extra } });
  };
  const goTo = (href: Href) => () => leaveFor(href);

  const actions: Action[] = [
    { label: "Send", hint: "Transfer to a Solana address", icon: Send, keywords: "send transfer pay", go: goTo("/transfer") },
    { label: "Swap", hint: "Via Jupiter, signed in your wallet", icon: ArrowLeftRight, keywords: "swap trade exchange convert", go: goTo("/swap") },
    { label: "Receive", hint: "Your address and QR code", icon: QrCode, keywords: "receive deposit address qr", go: goTo("/receive") },
    {
      label: "Withdraw",
      hint: "Move funds to your own address",
      icon: ArrowUpRight,
      keywords: "withdraw cash out",
      go: goTo({ pathname: "/transfer", params: { intent: "withdraw" } }),
    },
    /* The market last selected in the app — the chart's — and its alert sheet,
       opened and nothing set. Without one, the rules live in Alerts & automation. */
    selected
      ? {
          label: `Set alert on ${selected.symbol}`,
          hint: "Open price alerts",
          icon: Bell,
          keywords: "alert notify price",
          go: () => open(selected, { alert: "above" }),
        }
      : { label: "Set alert", hint: "Open price alerts", icon: Bell, keywords: "alert notify price", go: goTo("/automation") },
    { label: "Open wallet", hint: "Balances, assets and actions", icon: Wallet, keywords: "wallet balance assets", go: goTo("/wallet") },
    { label: "Portfolio", hint: "Activity and actions awaiting review", icon: ChartPie, keywords: "portfolio activity history", go: goTo("/portfolio") },
    { label: "Ask Elyra", hint: "The assistant", icon: Sparkles, keywords: "ask elyra agent assistant chat", go: goTo("/elyra") },
    { label: "Notifications", hint: "Inbox and notification settings", icon: Bell, keywords: "notifications inbox settings push", go: goTo("/notifications") },
    { label: "Account", hint: "Profile, security and sign-out", icon: CircleUser, keywords: "account settings profile sign out", go: goTo("/account") },
  ];
  const needle = trimmed.toLowerCase();
  const shownActions = needle === "" ? actions.slice(0, 6) : actions.filter((action) => `${action.label} ${action.keywords}`.toLowerCase().includes(needle));

  const showMarkets = trimmed.length > 0 || type !== null;
  const recentList = recent
    .map((entry) => recentAssets.byId.get(entry.id))
    .filter((asset): asset is PythAsset => asset !== undefined);

  const header = (
    <View style={styles.headerBlock}>
      {!showMarkets && recentList.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHead}>
            <Text variant="eyebrow" tone="secondary" style={styles.flex}>
              Recent
            </Text>
            <Button label="Clear" size="sm" variant="ghost" onPress={clearRecent} />
          </View>
          {recentList.map((asset) => (
            <Pressable
              key={asset.id}
              onPress={() => open(asset)}
              accessibilityRole="button"
              accessibilityLabel={`${asset.symbol}, ${asset.name}, recent`}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Clock3 size={18} strokeWidth={1.5} color={color["text-muted"]} />
              <CoinMark symbol={asset.symbol} logo={asset.logo} size={32} />
              <View style={styles.flex}>
                <Text variant="data" style={styles.symbol}>
                  {asset.symbol}
                </Text>
                <Text variant="body-sm" tone="muted" numberOfLines={1}>
                  {asset.name}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {shownActions.length > 0 && (
        <View style={styles.group}>
          <Text variant="eyebrow" tone="secondary">
            {needle === "" ? "Quick actions" : "Screens and actions"}
          </Text>
          {shownActions.map((action) => (
            <ActionRow key={action.label} icon={action.icon} title={action.label} hint={action.hint} onPress={action.go} />
          ))}
        </View>
      )}

      {showMarkets && (
        <Text variant="eyebrow" tone="secondary" style={styles.marketsHead}>
          Markets
        </Text>
      )}
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (showMarkets) {
    if (search.status === "error") {
      empty = <EmptyState title="Asset list unavailable" body={search.error ?? "Pyth could not be reached. Try again."} />;
    } else if (search.status === "ready") {
      empty = (
        <EmptyState
          title="Nothing matches that"
          body={trimmed ? `No Pyth feed matches "${trimmed}". Try a ticker, a company name, or a class like "metals".` : "No Pyth feed of that type."}
        />
      );
    } else {
      empty = (
        <View accessibilityLabel="Searching" style={styles.group}>
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={styles.card}>
              <Skeleton width={36} height={36} rounded={radius.pill} />
              <View style={styles.flex}>
                <Skeleton width={120} />
              </View>
            </View>
          ))}
        </View>
      );
    }
  }

  return (
    <View style={styles.screen}>
      <FlowBar closeLabel="Close search" onClose={closeFlow} />
      <View style={styles.top}>
        <FlowTitle title="Search" />
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <SearchIcon size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Assets, markets, or actions"
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            cursorColor={color.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search assets, markets and actions"
            style={styles.input}
          />
          {query.length > 0 && (
            <IconButton accessibilityLabel="Clear the search" onPress={() => setQuery("")}>
              <X size={20} strokeWidth={1.5} color={color["text-secondary"]} />
            </IconButton>
          )}
        </View>
        <FilterChips<Filter> wrap accessibilityLabel="Market type" chips={TYPE_FILTERS} value={filter} onChange={setFilter} />
      </View>

      <AboveKeyboard>
        <FlatList
          data={showMarkets ? search.assets : []}
          keyExtractor={(asset) => String(asset.id)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          renderItem={({ item: asset }) => {
            const onList = watchlist.has(asset.symbol);
            return (
              <View style={[styles.card, styles.result]}>
                <Pressable
                  onPress={() => open(asset)}
                  accessibilityRole="button"
                  accessibilityLabel={`${asset.symbol}, ${asset.name}`}
                  accessibilityHint="Opens the market"
                  style={styles.resultMain}
                >
                  <CoinMark symbol={asset.symbol} logo={asset.logo} size={36} />
                  <View style={styles.flex}>
                    <View style={styles.inline}>
                      <Text variant="data" style={styles.symbol}>
                        {asset.symbol}
                      </Text>
                      <Text variant="label" tone="muted">
                        {classLabel(asset.assetType)}
                      </Text>
                      {/* Says up front that this market has a price but no chart. */}
                      {asset.tradingViewSymbol === null && (
                        <Text variant="label" tone="muted">
                          · no chart
                        </Text>
                      )}
                    </View>
                    <Text variant="body-sm" tone="muted" numberOfLines={1}>
                      {asset.name}
                    </Text>
                  </View>
                </Pressable>
                <Button
                  label={onList ? "Remove" : "Add"}
                  size="sm"
                  variant={onList ? "ghost" : "accent"}
                  accessibilityLabel={onList ? `Remove ${asset.symbol} from the watchlist` : `Add ${asset.symbol} to the watchlist`}
                  onPress={() => void (onList ? watchlist.remove(asset.symbol) : watchlist.add(asset.symbol))}
                />
              </View>
            );
          }}
        />
      </AboveKeyboard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  fill: { flex: 1 },
  top: { gap: 16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingLeft: 18,
    paddingRight: 4,
    borderRadius: radius.sheet,
    borderWidth: 1.5,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-panel"],
  },
  fieldFocused: { borderColor: color["focus-ring"] },
  input: {
    flex: 1,
    minHeight: 52,
    color: color["text-primary"],
    /* 16px, as every field on a touch screen. */
    fontSize: 17,
    fontFamily: fontFamily("sans", typeScale.body.weight),
  },
  content: { paddingHorizontal: 20 },
  headerBlock: { gap: 8, paddingTop: 8 },
  group: { gap: 10, paddingTop: 8 },
  groupHead: { flexDirection: "row", alignItems: "center" },
  marketsHead: { paddingTop: 12, paddingBottom: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  cardPressed: { backgroundColor: color["surface-hover"] },
  result: { marginBottom: 10, paddingRight: 8 },
  resultMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  symbol: { fontSize: 16, lineHeight: 22 },
  inline: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
});
