import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, BellRing, Plus } from "lucide-react-native";
import { NewPriceRuleSheet, type NewPriceRuleSheetHandle } from "~/components/alerts/NewPriceRuleSheet";
import { PriceRuleCard, ruleKey } from "~/components/alerts/PriceRuleCard";
import { FlowBar, FlowTitle, IconTile, WideButton } from "~/components/shell/flow";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Notice, outcomeHaptic } from "~/components/wallet/parts";
import { useAlerts } from "~/lib/stores/alerts";
import { useAssets, useAssetsBySymbols, usePrices, useTickerLogos } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useMinute } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Alerts & automation — the website's AutomationSection: the price rules
   Elyra watches for this account.

   Every rule is a real price alert, the same rows the asset screen's alerts
   and the website set. The server's delivery pass (Supabase pg_cron, every
   five minutes) checks each against live prices and tells the person the
   first time it finds the price at or past the level — a push and the
   inbox — then the rule goes quiet until it is re-armed. The prices on this
   screen are for reading; nothing here watches them.

   A rule acts by telling, never by trading: venue connections are
   read-only and nothing in Elyra places an order. A fired rule stays here
   until it is re-armed or removed.
--------------------------------------------------------------------------- */

export default function AutomationScreen() {
  const feed = useAlerts();
  const now = useMinute();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const builder = useRef<NewPriceRuleSheetHandle>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /* The rule just saved, until the list has scrolled to it. A re-saved
     rule keeps its row and may never lay out again, so it lapses too. */
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (saved === null) return;
    const lapse = setTimeout(() => setSaved(null), 3000);
    return () => clearTimeout(lapse);
  }, [saved]);

  /* The builder starts on the market last opened, as the website's starts
     on the chart's. */
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);
  const selectedSymbol = selected?.symbol.toUpperCase() ?? "";

  const symbols = useMemo(() => [...new Set(feed.alerts.map((alert) => alert.symbol.toUpperCase()))], [feed.alerts]);
  const { bySymbol } = useAssetsBySymbols(symbols);
  const ids = useMemo(() => [...bySymbol.values()].map((asset) => asset.id), [bySymbol]);
  const prices = usePrices(ids);
  const logos = useTickerLogos(symbols);
  const priceOf = (symbol: string) => {
    const asset = bySymbol.get(symbol.toUpperCase());
    return asset ? prices.rows.get(asset.id)?.price : undefined;
  };

  const armed = feed.alerts.filter((alert) => alert.triggeredAt === null).length;
  const shownError = feed.writeError ?? feed.error;

  const newRule = () => builder.current?.open();

  return (
    <View style={styles.screen}>
      <FlowBar back closeLabel="Back" onRefresh={feed.refetch} refreshing={feed.refreshing} />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={feed.refetch}
            tintColor={color.accent}
            colors={[color.accent]}
            progressBackgroundColor={color["surface-raised"]}
          />
        }
      >
        <FlowTitle title="Alerts & automation" subtitle="Your markets. Your rules." />

        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="body" accessibilityRole="header" style={styles.headTitle}>
              Price rules
            </Text>
            <Text variant="body" tone="secondary" style={styles.headCount}>
              {feed.loading ? "Reading your rules…" : `${armed} armed · ${feed.alerts.length} total`}
            </Text>
          </View>
          <Pressable
            onPress={newRule}
            accessibilityRole="button"
            accessibilityLabel="New rule"
            style={({ pressed }) => [styles.newRule, pressed && styles.newRulePressed]}
          >
            <Plus size={22} strokeWidth={1.75} color={color["accent-hover"]} />
            <Text variant="body" maxFontSizeMultiplier={1.3} style={styles.newRuleText}>
              New rule
            </Text>
          </Pressable>
        </View>

        {shownError !== null && (
          <View style={styles.error}>
            <Notice tone="negative">
              {shownError}
              {feed.alerts.length > 0 && feed.writeError === null ? " Showing the rules from the last good read." : ""}
            </Notice>
            {feed.writeError === null && (
              <WideButton label={feed.refreshing ? "Trying…" : "Try again"} variant="outline" busy={feed.refreshing} onPress={feed.refetch} />
            )}
          </View>
        )}

        {feed.loading ? (
          <View style={styles.list} accessibilityLabel="Loading rules">
            {[0, 1].map((index) => (
              <View key={index} style={styles.skeleton}>
                <Skeleton width={44} height={44} rounded={radius.pill} />
                <View style={styles.skeletonText}>
                  <Skeleton width="50%" />
                  <Skeleton width="70%" />
                </View>
              </View>
            ))}
          </View>
        ) : feed.alerts.length === 0 ? (
          feed.error === null && (
            <View style={styles.empty}>
              <IconTile icon={BellRing} size={56} />
              <Text variant="body" style={styles.emptyTitle}>
                No price rules yet
              </Text>
              <Text variant="body" tone="secondary" style={styles.emptyText}>
                Choose a market and a price. Elyra tells you once when it gets there.
              </Text>
              <View style={styles.emptyAction}>
                <WideButton label="Create rule" variant="accent" leading={Plus} onPress={newRule} />
              </View>
            </View>
          )
        ) : (
          <View style={styles.list}>
            {feed.alerts.map((alert, index) => {
              const fresh = saved !== null && ruleKey(alert) === saved;
              return (
                <View
                  key={alert.id}
                  onLayout={
                    fresh
                      ? (event) => {
                          const y = event.nativeEvent.layout.y;
                          setSaved(null);
                          scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: !reduced });
                        }
                      : undefined
                  }
                >
                  <PriceRuleCard
                    alert={alert}
                    price={priceOf(alert.symbol)}
                    logo={logos(alert.symbol)}
                    delivery={feed.appDelivery}
                    now={now}
                    defaultOpen={index === 0 || fresh}
                    onRearm={async () => {
                      const failure = await feed.create({
                        symbol: alert.symbol,
                        direction: alert.direction,
                        target: alert.target,
                        currentPrice: priceOf(alert.symbol) ?? null,
                      });
                      outcomeHaptic(failure === null ? "success" : "error");
                    }}
                    onRemove={() => void feed.remove(alert.id)}
                  />
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.note} accessible>
          <Bell size={28} strokeWidth={1.5} color={color["text-primary"]} />
          <View style={styles.flex}>
            <Text variant="body" style={styles.noteTitle}>
              Alerts only. No trades.
            </Text>
            <Text variant="body" tone="secondary" style={styles.noteText}>
              Fired rules stay here until you re-arm or remove them.
            </Text>
          </View>
        </View>

        <View style={styles.ornament} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.ornamentLine} />
          <Bell size={34} strokeWidth={1.25} color={color["text-secondary"]} />
          <View style={styles.ornamentLine} />
        </View>
      </ScrollView>

      <NewPriceRuleSheet ref={builder} feed={feed} initialSymbol={selectedSymbol} onSaved={setSaved} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 18 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  headTitle: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26 },
  headCount: { fontSize: 16, lineHeight: 22 },
  newRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: TOUCH_TARGET + 6,
    paddingHorizontal: 18,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["accent-hover"],
    backgroundColor: color["surface-panel"],
  },
  newRulePressed: { backgroundColor: color["surface-hover"] },
  newRuleText: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 22, color: color["accent-hover"] },
  error: { gap: 10 },
  list: { gap: 12 },
  skeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  skeletonText: { flex: 1, gap: 8 },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 28,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  emptyTitle: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24, marginTop: 8 },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  emptyAction: { alignSelf: "stretch", marginTop: 12 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  noteTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  noteText: { fontSize: 15, lineHeight: 21 },
  ornament: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingVertical: 24 },
  ornamentLine: { width: 72, height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-strong"] },
});
