import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Building2, ExternalLink, Flag, Rocket, Sparkles, TrendingDown, TrendingUp, Users, type LucideIcon } from "lucide-react-native";
import { formatCompactUsd, formatPct, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { stakeSize, type Cluster, type EventFlag, type InsiderMove, type Ipo, type PlannedSale, type Stake } from "@/lib/research/sec/alpha-build";
import type { AlphaResponse } from "@/lib/research/sec/types";
import { askElyra, Heading, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { FilerMark, Tag, shares, shortDate } from "~/components/research/sec/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { useAssetsBySymbols, usePrices } from "~/lib/stores/market";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Alpha from today's filings — the website's AlphaBoard.

   The latest few hundred structured filings, read for what is worth a
   second look: insiders buying with their own money, 5%+ stakes and what
   their holders say they intend, red flags and catalysts in 8-Ks,
   leadership changes, planned insider sales, IPOs. One finding leads; tiles
   summarise each board; every card says what happened in a line, gives the
   numbers that make it matter, and offers three ways on — ask Elyra, open
   the company, read the filing.

   Polls fast while EDGAR is still being read, then every few minutes.
--------------------------------------------------------------------------- */

type BoardId = "buys" | "stakes" | "redFlags" | "catalysts" | "leadership" | "sells" | "planned" | "ipos";

const BOARDS: { id: BoardId; label: string; why: string }[] = [
  { id: "buys", label: "Insider buys", why: "Open-market purchases with the insider's own money. Insiders sell for many reasons; they buy for few." },
  { id: "stakes", label: "Big stakes", why: "Holders crossing 5% who may seek influence. Item 4 of the 13D says what they intend." },
  { id: "redFlags", label: "Red flags", why: "8-K items that tend to come before trouble." },
  { id: "catalysts", label: "Catalysts", why: "8-K items that change the story: agreements, deals, financing, results." },
  { id: "leadership", label: "Leadership", why: "Directors and officers joining or leaving. An abrupt finance or audit exit is the one to read." },
  { id: "sells", label: "Insider sales", why: "Open-market sales. Scheduled 10b5-1 sales say little; unscheduled ones, and selling everything, say more." },
  { id: "planned", label: "Planned sales", why: "Form 144: an affiliate's notice that they intend to sell, sized against the shares outstanding." },
  { id: "ipos", label: "IPO filings", why: "New registrations to go public — the S-1 is the prospectus." },
];

const PAGE = 6;
const POLL_WARMING_MS = 5_000;
const POLL_MS = 3 * 60_000;

function openCompany(query: string): void {
  router.push({ pathname: "/company/[query]", params: { query } });
}

/** Ask, company, filing — the same three ways on from every card. */
function Ways({ prompt, open, url }: { prompt: string; open: string | null; url: string }) {
  return (
    <View style={styles.ways}>
      <Button label="Ask Elyra" size="sm" variant="ghost" icon={<Sparkles size={12} strokeWidth={1.5} color={color["agent-accent"]} />} onPress={() => askElyra(prompt)} />
      {open !== null && <Button label="Company" size="sm" variant="ghost" icon={<Building2 size={12} strokeWidth={1.5} color={color["text-secondary"]} />} onPress={() => openCompany(open)} />}
      <Button label="Filing" size="sm" variant="ghost" icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />} onPress={() => openExternal(url)} />
    </View>
  );
}

function Shell({ children, highlight = false, mark }: { children: ReactNode; highlight?: boolean; mark: ReactNode }) {
  return (
    <View style={[styles.card, highlight && styles.highlight]}>
      {mark}
      <View style={shared.flex}>{children}</View>
    </View>
  );
}

function Head({ name, line, value, tone }: { name: string; line: string; value?: string | null; tone?: "positive" }) {
  return (
    <View style={styles.head}>
      <Text variant="body-sm" style={shared.flex}>
        <Text variant="data">{name} </Text>
        {line}
      </Text>
      {value ? (
        <Text variant="data" tone={tone ?? "primary"}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function MoveCard({ move, live, highlight }: { move: InsiderMove; live: Map<string, number>; highlight?: boolean }) {
  const now = useMinute();
  const buy = move.kind === "buy";
  const value = move.value === null ? null : formatCompactUsd(move.value);
  const price = move.avgPrice === null ? null : formatPriceUsd(move.avgPrice);
  const current = move.ticker ? live.get(move.ticker) : undefined;
  const since = current !== undefined && move.avgPrice !== null && move.avgPrice > 0 ? ((current - move.avgPrice) / move.avgPrice) * 100 : null;
  const traded = shortDate(move.tradeDate, now);
  const prompt = buy
    ? `${move.insider} (${move.role}) of ${move.company}${move.ticker ? ` (${move.ticker})` : ""} bought ${shares(move.shares)} shares${price ? ` at about ${price}` : ""}${value ? `, ${value} in all,` : ""} on the open market${move.changePct !== null ? `, growing their stake by ${move.changePct.toFixed(0)}%` : move.newPosition ? " — a first purchase" : ""}. How meaningful is this purchase, and what should I check about the company?`
    : `${move.insider} (${move.role}) of ${move.company}${move.ticker ? ` (${move.ticker})` : ""} sold ${shares(move.shares)} shares${value ? ` (${value})` : ""}${move.planned ? " under a 10b5-1 plan" : " outside a 10b5-1 plan"}${move.soldAll ? ", leaving nothing" : ""}. How should I read this sale?`;
  return (
    <Shell highlight={highlight} mark={<FilerMark ticker={move.ticker} name={move.company} />}>
      <Head name={move.ticker ?? move.company} line={`${move.role} ${buy ? "bought" : "sold"}`} value={value === null ? null : `${buy ? "+" : "−"}${value}`} tone={buy ? "positive" : undefined} />
      <Text variant="label" tone="secondary">
        {move.insider} · {shares(move.shares)} sh{price ? ` at ~${price}` : ""}
      </Text>
      <View style={styles.tags}>
        {move.newPosition && <Tag tone="accent">First purchase</Tag>}
        {move.changePct !== null && <Tag tone={buy ? "positive" : "neutral"}>Stake {formatPct(move.changePct, { decimals: Math.abs(move.changePct) < 10 ? 1 : 0 })}</Tag>}
        {move.soldAll && <Tag tone="negative">Sold entire stake</Tag>}
        {move.planned ? <Tag>Scheduled 10b5-1</Tag> : !buy && <Tag tone="accent">Not scheduled</Tag>}
        {traded !== null && <Tag>Traded {traded}</Tag>}
        {buy && since !== null && current !== undefined && (
          <Tag tone={since >= 0 ? "positive" : "negative"}>
            Now {formatPriceUsd(current)} · {formatPct(since, { decimals: 1 })} since
          </Tag>
        )}
      </View>
      <Ways prompt={prompt} open={move.ticker ?? move.cik} url={move.url} />
    </Shell>
  );
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const names = cluster.insiders.map((insider) => `${insider.name} (${insider.role})`).join(", ");
  return (
    <Shell highlight mark={<FilerMark ticker={cluster.ticker} name={cluster.company} />}>
      <Head name={cluster.ticker ?? cluster.company} line={`${cluster.insiders.length} insiders bought`} value={`+${formatCompactUsd(cluster.value)}`} tone="positive" />
      <Text variant="label" tone="secondary">
        {names}
      </Text>
      <View style={styles.tags}>
        <Tag tone="positive">Cluster buy</Tag>
      </View>
      <Ways
        open={cluster.ticker ?? cluster.cik}
        url={cluster.url}
        prompt={`${cluster.insiders.length} insiders at ${cluster.company}${cluster.ticker ? ` (${cluster.ticker})` : ""} bought stock on the open market at about the same time: ${names}, ${formatCompactUsd(cluster.value)} in all. What would make a cluster like this meaningful, and what should I check?`}
      />
    </Shell>
  );
}

function StakeCard({ stake, highlight }: { stake: Stake; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const size = stakeSize(stake.percent);
  return (
    <Shell highlight={highlight} mark={<FilerMark ticker={stake.ticker} name={stake.company} />}>
      <Head name={stake.ticker ?? stake.company} line={stake.holder} value={stake.percent === null ? null : `${stake.percent}%`} />
      <Text variant="label" tone="secondary">
        {stake.ticker ? `${stake.company} · ` : ""}
        {stake.holderType ?? "Holder"}
        {stake.others > 0 ? ` · +${stake.others} more filing together` : ""}
      </Text>
      <View style={styles.tags}>
        <Tag tone={stake.amended ? "neutral" : "accent"}>{stake.amended ? "Update" : "New stake"}</Tag>
        {size !== null && <Tag>{size}</Tag>}
      </View>
      {stake.purpose ? (
        <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.quote}>
          <Text variant="label" tone="secondary" numberOfLines={open ? undefined : 3}>
            “{stake.purpose}”
          </Text>
          <Text variant="label" tone="muted">
            {open ? "Less" : "Their stated purpose, in full"}
          </Text>
        </Pressable>
      ) : null}
      <Ways
        open={stake.ticker ?? stake.cik}
        url={stake.url}
        prompt={`${stake.holder} disclosed a ${stake.percent ?? "5%+"}% stake in ${stake.company}${stake.ticker ? ` (${stake.ticker})` : ""} in a ${stake.form}.${stake.purpose ? ` Their stated purpose: "${stake.purpose}"` : ""} What might they want, and what tends to happen next in situations like this?`}
      />
    </Shell>
  );
}

const SEVERITY: Record<EventFlag["severity"], LucideIcon> = { critical: Flag, warning: Flag, catalyst: TrendingUp, people: Users };

function EventCard({ event, now }: { event: EventFlag; now: number }) {
  const Icon = SEVERITY[event.severity];
  return (
    <Shell
      mark={
        <View>
          <FilerMark ticker={event.ticker} name={event.company} />
          <View style={[styles.badge, event.severity === "critical" || event.severity === "warning" ? styles.badgeNegative : null]}>
            <Icon size={9} strokeWidth={2.25} color={event.severity === "critical" || event.severity === "warning" ? color.negative : color["text-primary"]} />
          </View>
        </View>
      }
    >
      <Text variant="body-sm">
        <Text variant="data">{event.ticker ?? "Unlisted"} </Text>
        {event.headline}
      </Text>
      <Text variant="label" tone="secondary">
        {event.company} · {event.form} · {formatRelativeTime(event.filedAt, now)}
      </Text>
      <View style={styles.tags}>
        {event.severity === "critical" && <Tag tone="negative">Critical</Tag>}
        {event.items.slice(0, 3).map((item) => (
          <Tag key={item.code}>{item.label}</Tag>
        ))}
      </View>
      <Ways
        open={event.ticker ?? event.cik}
        url={event.url}
        prompt={`${event.company}${event.ticker ? ` (${event.ticker})` : ""} filed an ${event.form}: ${event.headline.toLowerCase()} (${event.items.map((item) => item.label).join(", ")}). What does this usually mean for a company, and what should I check next?`}
      />
    </Shell>
  );
}

function SaleCard({ sale, now }: { sale: PlannedSale; now: number }) {
  const from = shortDate(sale.saleDate, now);
  return (
    <Shell mark={<FilerMark ticker={sale.ticker} name={sale.company} />}>
      <Head name={sale.ticker ?? sale.company} line="plans to sell" value={sale.value === null ? null : formatCompactUsd(sale.value)} />
      <Text variant="label" tone="secondary">
        {sale.seller}
        {sale.relationship ? ` · ${sale.relationship}` : ""}
      </Text>
      <View style={styles.tags}>
        {sale.units !== null && <Tag>{shares(sale.units)} sh</Tag>}
        {sale.pctOutstanding !== null && (
          <Tag tone={sale.pctOutstanding >= 1 ? "accent" : "neutral"}>{sale.pctOutstanding < 0.01 ? "<0.01" : sale.pctOutstanding.toFixed(2)}% of shares</Tag>
        )}
        {from !== null && <Tag>From {from}</Tag>}
      </View>
      {sale.acquiredHow ? (
        <Text variant="label" tone="muted">
          Acquired: {sale.acquiredHow}
        </Text>
      ) : null}
      <Ways
        open={sale.ticker ?? sale.cik}
        url={sale.url}
        prompt={`${sale.seller}${sale.relationship ? ` (${sale.relationship})` : ""} filed a Form 144 to sell ${sale.value !== null ? formatCompactUsd(sale.value) : "shares"} of ${sale.company}${sale.ticker ? ` (${sale.ticker})` : ""}${sale.pctOutstanding !== null ? `, about ${sale.pctOutstanding.toFixed(2)}% of the shares outstanding` : ""}. How should I read a planned sale like this?`}
      />
    </Shell>
  );
}

function IpoCard({ ipo, now }: { ipo: Ipo; now: number }) {
  return (
    <Shell
      mark={
        <View>
          <FilerMark ticker={ipo.ticker} name={ipo.company} />
          <View style={styles.badge}>
            <Rocket size={9} strokeWidth={2.25} color={color["text-primary"]} />
          </View>
        </View>
      }
    >
      <Text variant="body-sm">{ipo.company}</Text>
      <Text variant="label" tone="secondary">
        Filed to go public · {ipo.form}
        {ipo.ticker ? ` · ${ipo.ticker}` : ""} · {formatRelativeTime(ipo.filedAt, now)}
      </Text>
      <Ways open={ipo.ticker ?? ipo.cik} url={ipo.url} prompt={`${ipo.company} has filed an S-1 to go public. What should I look for in its prospectus, and what is known about the company?`} />
    </Shell>
  );
}

export function AlphaBoard({ active }: { active: boolean }) {
  const feed = useResearch<AlphaResponse>(active ? "/api/sec/alpha" : null, {
    pollMs: (data) => (data !== null && data.pending > 0 ? POLL_WARMING_MS : POLL_MS),
    timeoutMs: 60_000,
  });
  const data = feed.data;
  const [board, setBoard] = useState<BoardId>("buys");
  const [shown, setShown] = useState(PAGE);
  const now = useMinute();

  /* Today's price for each buy whose ticker is a listed stock Pyth carries. */
  const tickers = useMemo(() => [...new Set((data?.buys ?? []).map((move) => move.ticker).filter((ticker): ticker is string => ticker !== null))], [data]);
  const assets = useAssetsBySymbols(tickers);
  const equityIds = useMemo(() => [...assets.bySymbol.values()].filter((asset) => asset.assetType === "equity").map((asset) => asset.id), [assets.bySymbol]);
  const prices = usePrices(equityIds);
  const live = useMemo(() => {
    const map = new Map<string, number>();
    for (const [symbol, asset] of assets.bySymbol) {
      if (asset.assetType !== "equity") continue;
      const price = prices.rows.get(asset.id)?.price;
      if (price !== undefined) map.set(symbol, price);
    }
    return map;
  }, [assets.bySymbol, prices.rows]);

  if (data === null) {
    return (
      <View style={styles.section}>
        <Heading>Alpha from today&apos;s filings</Heading>
        {feed.error !== null ? <Problem retry={feed.reload}>EDGAR could not be read just now. {feed.error}</Problem> : <Loading>Reading today&apos;s filings…</Loading>}
      </View>
    );
  }
  if (!data.configured) {
    return (
      <View style={styles.section}>
        <Heading>Alpha from today&apos;s filings</Heading>
        <Problem>{data.errors[0]}</Problem>
      </View>
    );
  }

  const counts: Record<BoardId, number> = {
    buys: data.buys.length + data.clusters.length,
    stakes: data.activists.length,
    redFlags: data.redFlags.length,
    catalysts: data.catalysts.length,
    leadership: data.leadership.length,
    sells: data.sells.length,
    planned: data.plannedSales.length,
    ipos: data.ipos.length,
  };

  /* The single most telling finding leads, and is not repeated in its board. */
  const newStake = data.activists.find((stake) => !stake.amended);
  const spotlit = data.clusters[0] ? `c${data.clusters[0].cik}` : data.buys[0] ? `b${data.buys[0].accession}` : newStake ? `k${newStake.accession}` : null;
  const spotlight = data.clusters[0] ? (
    <ClusterCard cluster={data.clusters[0]} />
  ) : data.buys[0] ? (
    <MoveCard move={data.buys[0]} live={live} highlight />
  ) : newStake ? (
    <StakeCard stake={newStake} highlight />
  ) : null;

  const tiles: { board: BoardId; icon: LucideIcon; value: string; label: string; tone?: "positive" | "negative" }[] = [
    {
      board: "buys",
      icon: TrendingUp,
      value: String(data.summary.insiderBuys),
      label: data.summary.buyValue > 0 ? `insider buys · ${formatCompactUsd(data.summary.buyValue)}` : "insider buys",
      tone: data.summary.insiderBuys > 0 ? "positive" : undefined,
    },
    { board: "stakes", icon: Users, value: String(data.summary.newActivists), label: `new 5%+ stakes · ${data.summary.activists} filings` },
    { board: "redFlags", icon: Flag, value: String(data.summary.redFlags), label: "red flags in 8-Ks", tone: data.summary.redFlags > 0 ? "negative" : undefined },
    { board: "planned", icon: TrendingDown, value: formatCompactUsd(data.summary.plannedValue), label: `planned insider sales · ${data.summary.plannedSales}` },
  ];

  const all: ReactElement[] = (() => {
    switch (board) {
      case "buys":
        return [
          ...data.clusters.map((cluster) => <ClusterCard key={`c${cluster.cik}`} cluster={cluster} />),
          ...data.buys.map((move) => <MoveCard key={`b${move.accession}`} move={move} live={live} />),
        ];
      case "sells":
        return data.sells.map((move) => <MoveCard key={`s${move.accession}`} move={move} live={live} />);
      case "stakes":
        return data.activists.map((stake) => <StakeCard key={`k${stake.accession}`} stake={stake} />);
      case "redFlags":
        return data.redFlags.map((event) => <EventCard key={event.accession} event={event} now={now} />);
      case "catalysts":
        return data.catalysts.map((event) => <EventCard key={event.accession} event={event} now={now} />);
      case "leadership":
        return data.leadership.map((event) => <EventCard key={event.accession} event={event} now={now} />);
      case "planned":
        return data.plannedSales.map((sale) => <SaleCard key={sale.accession} sale={sale} now={now} />);
      case "ipos":
        return data.ipos.map((ipo) => <IpoCard key={ipo.accession} ipo={ipo} now={now} />);
    }
  })();
  const list = all.filter((card) => card.key !== spotlit);
  const select = (id: BoardId) => {
    setBoard(id);
    setShown(PAGE);
  };

  return (
    <View style={styles.section}>
      <Heading
        note={
          <Text variant="label" tone="secondary" accessibilityLiveRegion="polite">
            {data.pending > 0 ? `Reading ${data.pending} more…` : `${data.read} filings read`}
          </Text>
        }
      >
        Alpha from today&apos;s filings
      </Heading>
      {data.since !== null && (
        <Text variant="label" tone="muted">
          The latest {data.read + data.pending} insider and ownership filings, back to {formatRelativeTime(data.since, now)}.
        </Text>
      )}

      {spotlight !== null && (
        <View style={styles.spot}>
          <View style={shared.row}>
            <Sparkles size={12} strokeWidth={1.5} color={color["agent-accent"]} />
            <Text variant="label" tone="secondary">
              Worth a look first
            </Text>
          </View>
          {spotlight}
        </View>
      )}

      <View style={styles.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const on = board === tile.board;
          return (
            <Pressable key={tile.board} onPress={() => select(tile.board)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.tile, on && styles.tileOn]}>
              <View style={styles.tileHead}>
                <Text variant="data" tone={tile.tone ?? "primary"}>
                  {tile.value}
                </Text>
                <Icon size={13} strokeWidth={1.5} color={color["text-muted"]} />
              </View>
              <Text variant="label" tone="secondary">
                {tile.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.boards}>
        {BOARDS.map((entry) => {
          const on = entry.id === board;
          return (
            <Pressable key={entry.id} onPress={() => select(entry.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={6} style={[styles.board, on && styles.boardOn]}>
              <Text key={on ? "on" : "off"} variant="label" tone={on ? "primary" : "secondary"}>
                {entry.label}{" "}
                <Text variant="data-sm" tone="muted">
                  {counts[entry.id]}
                </Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="label" tone="muted">
        {BOARDS.find((entry) => entry.id === board)?.why}
      </Text>
      {list.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          Nothing on this board in the latest filings.
        </Text>
      ) : (
        <View style={styles.list}>{list.slice(0, shown)}</View>
      )}
      {list.length > shown && <Button label={`Show more · ${list.length - shown} left`} size="sm" variant="ghost" onPress={() => setShown((value) => value + PAGE)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  spot: { gap: 6 },
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  highlight: { borderColor: color["accent-quiet"], backgroundColor: color["surface-raised"] },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  ways: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginLeft: -12 },
  quote: { marginTop: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: color["border-strong"], gap: 2 },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: color["surface-panel"],
    backgroundColor: color["surface-active"],
    alignItems: "center",
    justifyContent: "center",
  },
  badgeNegative: { backgroundColor: color["negative-bg"] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "45%", flexGrow: 1, gap: 2, padding: 10, borderRadius: radius.card, borderWidth: 1, borderColor: color["border-subtle"] },
  tileOn: { borderColor: color["accent-quiet"], backgroundColor: color["surface-raised"] },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  boards: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  board: { minHeight: 36, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-subtle"] },
  boardOn: { borderColor: color["accent-quiet"], backgroundColor: color["surface-active"] },
  list: { gap: 8 },
});
