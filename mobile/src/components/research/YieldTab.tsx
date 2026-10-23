import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { ChevronRight, Landmark } from "lucide-react-native";
import { truncateMiddle } from "@/lib/format";
import type { YieldOpportunity, YieldResponse } from "@/lib/research/types";
import { AskButton, Card, Chips, Empty, Loading, Problem, Timestamp, dollars, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Field } from "~/components/wallet/parts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Yield — the website's YieldTab and the chat's /yield: Kamino vault rates
   with what is deposited in each.

   Search, stablecoins only, and three sorts (current APY, the steadier
   30-day APY, and deposits). A row opens its details in a sheet: the mint,
   the vault, the reward share of the APY, the capital not deployed, and
   the caveats the source states. The API's own ranking note is kept —
   APY is protocol-reported, not a promise.
--------------------------------------------------------------------------- */

type Sort = "apyPct" | "apy30dPct" | "tvlUsd";

function Row({ row, onOpen }: { row: YieldOpportunity; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${row.name}, ${percentage(row.apyPct)} APY, ${dollars(row.tvlUsd)} deposited`} accessibilityHint="Opens its details" style={styles.row}>
      <Landmark size={20} strokeWidth={1.5} color={color["text-muted"]} />
      <View style={shared.flex}>
        <Text variant="body-sm" numberOfLines={1}>
          {row.name}
        </Text>
        <Text variant="label" tone="muted" numberOfLines={1}>
          {row.asset.length > 16 ? truncateMiddle(row.asset, 6, 4) : row.asset} · {dollars(row.tvlUsd)} deposited
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="data" tone="accent">
          {percentage(row.apyPct)}
        </Text>
        <Text variant="data-sm" tone="muted">
          30d {percentage(row.apy30dPct)}
        </Text>
      </View>
      <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
    </Pressable>
  );
}

export function YieldTab({ active }: { active: boolean }) {
  const [stables, setStables] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("apyPct");
  const [selected, setSelected] = useState<YieldOpportunity | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);
  const feed = useResearch<YieldResponse>(active ? `/api/research/yield${stables ? "?stables=true" : ""}` : null);

  const rows = useMemo(
    () =>
      (feed.data?.opportunities ?? [])
        .filter((row) => `${row.name} ${row.asset} ${row.provider} ${row.id}`.toLowerCase().includes(query.toLowerCase().trim()))
        .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity)),
    [feed.data, query, sort],
  );

  return (
    <View style={styles.tab}>
      <View style={shared.row}>
        <Text variant="h2" style={shared.flex}>
          Yield opportunities
        </Text>
        <Timestamp at={feed.data?.asOf} label="Kamino ·" />
      </View>
      <TextField label="Search pools or assets" value={query} onChangeText={setQuery} placeholder="USDC, SOL, a vault…" autoCapitalize="none" />
      <View style={styles.toggle}>
        <Text variant="body-sm" style={shared.flex}>
          Stablecoins only
        </Text>
        <Switch
          value={stables}
          onValueChange={setStables}
          accessibilityLabel="Stablecoins only"
          trackColor={{ false: color["surface-hover"], true: color["accent-quiet"] }}
          thumbColor={stables ? color.accent : color["text-secondary"]}
        />
      </View>
      <Chips<Sort>
        label="Sort"
        value={sort}
        onChange={setSort}
        options={[
          { value: "apyPct", label: "Current APY" },
          { value: "apy30dPct", label: "30-day APY" },
          { value: "tvlUsd", label: "Deposited" },
        ]}
      />
      {feed.loading && <Loading>Reading Kamino vaults…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {feed.data !== null &&
        (rows.length === 0 ? (
          <Empty title="No pools match" body="Try another search, or turn off stablecoins only." />
        ) : (
          <Card style={styles.list}>
            {rows.map((row, index) => (
              <View key={row.id} style={index > 0 ? styles.rule : undefined}>
                <Row
                  row={row}
                  onOpen={() => {
                    setSelected(row);
                    sheet.current?.present();
                  }}
                />
              </View>
            ))}
          </Card>
        ))}
      {feed.data !== null && (
        <Text variant="label" tone="muted">
          {feed.data.ranking} {feed.data.warnings.join(" ")}
        </Text>
      )}

      <BottomSheet ref={sheet} title={selected?.name ?? "Pool details"} onDismiss={() => setSelected(null)}>
        {selected !== null && (
          <View style={styles.sheet}>
            <Text variant="body-sm" tone="secondary">
              Kamino {selected.strategy} · protocol-reported APY.
            </Text>
            <View>
              <Field label="Asset">{selected.asset}</Field>
              <Field label="Token mint">{truncateMiddle(selected.mint, 6, 6)}</Field>
              <Field label="Vault">{truncateMiddle(selected.id, 6, 6)}</Field>
              <Field label="Deposited">{dollars(selected.tvlUsd)}</Field>
              <Field label="Current APY">{percentage(selected.apyPct)}</Field>
              <Field label="30-day average APY">{percentage(selected.apy30dPct)}</Field>
              <Field label="Reward APY">{percentage(selected.rewardApyPct)}</Field>
              <Field label="Available capital">{dollars(selected.availableUsd)}</Field>
              <Field label="Holders">{selected.holders?.toLocaleString("en-US") ?? "—"}</Field>
            </View>
            {selected.flags.map((flag) => (
              <Text key={flag} variant="label" tone="caution">
                {flag}
              </Text>
            ))}
            <Timestamp at={selected.asOf} />
            <AskButton
              prompt={`Kamino's ${selected.name} vault pays ${percentage(selected.apyPct)} APY now and ${percentage(selected.apy30dPct)} over 30 days, with ${dollars(selected.tvlUsd)} deposited. What are the risks, and how much of that yield is rewards?`}
            />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 12 },
  toggle: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  list: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, paddingVertical: 8 },
  right: { alignItems: "flex-end", gap: 2 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  sheet: { gap: 12, padding: 16 },
});
