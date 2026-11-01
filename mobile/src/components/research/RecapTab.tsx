import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, ExternalLink, FileText, Info, RefreshCw, SlidersHorizontal, type LucideIcon } from "lucide-react-native";
import { formatPriceUsd } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import type { MarketRecap, RecapMove, RecapScope } from "@/lib/research/types";
import { Chips, Loading, Problem, SerifHeading, TabIntro, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { utcTime } from "~/components/research/report";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Button } from "~/components/ui/controls";
import { CoinMark, CompanyMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { useTickerLogos } from "~/lib/stores/market";
import { sharedTime } from "~/lib/researchViews";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Market recap — the website's RecapTab and the chat's /recap.

   Crypto or equities: the majors' 24-hour move in one grouped card, then for
   crypto the perpetual funding on Hyperliquid (who pays whom) and what the
   busiest prediction markets price. Each section says when it is a cached
   reading, and one that could not be read says so with its reason rather
   than disappearing. Market prices, not predictions.

   Two times are kept apart: a price's SOURCE time (when it was published)
   — once under the card when every price shares it, on each row when they
   differ — and when the recap was ASSEMBLED by the server, in the details.
   Neither is the phone's clock, and nothing here is called live.

   Funding is shown as the provider gives it: already annualised, signed
   by who pays whom, in a neutral colour — a positive rate is a cost to
   longs, not a return to everyone. It is not a yield.
--------------------------------------------------------------------------- */

type Scope = Exclude<RecapScope, "portfolio">;

const MAJORS: Record<Scope, string[]> = {
  crypto: ["SOL", "ETH", "BTC"],
  equities: ["SPY", "QQQ", "NVDA"],
};

/* The majors' names. A symbol the server adds beyond these shows by itself. */
const NAMES: Record<string, string> = {
  SOL: "Solana",
  ETH: "Ethereum",
  BTC: "Bitcoin",
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  NVDA: "NVIDIA",
};

const SCOPE_LABEL: Record<Scope, string> = { crypto: "Crypto", equities: "Equities" };

/** One asset: mark, name and symbol; its price; the signed move and its window. */
function PriceRow({ scope, symbol, move, windowHours, logo, first, showTime }: { scope: Scope; symbol: string; move: RecapMove | undefined; windowHours: number; logo: { logo: string | null; fallbackLogo: string | null }; first: boolean; showTime: boolean }) {
  const change = move?.changePct;
  const tone = change === undefined || !Number.isFinite(change) ? "muted" : change > 0 ? "positive" : change < 0 ? "negative" : "secondary";
  const changeText = change === undefined || !Number.isFinite(change) ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${percentage(Math.abs(change), 1)}`;
  const time = showTime ? utcTime(move?.asOf) : null;
  return (
    <View
      style={[styles.priceRow, !first && styles.ruled]}
      accessible
      accessibilityLabel={`${NAMES[symbol] ?? symbol}, ${move ? formatPriceUsd(move.price) : "price unavailable"}, ${changeText === "—" ? "change unavailable" : `${changeText} over ${windowHours} hours`}`}
    >
      {scope === "crypto" ? <CoinMark symbol={symbol} logo={logo.logo} fallbackLogo={logo.fallbackLogo} size={44} /> : <CompanyMark ticker={symbol} size={44} />}
      <View style={shared.flex}>
        <Text variant="body" numberOfLines={2} style={styles.assetName}>
          {NAMES[symbol] ?? symbol}
        </Text>
        <Text variant="body-sm" tone="secondary" style={styles.assetSymbol}>
          {symbol}
          {move?.stale === true ? " · cached" : ""}
        </Text>
        {time !== null && (
          <Text variant="body-sm" tone="secondary">
            {time}
          </Text>
        )}
      </View>
      <View style={styles.priceRight}>
        <Text variant="data" tone={move ? "primary" : "muted"} style={styles.priceValue}>
          {move ? formatPriceUsd(move.price) : "—"}
        </Text>
        <Text variant="data" tone={tone} style={styles.change}>
          {changeText}{" "}
          <Text variant="body-sm" tone="secondary">
            {windowHours}h
          </Text>
        </Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.detail, !first && styles.ruled]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="body" tone="secondary" style={styles.detailText}>
        {label}
      </Text>
      <Text variant="body" style={[styles.detailText, styles.detailValue]}>
        {value}
      </Text>
    </View>
  );
}

function NavRow({ icon: Icon, title, detail, onPress, first = false }: { icon: LucideIcon; title: string; detail: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.nav, !first && styles.ruled, pressed && styles.pressed]}
    >
      <View style={styles.navIcon}>
        <Icon size={24} strokeWidth={1.5} color={color["text-primary"]} />
      </View>
      <View style={shared.flex}>
        <Text variant="body" style={styles.navTitle}>
          {title}
        </Text>
        <Text variant="body" tone="secondary" style={styles.name}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
  );
}

export function RecapTab({ active, onTab }: { active: boolean; onTab: (tab: "reports" | "backtests") => void }) {
  const [scope, setScope] = useState<Scope>("crypto");
  const feed = useResearch<MarketRecap>(active ? `/api/research/recap?scope=${scope}` : null, { timeoutMs: 45_000 });
  const sections = feed.data?.sections ?? [];
  const overview = sections.find((section) => section.title === SCOPE_LABEL[scope]);
  const funding = sections.find((section) => section.title === "Perpetual funding");
  const prediction = sections.find((section) => section.title === "Prediction markets");
  const symbols = overview?.moves?.map((move) => move.symbol) ?? MAJORS[scope];
  const fundingSymbols = (sections.find((section) => section.title === "Perpetual funding")?.funding ?? []).map((row) => row.symbol);
  const logos = useTickerLogos(scope === "crypto" ? [...symbols, ...fundingSymbols] : []);
  const windowHours = feed.data?.windowHours ?? 24;
  const assembled = utcTime(feed.data?.generatedAt);
  const commonTime = overview?.moves ? sharedTime(symbols.map((symbol) => overview.moves?.find((move) => move.symbol === symbol)?.asOf)) : null;

  return (
    <View style={styles.tab}>
      <TabIntro title="Market recap" lead="Price moves and perpetual funding." />
      <View style={styles.controls}>
        <View style={shared.flex}>
          <Chips<Scope>
            wrap
            label="Recap scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "crypto", label: "Crypto" },
              { value: "equities", label: "Equities" },
            ]}
          />
        </View>
        <Pressable
          onPress={feed.reload}
          disabled={feed.loading || feed.refreshing}
          accessibilityRole="button"
          accessibilityLabel={feed.refreshing ? "Refreshing the recap" : "Refresh the recap"}
          accessibilityState={{ busy: feed.refreshing, disabled: feed.loading || feed.refreshing }}
          style={styles.refresh}
        >
          <View style={styles.refreshRing}>
            <RefreshCw size={20} strokeWidth={1.5} color={color["text-primary"]} />
          </View>
          <Text variant="body" style={styles.refreshText}>
            {feed.refreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {feed.loading && <Loading>Reading markets…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}

      {overview !== undefined &&
        (overview.unavailable !== null ? (
          <Problem retry={feed.reload}>{overview.unavailable}</Problem>
        ) : (
          <>
            <SurfaceCard style={styles.tight} label="Prices">
              <SerifHeading size={26}>Prices</SerifHeading>
              <View>
                {symbols.map((symbol, index) => (
                  <PriceRow
                    key={symbol}
                    scope={scope}
                    symbol={symbol}
                    move={overview.moves?.find((item) => item.symbol === symbol)}
                    windowHours={windowHours}
                    logo={logos(symbol)}
                    first={index === 0}
                    showTime={commonTime === null}
                  />
                ))}
              </View>
              {commonTime !== null && (
                <>
                  <Rule />
                  <Text variant="body-sm" tone="secondary" style={styles.foot}>
                    Source updated {utcTime(commonTime)}
                  </Text>
                </>
              )}
            </SurfaceCard>
            {/* The server's own sentence, for the assets above — never inferred from missing data. */}
            {overview.lines
              .filter((line) => line.startsWith("No move"))
              .map((line) => (
                <View key={line} style={styles.summary}>
                  <Info size={20} strokeWidth={1.5} color={color["text-secondary"]} />
                  <Text variant="body" tone="secondary" style={[shared.flex, styles.summaryText]}>
                    {line.replace("over the window", `over ${windowHours}h`)} Tracked assets only.
                  </Text>
                </View>
              ))}
          </>
        ))}

      {feed.data !== null && (
        <SurfaceCard style={styles.tight}>
          <SerifHeading size={26}>Snapshot details</SerifHeading>
          <View>
            <DetailRow first label="Market" value={SCOPE_LABEL[scope]} />
            <DetailRow label="Quote currency" value="USD" />
            <DetailRow label="Change window" value={`${windowHours} hours`} />
            {assembled !== null && <DetailRow label="Recap assembled" value={assembled} />}
            {feed.data.sources.length > 0 && <DetailRow label="Sources" value={feed.data.sources.join(", ")} />}
          </View>
        </SurfaceCard>
      )}

      {scope === "crypto" && feed.data !== null && (
        <>
          <View style={styles.section}>
            <SerifHeading size={30}>Perpetual funding</SerifHeading>
            <View style={styles.venue}>
              <CoinMark symbol="HYPE" logo={hyperliquidIcon("HYPE")} size={22} />
              <Text variant="body-sm">Hyperliquid</Text>
              <View style={styles.annualised}>
                <Text variant="body-sm" tone="secondary" style={styles.annualisedText}>
                  Annualised
                </Text>
              </View>
            </View>
            {funding?.stale && (
              <Text variant="body-sm" tone="caution">
                Cached funding reading · may be stale.
              </Text>
            )}
            {funding?.unavailable ? (
              <Problem retry={feed.reload}>{funding.unavailable}</Problem>
            ) : funding?.funding && funding.funding.length > 0 ? (
              <SurfaceCard style={styles.tight}>
                <View>
                  {funding.funding.map((row, index) => {
                    const known = Number.isFinite(row.annualisedPct);
                    const direction = !known ? "Rate unavailable" : row.annualisedPct > 0 ? "Longs pay shorts" : row.annualisedPct < 0 ? "Shorts pay longs" : "No payment";
                    return (
                      <View key={row.symbol} style={[styles.line, index > 0 && styles.ruled]} accessible accessibilityLabel={`${row.symbol}: ${direction}${known ? `, ${percentage(row.annualisedPct, 1)} annualised` : ""}`}>
                        <CoinMark symbol={row.symbol} logo={logos(row.symbol).logo} fallbackLogo={hyperliquidIcon(row.symbol)} size={36} />
                        <Text variant="data" style={styles.lineSymbol}>
                          {row.symbol}
                        </Text>
                        <Text variant="body" tone="secondary" style={[shared.flex, styles.name]}>
                          {direction}
                        </Text>
                        <Text variant="data" tone={known ? "primary" : "muted"} style={styles.changeText}>
                          {known ? percentage(row.annualisedPct, 1) : "—"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Rule />
                <Text variant="body-sm" tone="secondary" style={styles.foot}>
                  A funding rate, not a yield.{utcTime(funding.asOf) !== null ? ` Source updated ${utcTime(funding.asOf)}.` : ""}
                </Text>
              </SurfaceCard>
            ) : (
              <Problem retry={feed.reload}>Funding details are unavailable.</Problem>
            )}
          </View>

          <SurfaceCard style={styles.tight}>
            <SerifHeading size={26}>Prediction markets</SerifHeading>
            {prediction?.stale && (
              <Text variant="body-sm" tone="caution">
                Cached market prices · may be stale.
              </Text>
            )}
            {prediction?.unavailable ? (
              <Problem retry={feed.reload}>{prediction.unavailable}</Problem>
            ) : prediction?.markets ? (
              <View>
                {prediction.markets.map((market, index) => (
                  <View key={market.id} style={[styles.market, index > 0 && styles.ruled]}>
                    <View style={styles.marketHead}>
                      <Text variant="body" style={[shared.flex, styles.marketQuestion]}>
                        {market.question}
                      </Text>
                      <Text variant="data" style={styles.changeText}>
                        {market.price === null ? "—" : percentage(market.price * 100, 0)}
                      </Text>
                    </View>
                    <View style={styles.marketHead}>
                      <Text variant="body-sm" tone="secondary" style={shared.flex}>
                        {market.outcome ?? "Unlabelled outcome"} · {market.status === "open" ? "implied probability" : `${market.status} · last price`}
                      </Text>
                      {market.url !== null && (
                        <Button
                          label="Polymarket"
                          size="sm"
                          variant="ghost"
                          accessibilityLabel={`Open "${market.question}" on Polymarket`}
                          icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
                          onPress={() => openExternal(market.url as string)}
                        />
                      )}
                    </View>
                  </View>
                ))}
                {utcTime(prediction.asOf) !== null && (
                  <Text variant="body-sm" tone="secondary">
                    Polymarket · source updated {utcTime(prediction.asOf)}
                  </Text>
                )}
              </View>
            ) : (
              <Problem retry={feed.reload}>Prediction-market details are unavailable.</Problem>
            )}
          </SurfaceCard>
        </>
      )}

      <View style={styles.section}>
        <SerifHeading size={28}>Continue your research</SerifHeading>
        <View style={styles.navCard}>
          <NavRow first icon={FileText} title="Company reports" detail="Explore filings and earnings" onPress={() => onTab("reports")} />
          <NavRow icon={SlidersHorizontal} title="Backtests" detail="Explore historical strategies" onPress={() => onTab("backtests")} />
        </View>
      </View>

      {feed.data !== null && (
        <Text variant="body-sm" tone="secondary">
          Market prices, not predictions.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 16 },
  section: { gap: 12 },
  tight: { gap: 10 },
  pressed: { backgroundColor: color["surface-hover"] },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  refresh: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: TOUCH_TARGET },
  refreshRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: color["border-strong"], alignItems: "center", justifyContent: "center" },
  refreshText: { fontSize: 16, lineHeight: 22 },
  name: { fontSize: 16, lineHeight: 22 },
  changeText: { fontSize: 16, lineHeight: 22 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 10 },
  assetName: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  assetSymbol: { fontSize: 14, lineHeight: 19 },
  priceRight: { alignItems: "flex-end", gap: 2, flexShrink: 0, maxWidth: "50%" },
  priceValue: { fontSize: 18, lineHeight: 24, textAlign: "right" },
  change: { fontSize: 16, lineHeight: 22, textAlign: "right" },
  foot: { fontSize: 14, lineHeight: 20, paddingTop: 2 },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"] },
  summaryText: { fontSize: 15, lineHeight: 21 },
  venue: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4 },
  annualised: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-strong"] },
  annualisedText: { fontSize: 13, lineHeight: 17 },
  detail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: TOUCH_TARGET, paddingVertical: 8 },
  detailText: { fontSize: 16, lineHeight: 22 },
  detailValue: { flexShrink: 1, textAlign: "right" },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH_TARGET },
  lineSymbol: { width: 48, fontSize: 16, lineHeight: 22 },
  market: { gap: 4, paddingVertical: 10 },
  marketHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  marketQuestion: { fontSize: 15, lineHeight: 21 },
  navCard: { borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"], paddingHorizontal: 16 },
  nav: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 76, paddingVertical: 12 },
  navIcon: { width: 52, height: 52, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-strong"], alignItems: "center", justifyContent: "center" },
  navTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
});
