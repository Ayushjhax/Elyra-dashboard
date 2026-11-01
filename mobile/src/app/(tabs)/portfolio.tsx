import { Text as NativeText, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { Activity, ChevronRight, Coins, Database, History, Layers, ListOrdered, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react-native";
import { ReviewCards } from "~/components/actions/ReviewCards";
import { ActionBar } from "~/components/portfolio/ActionBar";
import { OverviewCard } from "~/components/portfolio/Overview";
import { TradingActivity } from "~/components/portfolio/TradingActivity";
import { Text } from "~/components/ui/Text";
import { refetchActivity } from "~/lib/stores/activity";
import { refreshPrices } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { usePortfolio } from "~/lib/stores/portfolio";
import { refetchWallet } from "~/lib/stores/wallet";
import { DISPLAY_SERIF } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Portfolio — the account across every venue.

   The overview first (the website's OverviewStrip, with every figure the
   chat's /portfolio and the Mini App's Overview showed), the four capital
   actions and anything awaiting review, then the detail screens — Capital
   accounts, Holdings, Risk, DeFi, Orders, Fills, Wallet activity — and the
   trading activity itself.

   One snapshot (/api/portfolio) feeds all of it through the shared store,
   so the overview, the ledger and the detail screens never disagree. Pull
   to refresh reads everything again.
--------------------------------------------------------------------------- */

const DETAILS: { href: Href; label: string; note: string; icon: LucideIcon }[] = [
  { href: "/capital", label: "Capital accounts", note: "Equity, allocation, venues and balances", icon: Database },
  { href: "/holdings", label: "Holdings", note: "Every token, with its value and share", icon: Coins },
  { href: "/risk", label: "Risk", note: "Exposure and concentration across venues", icon: ShieldAlert },
  { href: "/defi", label: "DeFi", note: "Lending, leverage and vaults, with liquidation headroom", icon: Layers },
  { href: "/orders", label: "Orders", note: "What is resting on a venue", icon: ListOrdered },
  { href: "/fills", label: "Fills", note: "What executed, with realised PnL", icon: History },
  { href: "/activity", label: "Wallet activity", note: "The wallet's transactions", icon: Activity },
];

export default function PortfolioScreen() {
  const feed = usePortfolio();
  const setAgentTab = useAppStore((state) => state.setAgentTab);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            feed.refetch();
            void refetchWallet();
            void refetchActivity();
            refreshPrices();
          }}
          tintColor={color.accent}
          colors={[color.accent]}
          progressBackgroundColor={color["surface-raised"]}
        />
      }
    >
      <OverviewCard feed={feed} />
      <ActionBar compact />
      <ReviewCards />

      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.serif}>Positions &amp; activity</NativeText>
      <TradingActivity feed={feed} />

      <Pressable
        onPress={() => {
          setAgentTab("capital-intelligence");
          router.push("/(tabs)/elyra");
        }}
        accessibilityRole="button"
        accessibilityLabel="Ask Elyra about this portfolio"
        style={styles.ask}
      >
        <Sparkles size={20} strokeWidth={1.5} color={color.accent} />
        <View style={styles.flex}>
          <Text variant="h2">Ask about this portfolio</Text>
          <Text variant="label" tone="secondary">Answers with your account as context</Text>
        </View>
        <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
      </Pressable>

      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.serif}>Explore your portfolio</NativeText>
      <View style={styles.links} accessibilityLabel="Portfolio details">
        {DETAILS.map((entry) => (
          <Pressable
            key={entry.label}
            onPress={() => router.push(entry.href)}
            accessibilityRole="button"
            accessibilityHint={entry.note}
            android_ripple={{ color: color["surface-hover"] }}
            style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          >
            <entry.icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />
            <View style={styles.flex}>
              <Text variant="panel-title">{entry.label}</Text>
              <Text variant="label" tone="muted" numberOfLines={1}>
                {entry.note}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 18, paddingBottom: 32 },
  serif: { fontFamily: DISPLAY_SERIF, fontSize: 32, lineHeight: 39, color: color["text-primary"], marginTop: 6 },
  flex: { flex: 1, minWidth: 0 },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  link: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: 12,
    minHeight: TOUCH_TARGET * 2,
    padding: 16,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.panel,
    backgroundColor: color["surface-panel"],
  },
  linkPressed: { backgroundColor: color["surface-hover"] },
  ask: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, minHeight: TOUCH_TARGET + 24, borderWidth: 1, borderLeftWidth: 2, borderColor: color["border-subtle"], borderLeftColor: color["agent-accent"], borderRadius: radius.panel, backgroundColor: color["surface-panel"] },
});
