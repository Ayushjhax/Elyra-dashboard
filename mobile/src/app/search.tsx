import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
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
   /api/market/assets — a row opens the market, its trailing button adds it
   to the watchlist or takes it off. SCREENS AND ACTIONS: where to go and
   what to do (Send, Swap, Set alert, Open wallet…). RECENT: the last markets
   opened from here, on this phone.
--------------------------------------------------------------------------- */

const TYPE_FILTERS: { value: PythAssetType | null; label: string }[] = [
  { value: null, label: "All" },
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

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(params.q ?? "");
  const [type, setType] = useState<PythAssetType | null>(null);
  const watchlist = useWatchlist();
  const recent = useAppStore((state) => state.recentSearches);
  const addRecent = useAppStore((state) => state.addRecentSearch);
  const clearRecent = useAppStore((state) => state.clearRecentSearches);
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);

  const trimmed = query.trim();
  const search = useAssetSearch(query, type, trimmed.length > 0 || type !== null);
  const recentAssets = useAssets(useMemo(() => recent.map((entry) => entry.id), [recent]));

  const open = (asset: PythAsset) => {
    addRecent({ id: asset.id, symbol: asset.symbol });
    leaveFor({ pathname: "/asset/[symbol]", params: { symbol: asset.symbol, id: String(asset.id) } });
  };
  const goTo = (href: Href) => () => leaveFor(href);

  const actions: Action[] = [
    { label: "Send", hint: "Transfer to a Solana address", icon: Send, keywords: "send transfer pay", go: goTo("/transfer") },
    { label: "Swap", hint: "Routed by Jupiter, signed in your wallet", icon: ArrowLeftRight, keywords: "swap trade exchange convert", go: goTo("/swap") },
    { label: "Receive", hint: "Your address and its QR code", icon: QrCode, keywords: "receive deposit address qr", go: goTo("/receive") },
    {
      label: "Withdraw",
      hint: "Move your funds to an address you control",
      icon: ArrowUpRight,
      keywords: "withdraw cash out",
      go: goTo({ pathname: "/transfer", params: { intent: "withdraw" } }),
    },
    {
      label: selected ? `Set alert on ${selected.symbol}` : "Set alert",
      hint: "Opens the market's price alerts",
      icon: Bell,
      keywords: "alert notify price",
      go: selected ? () => open(selected) : goTo("/"),
    },
    { label: "Open wallet", hint: "Balance, assets and actions", icon: Wallet, keywords: "wallet balance assets", go: goTo("/wallet") },
    { label: "Portfolio", hint: "Activity and actions awaiting review", icon: ChartPie, keywords: "portfolio activity history", go: goTo("/portfolio") },
    { label: "Ask Elyra", hint: "The assistant", icon: Sparkles, keywords: "ask elyra agent assistant chat", go: goTo("/elyra") },
    { label: "Notifications", hint: "Inbox and notification settings", icon: Bell, keywords: "notifications inbox settings push", go: goTo("/notifications") },
    { label: "Account", hint: "Profile, security and sign-out", icon: CircleUser, keywords: "account settings profile sign out", go: goTo("/account") },
  ];
  const needle = trimmed.toLowerCase();
  const shownActions = needle === "" ? actions.slice(0, 6) : actions.filter((action) => `${action.label} ${action.keywords}`.toLowerCase().includes(needle));

  const showMarkets = trimmed.length > 0 || type !== null;

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.chips}>
        {TYPE_FILTERS.map((filter) => {
          const active = filter.value === type;
          return (
            <Pressable
              key={filter.label}
              onPress={() => setType(filter.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={6}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text variant="data-sm" tone={active ? "on-accent" : "secondary"}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!showMarkets && recentAssets.assets.length > 0 && (
        <View style={styles.group}>
          <View style={styles.groupHead}>
            <Text variant="eyebrow" tone="muted" style={styles.flex}>
              Recent
            </Text>
            <Button label="Clear" size="sm" variant="ghost" onPress={clearRecent} />
          </View>
          {recent
            .map((entry) => recentAssets.byId.get(entry.id))
            .filter((asset): asset is PythAsset => asset !== undefined)
            .map((asset) => (
              <Pressable key={asset.id} onPress={() => open(asset)} accessibilityRole="button" style={styles.row}>
                <Clock3 size={16} strokeWidth={1.5} color={color["text-muted"]} />
                <CoinMark symbol={asset.symbol} logo={asset.logo} size={24} />
                <Text variant="data">{asset.symbol}</Text>
                <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.flex}>
                  {asset.name}
                </Text>
              </Pressable>
            ))}
        </View>
      )}

      {shownActions.length > 0 && (
        <View style={styles.group}>
          <Text variant="eyebrow" tone="muted">
            Screens and actions
          </Text>
          {shownActions.map((action) => (
            <Pressable key={action.label} onPress={action.go} accessibilityRole="button" style={styles.row}>
              <action.icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />
              <View style={styles.flex}>
                <Text variant="body">{action.label}</Text>
                <Text variant="label" tone="muted">
                  {action.hint}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showMarkets && (
        <Text variant="eyebrow" tone="muted" style={styles.marketsHead}>
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
          body={`No Pyth feed matches "${trimmed}". Try a ticker, a company name, or a class like "metals".`}
        />
      );
    } else {
      empty = (
        <View accessibilityLabel="Searching">
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={styles.row}>
              <Skeleton width={24} height={24} rounded={radius.pill} />
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <SearchIcon size={18} strokeWidth={1.5} color={color["text-muted"]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="SOL, Bitcoin, Gold, Tesla, swap…"
          placeholderTextColor={color["text-muted"]}
          selectionColor={color.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search markets, screens and actions"
          style={styles.input}
        />
        {query.length > 0 && (
          <IconButton accessibilityLabel="Clear the search" onPress={() => setQuery("")}>
            <X size={18} strokeWidth={1.5} color={color["text-muted"]} />
          </IconButton>
        )}
        <Button label="Cancel" size="sm" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>

      <FlatList
        data={showMarkets ? search.assets : []}
        keyExtractor={(asset) => String(asset.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item: asset }) => {
          const onList = watchlist.has(asset.symbol);
          return (
            <View style={styles.row}>
              <Pressable
                onPress={() => open(asset)}
                accessibilityRole="button"
                accessibilityLabel={`${asset.symbol}, ${asset.name}`}
                style={styles.rowMain}
              >
                <CoinMark symbol={asset.symbol} logo={asset.logo} size={28} />
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <Text variant="data">{asset.symbol}</Text>
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
                  <Text variant="body-sm" tone="secondary" numberOfLines={1}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  input: {
    flex: 1,
    height: 48,
    color: color["text-primary"],
    /* 16px, as every field on a touch screen. */
    fontSize: 16,
    fontFamily: fontFamily("sans", typeScale.body.weight),
  },
  content: { paddingHorizontal: 16 },
  headerBlock: { gap: 8, paddingTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: "center", backgroundColor: color["surface-raised"] },
  chipOn: { backgroundColor: color.accent },
  group: { paddingTop: 8 },
  groupHead: { flexDirection: "row", alignItems: "center" },
  marketsHead: { paddingTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52 },
  inline: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
});
