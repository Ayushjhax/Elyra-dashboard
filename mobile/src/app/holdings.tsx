import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BalanceGrouping } from "@/lib/assets/derive";
import { Block, DetailScreen, HoldingsList, ReadState } from "~/components/portfolio/parts";
import { SegmentedControl } from "~/components/ui/controls";
import { EmptyState } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { usePortfolio } from "~/lib/stores/portfolio";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Holdings — every spot token across the wallet and the connected venues:
   the Mini App's Holdings and the chat's /wallet, with quantity, value, 24h
   move and share of the portfolio.

   Unverified tokens are listed and flagged, never counted. Balances under a
   dollar and unverified tokens can be hidden; nothing is hidden by default.
--------------------------------------------------------------------------- */

export default function HoldingsScreen() {
  const feed = usePortfolio();
  const [grouping, setGrouping] = useState<BalanceGrouping>("asset");
  const [hideSmall, setHideSmall] = useState(false);
  const [hideUnverified, setHideUnverified] = useState(false);
  const all = useMemo(() => feed.snapshot?.spot ?? [], [feed.snapshot]);
  const shown = all.filter((holding) => (!hideSmall || (holding.valueUsd ?? 0) >= 1) && (!hideUnverified || holding.verified));
  const unverified = all.filter((holding) => !holding.verified).length;

  return (
    <DetailScreen title="Holdings" onRefresh={feed.refetch} refreshing={feed.refreshing}>
      <ReadState
        loading={feed.loading}
        error={feed.error}
        stale={feed.stale}
        hasData={feed.snapshot !== null}
        onRetry={feed.refetch}
        refreshing={feed.refreshing}
      />
      {feed.snapshot !== null && (
        <>
          <SegmentedControl<BalanceGrouping>
            accessibilityLabel="Group by"
            value={grouping}
            onChange={setGrouping}
            choices={[
              { value: "asset", label: "By asset" },
              { value: "account", label: "By account" },
            ]}
          />
          <View style={styles.toggles}>
            <Toggle label="Hide under $1" on={hideSmall} onChange={setHideSmall} />
            <Toggle label="Hide unverified" on={hideUnverified} onChange={setHideUnverified} />
          </View>
          <Text variant="label" tone="muted">
            {all.length} {all.length === 1 ? "holding" : "holdings"}
            {unverified > 0 ? ` · ${unverified} unverified, never counted` : ""}
          </Text>
          <Block padded={false} label="Holdings">
            {shown.length > 0 ? (
              <HoldingsList holdings={shown} grouping={grouping} />
            ) : all.length === 0 ? (
              <EmptyState title="Nothing held yet" body="Tokens in your wallet and on connected venues appear here with their value and share." />
            ) : (
              <EmptyState title="Everything here is filtered out" body="Turn a filter off to see these holdings." />
            )}
          </Block>
        </>
      )}
    </DetailScreen>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      hitSlop={6}
      style={[styles.toggle, on && styles.toggleOn]}
    >
      <Text variant="label" tone={on ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    justifyContent: "center",
  },
  toggleOn: { borderColor: color["accent-quiet"], backgroundColor: color["surface-active"] },
});
