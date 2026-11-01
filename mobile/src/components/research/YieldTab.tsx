import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { ChevronDown, ChevronRight, ChevronUp, Info, Landmark, RefreshCw, Search } from "lucide-react-native";
import { truncateMiddle } from "@/lib/format";
import type { YieldOpportunity, YieldResponse } from "@/lib/research/types";
import { AskButton, Chips, Empty, Loading, Problem, SerifHeading, TabIntro, dollars, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { utcTime } from "~/components/research/report";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Field } from "~/components/wallet/parts";
import { searchPools, sortPools, type PoolSort } from "~/lib/researchViews";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Yield — the website's YieldTab and the chat's /yield: Kamino vault rates
   with what is deposited in each.

   Search, stablecoins only, and three sorts (current APY, the steadier
   30-day APY, and deposits). A row opens its details in a sheet: the mint,
   the vault, the reward share of the APY, the capital not deployed, and
   the caveats the source states. The API's own ranking note is kept —
   APY is protocol-reported, not a promise.

   One list, two densities: cards, or compact rows. Both draw the same
   searched and sorted pools (lib/researchViews.ts) from one read; the
   stablecoin filter is the server's own classification. "Deposited" is
   the vault's total, never the person's own deposit. The list grows a
   page at a time rather than drawing every vault at once.
--------------------------------------------------------------------------- */

type Density = "cards" | "compact";

const PAGE = 20;

/** One figure: its label over its value. Missing is a dash, never 0. */
function Metric({ label, value, accent = false, right = false }: { label: string; value: string; accent?: boolean; right?: boolean }) {
  return (
    <View style={[styles.metric, accent && styles.metricLead, right && styles.metricRule]} accessible accessibilityLabel={`${label} ${value === "—" ? "unavailable" : value}`}>
      <Text variant="body-sm" tone="secondary" style={styles.metricLabel}>
        {label}
      </Text>
      <Text variant="data" tone={accent && value !== "—" ? "accent" : value === "—" ? "muted" : "primary"} style={accent ? styles.metricBig : styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

/** The pool's mark, full name (wrapping, never cut) and asset. */
function Identity({ row }: { row: YieldOpportunity }) {
  return (
    <View style={styles.identity}>
      <Landmark size={30} strokeWidth={1.5} color={color["text-primary"]} />
      <View style={styles.identityWords}>
        <Text variant="body" style={styles.name}>
          {row.name}
        </Text>
        <View style={styles.asset}>
          <Text variant="body-sm" numberOfLines={1} style={styles.assetText}>
            {row.asset.length > 16 ? truncateMiddle(row.asset, 6, 4) : row.asset}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ViewPool({ onOpen, name }: { onOpen: () => void; name: string }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`View pool: ${name}`} accessibilityHint="Opens its details" style={({ pressed }) => [styles.view, pressed && styles.pressed]}>
      <Text variant="body" style={[shared.flex, styles.viewText]}>
        View pool
      </Text>
      <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
  );
}

/** A pool as a card: identity above, the three figures grouped below. */
export function YieldPoolCard({ row, onOpen }: { row: YieldOpportunity; onOpen: () => void }) {
  return (
    <SurfaceCard style={styles.poolCard}>
      <Identity row={row} />
      <Rule />
      <View style={styles.metrics}>
        <Metric label="Current APY" value={percentage(row.apyPct)} accent />
        <Metric label="30-day APY" value={percentage(row.apy30dPct)} right />
        <Metric label="Deposited" value={dollars(row.tvlUsd)} right />
      </View>
      <Rule />
      <ViewPool onOpen={onOpen} name={row.name} />
    </SurfaceCard>
  );
}

/** A pool as a compact row: name and asset beside current APY, the other two figures under them. */
export function CompactYieldRow({ row, onOpen, first }: { row: YieldOpportunity; onOpen: () => void; first: boolean }) {
  return (
    <View style={[styles.compact, !first && styles.compactRule]}>
      <View style={styles.compactHead}>
        <View style={shared.flex}>
          <Identity row={row} />
        </View>
        <View style={styles.compactApy}>
          <Metric label="Current APY" value={percentage(row.apyPct)} accent />
        </View>
      </View>
      <View style={styles.metrics}>
        <Metric label="30-day APY" value={percentage(row.apy30dPct)} />
        <Metric label="Deposited" value={dollars(row.tvlUsd)} right />
      </View>
      <ViewPool onOpen={onOpen} name={row.name} />
    </View>
  );
}

export function YieldTab({ active }: { active: boolean }) {
  const [stables, setStables] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PoolSort>("apyPct");
  const [density, setDensity] = useState<Density>("cards");
  const [shown, setShown] = useState(PAGE);
  const [explain, setExplain] = useState(false);
  const [selected, setSelected] = useState<YieldOpportunity | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);
  const feed = useResearch<YieldResponse>(active ? `/api/research/yield${stables ? "?stables=true" : ""}` : null);

  const rows = useMemo(() => sortPools(searchPools(feed.data?.opportunities ?? [], query), sort), [feed.data, query, sort]);
  const visible = rows.slice(0, shown);
  const open = (row: YieldOpportunity) => {
    setSelected(row);
    sheet.current?.present();
  };
  const source = utcTime(feed.data?.asOf);

  return (
    <View style={styles.tab}>
      <TabIntro title="Yield opportunities" lead="Explore pools. Compare the details." />
      <View style={styles.source}>
        <Text variant="body" tone="secondary" style={[shared.flex, styles.note]}>
          Kamino{source !== null ? ` · ${source}` : ""}
        </Text>
        <Pressable
          onPress={feed.reload}
          disabled={feed.loading || feed.refreshing}
          accessibilityRole="button"
          accessibilityLabel={feed.refreshing ? "Refreshing pools" : "Refresh pools"}
          style={styles.refresh}
        >
          <RefreshCw size={20} strokeWidth={1.5} color={color["text-primary"]} />
          <Text variant="body" style={styles.note}>
            {feed.refreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text variant="body" style={styles.label}>
          Search pools or assets
        </Text>
        <View style={styles.input}>
          <Search size={22} strokeWidth={1.5} color={color["text-primary"]} />
          <TextInput
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              setShown(PAGE);
            }}
            placeholder="USDC, SOL, a vault…"
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search pools or assets"
            style={styles.inputText}
          />
        </View>
      </View>
      <Pressable
        onPress={() => {
          setStables(!stables);
          setShown(PAGE);
        }}
        accessibilityRole="switch"
        accessibilityLabel="Stablecoins only"
        accessibilityState={{ checked: stables }}
        style={styles.toggle}
      >
        <Text variant="body" style={[shared.flex, styles.label]}>
          Stablecoins only
        </Text>
        <Switch
          value={stables}
          pointerEvents="none"
          accessible={false}
          trackColor={{ false: color["border-strong"], true: color["accent-quiet"] }}
          thumbColor={stables ? color["accent-hover"] : color["text-secondary"]}
        />
      </Pressable>
      <View style={styles.field}>
        <Text variant="body" style={styles.label}>
          Sort by
        </Text>
        <Chips<PoolSort>
          wrap
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: "apyPct", label: "Current APY" },
            { value: "apy30dPct", label: "30-day APY" },
            { value: "tvlUsd", label: "Deposited" },
          ]}
        />
      </View>

      <View style={styles.listHead}>
        <View style={shared.flex}>
          <SerifHeading size={30} right={feed.data !== null ? <Text variant="body-sm" tone="secondary">{rows.length} pools</Text> : undefined}>
            Pools
          </SerifHeading>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="List density" style={styles.density}>
          {(["cards", "compact"] as const).map((value) => {
            const on = density === value;
            return (
              <Pressable key={value} onPress={() => setDensity(value)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.densityOption, on && styles.densityOn]}>
                <Text variant="body-sm" style={[styles.densityText, on && styles.densityTextOn]}>
                  {value === "cards" ? "Cards" : "Compact"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {feed.loading && <Loading>Reading Kamino vaults…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {feed.data !== null &&
        (rows.length === 0 ? (
          <Empty title="No pools match" body={query.trim() !== "" ? `Nothing matches “${query.trim()}”. Try another search.` : "Turn off stablecoins only to see every pool."} />
        ) : density === "cards" ? (
          <View style={styles.cards}>
            {visible.map((row) => (
              <YieldPoolCard key={row.id} row={row} onOpen={() => open(row)} />
            ))}
          </View>
        ) : (
          <SurfaceCard style={styles.compactCard}>
            {visible.map((row, index) => (
              <CompactYieldRow key={row.id} row={row} first={index === 0} onOpen={() => open(row)} />
            ))}
          </SurfaceCard>
        ))}
      {rows.length > visible.length && (
        <Button label={`Show ${Math.min(PAGE, rows.length - visible.length)} more of ${rows.length - visible.length}`} onPress={() => setShown((value) => value + PAGE)} />
      )}

      {feed.data !== null && (
        <SurfaceCard style={styles.explain}>
          <Pressable onPress={() => setExplain(!explain)} accessibilityRole="button" accessibilityState={{ expanded: explain }} style={styles.explainHead}>
            <Info size={22} strokeWidth={1.5} color={color["text-secondary"]} />
            <Text variant="body" style={[shared.flex, styles.label]}>
              Reading the numbers
            </Text>
            {explain ? <ChevronUp size={20} strokeWidth={1.5} color={color["text-secondary"]} /> : <ChevronDown size={20} strokeWidth={1.5} color={color["text-secondary"]} />}
          </Pressable>
          {explain &&
            [
              ["Current APY", "The latest APY the protocol reports, rewards included."],
              ["30-day APY", "The trailing 30-day APY — steadier than the current figure."],
              ["Deposited", "Total deposited in the vault by everyone, not your own deposit."],
            ].map(([term, definition]) => (
              <View key={term} style={styles.definition}>
                <Text variant="body" style={styles.term}>
                  {term}
                </Text>
                <Text variant="body" tone="secondary" style={[shared.flex, styles.note]}>
                  {definition}
                </Text>
              </View>
            ))}
        </SurfaceCard>
      )}
      {feed.data !== null && (
        <Text variant="body-sm" tone="secondary" style={styles.note}>
          {feed.data.ranking} {feed.data.warnings.join(" ")} Rates vary. Review each pool&apos;s details.
        </Text>
      )}

      <BottomSheet ref={sheet} title={selected?.name ?? "Pool details"} display onDismiss={() => setSelected(null)}>
        {selected !== null && (
          <View style={styles.sheet}>
            <Text variant="body-sm" tone="secondary">
              Kamino {selected.strategy} · protocol-reported APY.
            </Text>
            <View>
              <Field label="Asset">{selected.asset}</Field>
              <Field label="Token mint">{truncateMiddle(selected.mint, 6, 6)}</Field>
              <Field label="Vault">{truncateMiddle(selected.id, 6, 6)}</Field>
              <Field label="Deposited (whole vault)">{dollars(selected.tvlUsd)}</Field>
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
            {utcTime(selected.asOf) !== null && (
              <Text variant="body-sm" tone="secondary">
                Source updated {utcTime(selected.asOf)}
              </Text>
            )}
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
  tab: { gap: 16 },
  pressed: { backgroundColor: color["surface-hover"] },
  note: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 16, lineHeight: 22 },
  source: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: -4 },
  refresh: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, paddingLeft: 8 },
  field: { gap: 10 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputText: { flex: 1, minWidth: 0, minHeight: 56, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 17 },
  toggle: { flexDirection: "row", alignItems: "center", minHeight: TOUCH_TARGET },
  listHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 4 },
  density: { flexDirection: "row", padding: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-strong"] },
  densityOption: { minHeight: 40, minWidth: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: radius.pill },
  densityOn: { backgroundColor: color["surface-active"] },
  densityText: { fontSize: 14, lineHeight: 19, color: color["text-secondary"] },
  densityTextOn: { color: color["text-primary"], fontFamily: fontFamily("sans", 500) },
  cards: { gap: 14 },
  poolCard: { gap: 14, paddingBottom: 6 },
  identity: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  identityWords: { flex: 1, minWidth: 0, gap: 6, alignItems: "flex-start" },
  name: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24 },
  asset: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: color["surface-active"] },
  assetText: { fontSize: 14, lineHeight: 19 },
  metrics: { flexDirection: "row" },
  metric: { flex: 1, minWidth: 0, gap: 2, paddingRight: 8 },
  metricLead: { flex: 1.3 },
  metricRule: { paddingLeft: 12, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-subtle"] },
  metricLabel: { fontSize: 14, lineHeight: 19 },
  metricValue: { fontSize: 18, lineHeight: 24 },
  metricBig: { fontSize: 24, lineHeight: 30 },
  view: { flexDirection: "row", alignItems: "center", minHeight: TOUCH_TARGET },
  viewText: { fontSize: 16, lineHeight: 22 },
  compactCard: { gap: 0, paddingVertical: 4 },
  compact: { gap: 10, paddingTop: 14, paddingBottom: 2 },
  compactRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  compactHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  compactApy: { alignItems: "flex-end", minWidth: 96 },
  explain: { gap: 8, paddingVertical: 8 },
  explainHead: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH_TARGET },
  definition: { flexDirection: "row", gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  term: { width: 104, fontSize: 15, lineHeight: 21 },
  sheet: { gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
});
