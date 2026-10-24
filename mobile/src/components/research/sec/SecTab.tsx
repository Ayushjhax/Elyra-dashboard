import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ExternalLink, Landmark } from "lucide-react-native";
import { formatDayGroup, formatRelativeTime } from "@/lib/format";
import type { EdgarCategory } from "@/lib/research/sec/forms";
import type { EdgarFiling, LatestResponse, SecEntity, SecSearchResponse } from "@/lib/research/sec/types";
import { Card, Heading, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { AlphaBoard } from "~/components/research/sec/AlphaBoard";
import { CategoryChips, FilerMark, ItemTags } from "~/components/research/sec/parts";
import { Button } from "~/components/ui/controls";
import { CompanyMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { openExternal } from "~/components/wallet/parts";
import { api } from "~/lib/api";
import { useAppStore } from "~/lib/store";
import { useAssets } from "~/lib/stores/market";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   SEC — the website's SecResearch, for the whole US market.

   Search any registrant by ticker, name or CIK, or pick one; a company
   opens on its own screen. Below, what is worth a second look in today's
   filings (the alpha board), then every filing as it lands on EDGAR,
   grouped by day and filterable by kind. Documents, not opinions: each row
   opens the filing itself on sec.gov.
--------------------------------------------------------------------------- */

const QUICK_PICKS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "COIN", "MSTR", "JPM"];
const FEED_POLL_MS = 2 * 60_000;
const SEARCH_DELAY_MS = 220;

export function openCompany(query: string): void {
  router.push({ pathname: "/company/[query]", params: { query } });
}

function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ for: string; rows: SecEntity[] }>({ for: "", rows: [] });
  const wanted = query.trim();

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .get<SecSearchResponse>(`/api/sec/search?q=${encodeURIComponent(wanted)}`, { auth: false })
        .then((body) => {
          if (!cancelled) setResults({ for: wanted, rows: body.results });
        })
        .catch(() => {});
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  const rows = results.for === wanted ? results.rows : [];
  const choose = (value: string) => {
    setQuery("");
    openCompany(value);
  };

  return (
    <View style={styles.search}>
      <TextField
        label="Any US company — ticker, name or CIK"
        value={query}
        onChangeText={setQuery}
        placeholder="NVDA, Apple, 0000320193…"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => {
          if (wanted.length > 0) choose(rows[0]?.ticker ?? wanted);
        }}
      />
      {wanted.length > 0 && rows.length > 0 && (
        <View style={styles.results} accessibilityLabel="Companies">
          {rows.map((row, index) => (
            <Pressable key={row.cik} onPress={() => choose(row.ticker)} accessibilityRole="button" style={[styles.result, index > 0 && styles.rule]}>
              <CompanyMark ticker={row.ticker} size={24} />
              <Text variant="data" style={styles.ticker}>
                {row.ticker}
              </Text>
              <Text variant="label" tone="secondary" numberOfLines={1} style={shared.flex}>
                {row.companyName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function FeedRow({ filing, now }: { filing: EdgarFiling; now: number }) {
  return (
    <View style={styles.filing}>
      <Pressable onPress={() => openCompany(filing.ticker ?? filing.cik)} accessibilityRole="button" accessibilityLabel={`Open ${filing.company}`} hitSlop={8}>
        <FilerMark ticker={filing.ticker} name={filing.company} size={30} />
      </Pressable>
      <View style={shared.flex}>
        <Text variant="body-sm">
          <Text variant="data">{filing.ticker ?? "Unlisted"} </Text>
          {filing.label}
        </Text>
        <Text variant="label" tone="secondary">
          {filing.company}
          {filing.filer ? (
            <Text variant="label" tone="muted">
              {" "}
              · by {filing.filer}
            </Text>
          ) : null}
          <Text variant="label" tone="muted">
            {" "}
            · {filing.form}
          </Text>
        </Text>
        <ItemTags items={filing.items} />
      </View>
      <Pressable onPress={() => openExternal(filing.url)} accessibilityRole="link" accessibilityLabel={`Open the ${filing.form} filing on EDGAR`} hitSlop={8} style={styles.when}>
        <Text variant="data-sm" tone="muted">
          {formatRelativeTime(filing.filedAt, now)}
        </Text>
        <ExternalLink size={12} strokeWidth={1.5} color={color["text-muted"]} />
      </Pressable>
    </View>
  );
}

function MarketFeed({ active }: { active: boolean }) {
  const [category, setCategory] = useState<EdgarCategory>("all");
  const feed = useResearch<LatestResponse>(active ? `/api/sec/latest?category=${category}` : null, { pollMs: FEED_POLL_MS, timeoutMs: 45_000 });
  const now = useMinute();
  const filings = useMemo(() => feed.data?.filings ?? [], [feed.data]);
  const groups = useMemo(() => {
    const out: { label: string; rows: EdgarFiling[] }[] = [];
    for (const filing of filings) {
      const label = formatDayGroup(filing.filedAt, now);
      const last = out.at(-1);
      if (last?.label === label) last.rows.push(filing);
      else out.push({ label, rows: [filing] });
    }
    return out;
  }, [filings, now]);

  return (
    <View style={styles.section}>
      <Heading
        note={
          <Button label={feed.refreshing ? "Refreshing…" : "Refresh"} size="sm" variant="ghost" disabled={feed.loading || feed.refreshing} onPress={feed.reload} />
        }
      >
        Filing now · all US registrants
      </Heading>
      <CategoryChips value={category} onChange={setCategory} />
      {feed.loading ? (
        <Loading>Reading EDGAR&apos;s live feed…</Loading>
      ) : feed.error !== null && feed.data === null ? (
        <Problem retry={feed.reload}>EDGAR could not be reached. {feed.error}</Problem>
      ) : feed.data !== null && !feed.data.configured ? (
        <Problem>{feed.data.errors[0]}</Problem>
      ) : filings.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          Nothing of this kind filed in the latest window.
        </Text>
      ) : (
        <>
          {groups.map((group) => (
            <Card key={group.label} style={styles.group}>
              <Text variant="eyebrow" tone="muted">
                {group.label}
              </Text>
              {group.rows.map((filing, index) => (
                <View key={filing.accession} style={index > 0 ? styles.rule : undefined}>
                  <FeedRow filing={filing} now={now} />
                </View>
              ))}
            </Card>
          ))}
          {(feed.data?.errors.length ?? 0) > 0 && (
            <Text variant="label" tone="muted">
              Not read this time: {feed.data?.errors.join(", ")}.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

export function SecTab({ active }: { active: boolean }) {
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);
  const onChart = selected?.assetType === "equity" ? selected.symbol.toUpperCase() : null;
  const picks = onChart ? [onChart, ...QUICK_PICKS.filter((ticker) => ticker !== onChart)] : QUICK_PICKS;

  return (
    <View style={styles.tab}>
      <View style={shared.row}>
        <Landmark size={14} strokeWidth={1.5} color={color["text-muted"]} />
        <Text variant="eyebrow" tone="muted" style={shared.flex}>
          SEC EDGAR · US market
        </Text>
      </View>
      <Search />
      <View style={styles.picks}>
        {picks.map((ticker) => (
          <Pressable key={ticker} onPress={() => openCompany(ticker)} accessibilityRole="button" accessibilityLabel={`Open ${ticker}${ticker === onChart ? ", the market on your chart" : ""}`} style={styles.pick}>
            <CompanyMark ticker={ticker} size={18} />
            <Text variant="data-sm" tone="secondary">
              {ticker}
              {ticker === onChart ? " · chart" : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <AlphaBoard active={active} />
      <MarketFeed active={active} />
      <Text variant="label" tone="muted">
        Straight from SEC EDGAR: the filings as filed, and figures as tagged in XBRL. Not advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 14 },
  section: { gap: 10 },
  search: { gap: 4 },
  results: { borderRadius: radius.card, borderWidth: 1, borderColor: color["border-strong"], backgroundColor: color["surface-raised"], overflow: "hidden" },
  result: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12 },
  ticker: { width: 60 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  picks: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
  group: { gap: 4 },
  filing: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  when: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
});
