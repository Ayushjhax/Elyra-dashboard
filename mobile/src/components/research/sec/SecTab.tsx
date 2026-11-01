import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { ChevronRight, ExternalLink, FileSearch, Landmark, Search as SearchIcon, X } from "lucide-react-native";
import { formatDayGroup, formatRelativeTime } from "@/lib/format";
import type { EdgarCategory } from "@/lib/research/sec/forms";
import type { EdgarFiling, LatestResponse, SecEntity, SecSearchResponse } from "@/lib/research/sec/types";
import { Card, Heading, Loading, Problem, SerifHeading, TabIntro, styles as shared, useResearch } from "~/components/research/parts";
import { AlphaBoard } from "~/components/research/sec/AlphaBoard";
import { CategoryChips, FilerMark, ItemTags } from "~/components/research/sec/parts";
import { Button, IconButton } from "~/components/ui/controls";
import { SurfaceCard } from "~/components/shell/surface";
import { CompanyMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { api } from "~/lib/api";
import { useAppStore } from "~/lib/store";
import { useAssets } from "~/lib/stores/market";
import { useMinute } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   SEC — the website's SecResearch, for the whole US market.

   Search any registrant by ticker, name or CIK, or pick one; a company
   opens on its own screen. A search says when it is looking, when nothing
   matches and when the lookup failed — three different answers — and an
   answer for an older query is dropped. What is typed is sent as typed,
   so a CIK keeps its leading zeros. While searching, the page's
   introduction folds away so the field and its results stay in view. Below, what is worth a second look in today's
   filings (the alpha board), then every filing as it lands on EDGAR,
   grouped by day and filterable by kind. Documents, not opinions: each row
   opens the filing itself on sec.gov.
--------------------------------------------------------------------------- */

const QUICK_PICKS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "COIN", "MSTR", "JPM"];

/* The picks' names, for reading at a glance; the company screen resolves each from EDGAR. */
const PICK_NAMES: Record<string, string> = {
  NVDA: "NVIDIA",
  AAPL: "Apple",
  MSFT: "Microsoft",
  TSLA: "Tesla",
  AMZN: "Amazon",
  META: "Meta",
  GOOGL: "Alphabet",
  COIN: "Coinbase",
  MSTR: "Strategy",
  JPM: "JPMorgan Chase",
};
const FEED_POLL_MS = 2 * 60_000;
const SEARCH_DELAY_MS = 220;

export function openCompany(query: string): void {
  router.push({ pathname: "/company/[query]", params: { query } });
}

type Lookup = { for: string; status: "loading" | "ready" | "error"; rows: SecEntity[]; error: string | null };

function Search({ onFocusChange }: { onFocusChange: (searching: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ for: "", status: "ready", rows: [], error: null });
  const wanted = query.trim();

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLookup({ for: wanted, status: "loading", rows: [], error: null });
      void api
        .get<SecSearchResponse>(`/api/sec/search?q=${encodeURIComponent(wanted)}`, { auth: false })
        .then((body) => {
          if (!cancelled) setLookup({ for: wanted, status: "ready", rows: body.results, error: null });
        })
        .catch((failure: unknown) => {
          if (!cancelled) setLookup({ for: wanted, status: "error", rows: [], error: failure instanceof Error ? failure.message : "The lookup failed." });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  useEffect(() => onFocusChange(focused || wanted.length > 0), [focused, wanted, onFocusChange]);

  const current = lookup.for === wanted ? lookup : null;
  const rows = current?.status === "ready" ? current.rows : [];
  const choose = (value: string) => {
    setQuery("");
    openCompany(value);
  };

  return (
    <SurfaceCard>
      <SerifHeading size={30}>Find a company</SerifHeading>
      <View style={styles.field}>
        <Text variant="body" tone="secondary" style={styles.label}>
          Ticker, company name or CIK
        </Text>
        <View style={[styles.input, focused && styles.inputFocused]}>
          <SearchIcon size={22} strokeWidth={1.5} color={color["text-primary"]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="NVDA, Apple, 0000320193…"
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (wanted.length > 0) choose(rows[0]?.ticker ?? wanted);
            }}
            accessibilityLabel="Find a company: ticker, company name or CIK"
            style={styles.inputText}
          />
          {query.length > 0 && (
            <IconButton accessibilityLabel="Clear the search" onPress={() => setQuery("")}>
              <X size={20} strokeWidth={1.5} color={color["text-secondary"]} />
            </IconButton>
          )}
        </View>
      </View>
      {wanted.length > 0 &&
        (current === null || current.status === "loading" ? (
          <View style={styles.searching}>
            <ActivityIndicator size="small" color={color["text-secondary"]} />
            <Text variant="body" tone="secondary" style={styles.label}>
              Looking up “{wanted}”…
            </Text>
          </View>
        ) : current.status === "error" ? (
          <Text variant="body" tone="negative" accessibilityLiveRegion="polite" style={styles.label}>
            The lookup failed: {current.error} Search again, or open “{wanted}” directly with Enter.
          </Text>
        ) : rows.length === 0 ? (
          <Text variant="body" tone="secondary" accessibilityLiveRegion="polite" style={styles.label}>
            No company matches “{wanted}”. Try a ticker, a name or a CIK.
          </Text>
        ) : (
          <View style={styles.results} accessibilityLabel="Companies">
            {rows.map((row, index) => (
              <Pressable
                key={row.cik}
                onPress={() => choose(row.ticker)}
                accessibilityRole="button"
                accessibilityLabel={`${row.ticker}, ${row.companyName}, CIK ${row.cik}`}
                android_ripple={{ color: color["surface-hover"] }}
                style={[styles.result, index > 0 && styles.rule]}
              >
                <CompanyMark ticker={row.ticker} size={36} />
                <View style={shared.flex}>
                  <Text variant="body" style={styles.ticker}>
                    {row.ticker}
                  </Text>
                  <Text variant="body-sm" tone="secondary" numberOfLines={2}>
                    {row.companyName} · CIK {row.cik}
                  </Text>
                </View>
                <ChevronRight size={20} strokeWidth={1.5} color={color["text-secondary"]} />
              </Pressable>
            ))}
          </View>
        ))}
    </SurfaceCard>
  );
}

/** A quick pick: logo, ticker, name and a chevron. */
function PickTile({ ticker, name, note, half }: { ticker: string; name: string | null; note: string | null; half: boolean }) {
  return (
    <Pressable
      onPress={() => openCompany(ticker)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${ticker}${name ? `, ${name}` : ""}${note ? `, ${note}` : ""}`}
      style={({ pressed }) => [styles.pick, half && styles.pickHalf, pressed && styles.pressed]}
    >
      <CompanyMark ticker={ticker} size={40} />
      <View style={shared.flex}>
        <Text variant="body" numberOfLines={1} style={styles.ticker}>
          {ticker}
        </Text>
        {(name ?? note) !== null && (
          <Text variant="body-sm" tone="secondary" numberOfLines={2} style={styles.pickName}>
            {[name, note].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      <ChevronRight size={20} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
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
  const [searching, setSearching] = useState(false);
  /* Two tiles a row where they fit; one on a narrow phone or at large text. */
  const { width, fontScale } = useWindowDimensions();
  const half = width / Math.max(1, fontScale) >= 400;

  return (
    <View style={styles.tab}>
      <View style={styles.eyebrow}>
        <Landmark size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        <Text variant="eyebrow" tone="secondary" style={styles.eyebrowText}>
          SEC EDGAR · US market
        </Text>
      </View>
      {!searching && <TabIntro title="Research at the source." lead="Find a company’s public filings." />}
      <Search onFocusChange={setSearching} />
      <SerifHeading size={28}>Quick picks</SerifHeading>
      <View style={styles.picks}>
        {picks.map((ticker) => (
          <PickTile
            key={ticker}
            ticker={ticker}
            half={half}
            name={PICK_NAMES[ticker] ?? (ticker === onChart ? (selected?.name ?? null) : null)}
            note={ticker === onChart ? "on your chart" : null}
          />
        ))}
      </View>
      <SurfaceCard style={styles.start}>
        <FileSearch size={30} strokeWidth={1.25} color={color["text-secondary"]} />
        <View style={shared.flex}>
          <SerifHeading size={24}>Start with a company</SerifHeading>
          <Text variant="body" tone="secondary" style={styles.label}>
            Search above or choose a ticker to explore its filings.
          </Text>
        </View>
      </SurfaceCard>
      <AlphaBoard active={active} />
      <MarketFeed active={active} />
      <Text variant="body-sm" tone="secondary">
        Company filings straight from SEC EDGAR: the filings as filed, and figures as tagged in XBRL. Not advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 16 },
  pressed: { backgroundColor: color["surface-hover"] },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: -6 },
  eyebrowText: { fontSize: 13, lineHeight: 17, letterSpacing: 1.5 },
  field: { gap: 8 },
  label: { fontSize: 15, lineHeight: 21 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputFocused: { borderColor: color["accent-hover"] },
  inputText: { flex: 1, minWidth: 0, minHeight: 56, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 17 },
  searching: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: TOUCH_TARGET },
  pickName: { fontSize: 14, lineHeight: 19 },
  pickHalf: { flexBasis: "47%" },
  start: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  section: { gap: 10 },
  search: { gap: 4 },
  results: { borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-subtle"], overflow: "hidden" },
  result: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 14, paddingVertical: 8 },
  ticker: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  picks: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pick: {
    flexGrow: 1,
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  group: { gap: 4 },
  filing: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  when: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
});
