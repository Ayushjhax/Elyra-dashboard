"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Flag,
  Rocket,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AlphaResponse } from "@/lib/research/sec/alpha";
import {
  stakeSize,
  type Cluster,
  type EventFlag,
  type InsiderMove,
  type Ipo,
  type PlannedSale,
  type Stake,
} from "@/lib/research/sec/alpha-build";
import { CompanyMark, FilerMark } from "@/components/ui/CompanyMark";
import { formatCompactUsd, formatPct, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Alpha from today's filings.

   The latest few hundred structured filings, read for what is worth a second
   look (lib/research/sec/alpha-build.ts): insiders buying with their own
   money, 5%+ stakes and what their holders say they intend, red flags and
   catalysts in 8-Ks, leadership changes, planned insider sales, IPOs.

   A spotlight leads with the single most telling finding; tiles summarise
   each board; a card says what happened in a line, gives the numbers that
   make it matter, and offers three ways to go further — ask Elyra to think
   it through, open the company, read the filing.
--------------------------------------------------------------------------- */

type BoardId = "buys" | "stakes" | "redFlags" | "catalysts" | "leadership" | "sells" | "planned" | "ipos";

const BOARDS: Array<{ id: BoardId; label: string; why: string }> = [
  {
    id: "buys",
    label: msg("Insider buys"),
    why: msg("Open-market purchases with the insider's own money. Insiders sell for many reasons; they buy for few."),
  },
  {
    id: "stakes",
    label: msg("Big stakes"),
    why: msg("Holders crossing 5% who may seek influence. Item 4 of the 13D says what they intend."),
  },
  { id: "redFlags", label: msg("Red flags"), why: msg("8-K items that tend to come before trouble.") },
  { id: "catalysts", label: msg("Catalysts"), why: msg("8-K items that change the story: agreements, deals, financing, results.") },
  {
    id: "leadership",
    label: msg("Leadership"),
    why: msg("Directors and officers joining or leaving. An abrupt finance or audit exit is the one to read."),
  },
  {
    id: "sells",
    label: msg("Insider sales"),
    why: msg("Open-market sales. Scheduled 10b5-1 sales say little; unscheduled ones, and selling everything, say more."),
  },
  {
    id: "planned",
    label: msg("Planned sales"),
    why: msg("Form 144: an affiliate's notice that they intend to sell, sized against the shares outstanding."),
  },
  { id: "ipos", label: msg("IPO filings"), why: msg("New registrations to go public — the S-1 is the prospectus.") },
];

const PAGE = 6;
const POLL_WARMING_MS = 5_000;
const POLL_MS = 3 * 60_000;

/* ---- Small pieces ---- */

function Mark({ ticker, name, size = 32 }: { ticker: string | null; name: string; size?: number }) {
  return ticker ? <CompanyMark ticker={ticker} name={name} size={size} /> : <FilerMark name={name} size={size} />;
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "accent" }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-1.5",
        tone === "positive"
          ? "bg-positive-bg text-positive"
          : tone === "negative"
            ? "bg-negative-bg text-negative"
            : tone === "accent"
              ? "bg-surface-active text-text-primary"
              : "bg-surface-hover text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}

function shares(value: number): string {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value.toLocaleString("en-US");
}

function shortDate(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : null;
}

/** Ask, company, filing — the same three ways on from every card. */
function Actions({
  onAsk,
  onOpen,
  url,
  prompt,
  open,
}: {
  onAsk: (prompt: string) => void;
  onOpen: (query: string) => void;
  url: string;
  prompt: string;
  open: string | null;
}) {
  const t = useT();
  const button =
    "type-label inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";
  return (
    <div className="-ml-1.5 mt-1.5 flex flex-wrap items-center gap-0.5">
      <button type="button" onClick={() => onAsk(prompt)} className={button}>
        <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
        {t("Ask Elyra")}
      </button>
      {open !== null && (
        <button type="button" onClick={() => onOpen(open)} className={button}>
          <Building2 size={12} strokeWidth={1.5} aria-hidden />
          {t("Company")}
        </button>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
        {t("Filing")}
        <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
      </a>
    </div>
  );
}

function CardShell({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <li
      className={cn(
        "flex gap-3 rounded-card border px-3 py-2.5",
        highlight ? "border-accent-quiet bg-surface-raised" : "border-border-subtle bg-surface-panel",
      )}
    >
      {children}
    </li>
  );
}

/* ---- Live price since an insider's trade ---- */

type Live = Map<string, number>;

function SinceTrade({ move, live }: { move: InsiderMove; live: Live }) {
  const t = useT();
  const now = move.ticker ? live.get(move.ticker) : undefined;
  if (now === undefined || move.avgPrice === null || move.avgPrice <= 0) return null;
  const change = ((now - move.avgPrice) / move.avgPrice) * 100;
  return (
    <Chip tone={change >= 0 ? "positive" : "negative"}>
      {t("Now {now} · {change} since", { now: formatPriceUsd(now), change: formatPct(change, { decimals: 1 }) })}
    </Chip>
  );
}

/* ---- Cards ---- */

function MoveCard({
  move,
  live,
  onAsk,
  onOpen,
  highlight,
}: {
  move: InsiderMove;
  live: Live;
  onAsk: (prompt: string) => void;
  onOpen: (query: string) => void;
  highlight?: boolean;
}) {
  const t = useT();
  const buy = move.kind === "buy";
  const name = move.ticker ?? move.company;
  const value = move.value === null ? null : formatCompactUsd(move.value);
  const price = move.avgPrice === null ? null : formatPriceUsd(move.avgPrice);
  /* Sent as the operator's own question, so it is in their language. */
  const who = {
    insider: move.insider,
    role: move.role,
    company: `${move.company}${move.ticker ? ` (${move.ticker})` : ""}`,
    shares: shares(move.shares),
  };
  const prompt = buy
    ? t("{insider} ({role}) of {company} bought {shares} shares{price}{value} on the open market{change}. How meaningful is this purchase, and what should I check about the company?", {
        ...who,
        price: price ? t(" at about {price}", { price }) : "",
        value: value ? t(", {value} in all,", { value }) : "",
        change:
          move.changePct !== null
            ? t(", growing their stake by {pct}%", { pct: move.changePct.toFixed(0) })
            : move.newPosition
              ? t(" — a first purchase")
              : "",
      })
    : t("{insider} ({role}) of {company} sold {shares} shares{value}{plan}{all}. How should I read this sale?", {
        ...who,
        value: value ? ` (${value})` : "",
        plan: move.planned ? t(" under a 10b5-1 plan") : t(" outside a 10b5-1 plan"),
        all: move.soldAll ? t(", leaving nothing") : "",
      });

  return (
    <CardShell highlight={highlight}>
      <Mark ticker={move.ticker} name={move.company} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="type-body-sm min-w-0 text-text-primary">
            <span className="type-data mr-1.5">{name}</span>
            {move.role} {buy ? t("bought") : t("sold")}
          </p>
          {value !== null && (
            <span className={cn("type-data whitespace-nowrap", buy ? "text-positive" : "text-text-primary")}>
              {buy ? "+" : "−"}
              {value}
            </span>
          )}
        </div>
        <p className="type-label mt-0.5 text-text-secondary">
          {(price
              ? t("{insider} · {shares} sh at ~{price}", { insider: move.insider, shares: shares(move.shares), price })
              : t("{insider} · {shares} sh", { insider: move.insider, shares: shares(move.shares) }))}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {move.newPosition && <Chip tone="accent">{t("First purchase")}</Chip>}
          {move.changePct !== null && (
            <Chip tone={buy ? "positive" : "neutral"}>
              {t("Stake {changePct}", { changePct: formatPct(move.changePct, { decimals: Math.abs(move.changePct) < 10 ? 1 : 0 }) })}
            </Chip>
          )}
          {move.soldAll && <Chip tone="negative">{t("Sold entire stake")}</Chip>}
          {move.planned ? <Chip>{t("Scheduled 10b5-1")}</Chip> : !buy && <Chip tone="accent">{t("Not scheduled")}</Chip>}
          {shortDate(move.tradeDate) && <Chip>{t("Traded")}{" "}{shortDate(move.tradeDate)}</Chip>}
          {buy && <SinceTrade move={move} live={live} />}
        </div>
        <Actions onAsk={onAsk} onOpen={onOpen} url={move.url} prompt={prompt} open={move.ticker ?? move.cik} />
      </div>
    </CardShell>
  );
}

function ClusterCard({ cluster, onAsk, onOpen }: { cluster: Cluster; onAsk: (prompt: string) => void; onOpen: (query: string) => void }) {
  const t = useT();
  const names = cluster.insiders.map((insider) => `${insider.name} (${insider.role})`).join(", ");
  return (
    <CardShell highlight>
      <Mark ticker={cluster.ticker} name={cluster.company} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="type-body-sm text-text-primary">
            <span className="type-data mr-1.5">{cluster.ticker ?? cluster.company}</span>
            {t("{count} insiders bought", { count: cluster.insiders.length })}
          </p>
          <span className="type-data whitespace-nowrap text-positive">+{formatCompactUsd(cluster.value)}</span>
        </div>
        <p className="type-label mt-0.5 text-text-secondary">{names}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip tone="positive">{t("Cluster buy")}</Chip>
        </div>
        <Actions
          onAsk={onAsk}
          onOpen={onOpen}
          url={cluster.url}
          open={cluster.ticker ?? cluster.cik}
          prompt={t("{count} insiders at {company}{value} bought stock on the open market at about the same time: {names}, {value2} in all. What would make a cluster like this meaningful, and what should I check?", { count: cluster.insiders.length, company: cluster.company, value: cluster.ticker ? ` (${cluster.ticker})` : "", names, value2: formatCompactUsd(cluster.value) })}
        />
      </div>
    </CardShell>
  );
}

function StakeCard({ stake, onAsk, onOpen, highlight }: { stake: Stake; onAsk: (prompt: string) => void; onOpen: (query: string) => void; highlight?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const size = stakeSize(stake.percent);
  return (
    <CardShell highlight={highlight}>
      <Mark ticker={stake.ticker} name={stake.company} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="type-body-sm min-w-0 text-text-primary">
            <span className="type-data mr-1.5">{stake.ticker ?? stake.company}</span>
            {stake.holder}
          </p>
          {stake.percent !== null && <span className="type-data whitespace-nowrap text-text-primary">{stake.percent}%</span>}
        </div>
        <p className="type-label mt-0.5 text-text-secondary">
          {stake.ticker ? `${stake.company} · ` : ""}
          {stake.holderType ?? t("Holder")}
          {stake.others > 0 ? t(" · +{others} more filing together", { others: stake.others }) : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {!stake.amended && <Chip tone="accent">{t("New stake")}</Chip>}
          {stake.amended && <Chip>{t("Update")}</Chip>}
          {size && <Chip>{size}</Chip>}
        </div>
        {stake.purpose && (
          <blockquote className="mt-2 border-l-2 border-border-strong pl-2">
            <p className={cn("type-label text-text-secondary", !open && "line-clamp-3")}>“{stake.purpose}”</p>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="type-label mt-0.5 text-text-muted hover:text-text-primary"
            >
              {open ? t("Less") : t("Their stated purpose, in full")}
            </button>
          </blockquote>
        )}
        <Actions
          onAsk={onAsk}
          onOpen={onOpen}
          url={stake.url}
          open={stake.ticker ?? stake.cik}
          prompt={t("{holder} disclosed a {percent}% stake in {company} in a {form}.{purpose} What might they want, and what tends to happen next in situations like this?", {
                  holder: stake.holder,
                  percent: stake.percent ?? "5%+",
                  company: `${stake.company}${stake.ticker ? ` (${stake.ticker})` : ""}`,
                  form: stake.form,
                  purpose: stake.purpose ? t(" Their stated purpose: \"{purpose}\"", { purpose: stake.purpose }) : "",
                })}
        />
      </div>
    </CardShell>
  );
}

const SEVERITY_ICON: Record<EventFlag["severity"], { icon: LucideIcon; tone: string }> = {
  critical: { icon: Flag, tone: "border-negative/40 bg-negative-bg text-negative" },
  warning: { icon: Flag, tone: "border-border-subtle bg-surface-hover text-negative" },
  catalyst: { icon: TrendingUp, tone: "border-border-subtle bg-surface-active text-text-primary" },
  people: { icon: Users, tone: "border-border-subtle bg-surface-hover text-text-secondary" },
};

function EventCard({ event, onAsk, onOpen, now }: { event: EventFlag; onAsk: (prompt: string) => void; onOpen: (query: string) => void; now: number | null }) {
  const t = useT();
  const { icon: Icon, tone } = SEVERITY_ICON[event.severity];
  return (
    <CardShell>
      <span className="relative shrink-0">
        <Mark ticker={event.ticker} name={event.company} />
        <span aria-hidden className={cn("absolute -bottom-1 -right-1 inline-flex size-[18px] items-center justify-center rounded-pill border-2 border-surface-panel", tone)}>
          <Icon size={9} strokeWidth={2.25} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-body-sm text-text-primary">
          <span className="type-data mr-1.5">{event.ticker ?? t("Unlisted")}</span>
          {event.headline}
        </p>
        <p className="type-label mt-0.5 text-text-secondary">
          {event.company} · {event.form}
          {now !== null && <span className="text-text-muted"> · {formatRelativeTime(event.filedAt, now, t.locale)}</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {event.severity === "critical" && <Chip tone="negative">{t("Critical")}</Chip>}
          {event.items.slice(0, 3).map((item) => (
            <Chip key={item.code}>{t(item.label)}</Chip>
          ))}
        </div>
        <Actions
          onAsk={onAsk}
          onOpen={onOpen}
          url={event.url}
          open={event.ticker ?? event.cik}
          prompt={t("{company}{value} filed an {form}: {headline} ({value2}). What does this usually mean for a company, and what should I check next?", { company: event.company, value: event.ticker ? ` (${event.ticker})` : "", form: event.form, headline: event.headline.toLowerCase(), value2: event.items.map((item) => item.label).join(", ") })}
        />
      </div>
    </CardShell>
  );
}

function SaleCard({ sale, onAsk, onOpen }: { sale: PlannedSale; onAsk: (prompt: string) => void; onOpen: (query: string) => void }) {
  const t = useT();
  return (
    <CardShell>
      <Mark ticker={sale.ticker} name={sale.company} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="type-body-sm min-w-0 text-text-primary">
            <span className="type-data mr-1.5">{sale.ticker ?? sale.company}</span>
            {t("plans to sell")}
          </p>
          {sale.value !== null && <span className="type-data whitespace-nowrap text-text-primary">{formatCompactUsd(sale.value)}</span>}
        </div>
        <p className="type-label mt-0.5 text-text-secondary">
          {sale.seller}
          {sale.relationship ? ` · ${sale.relationship}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {sale.units !== null && <Chip>{t("{units} sh", { units: shares(sale.units) })}</Chip>}
          {sale.pctOutstanding !== null && (
            <Chip tone={sale.pctOutstanding >= 1 ? "accent" : "neutral"}>
              {t("{value}% of shares", { value: sale.pctOutstanding < 0.01 ? "<0.01" : sale.pctOutstanding.toFixed(2) })}
            </Chip>
          )}
          {shortDate(sale.saleDate) && <Chip>{t("From")}{" "}{shortDate(sale.saleDate)}</Chip>}
        </div>
        {sale.acquiredHow && <p className="type-label mt-1 text-text-muted">{t("Acquired: {acquiredHow}", { acquiredHow: sale.acquiredHow })}</p>}
        <Actions
          onAsk={onAsk}
          onOpen={onOpen}
          url={sale.url}
          open={sale.ticker ?? sale.cik}
          prompt={t("{seller} filed a Form 144 to sell {amount} of {company}{share}. How should I read a planned sale like this?", {
                  seller: `${sale.seller}${sale.relationship ? ` (${sale.relationship})` : ""}`,
                  amount: sale.value !== null ? formatCompactUsd(sale.value) : t("shares"),
                  company: `${sale.company}${sale.ticker ? ` (${sale.ticker})` : ""}`,
                  share: sale.pctOutstanding !== null ? t(", about {pct}% of the shares outstanding", { pct: sale.pctOutstanding.toFixed(2) }) : "",
                })}
        />
      </div>
    </CardShell>
  );
}

function IpoCard({ ipo, onAsk, onOpen, now }: { ipo: Ipo; onAsk: (prompt: string) => void; onOpen: (query: string) => void; now: number | null }) {
  const t = useT();
  return (
    <CardShell>
      <span className="relative shrink-0">
        <Mark ticker={ipo.ticker} name={ipo.company} />
        <span aria-hidden className="absolute -bottom-1 -right-1 inline-flex size-[18px] items-center justify-center rounded-pill border-2 border-surface-panel bg-surface-active text-text-primary">
          <Rocket size={9} strokeWidth={2.25} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-body-sm text-text-primary">{ipo.company}</p>
        <p className="type-label mt-0.5 text-text-secondary">
          {t("Filed to go public · {form}{value}", { form: ipo.form, value: ipo.ticker ? ` · ${ipo.ticker}` : "" })}
          {now !== null && <span className="text-text-muted"> · {formatRelativeTime(ipo.filedAt, now, t.locale)}</span>}
        </p>
        <Actions
          onAsk={onAsk}
          onOpen={onOpen}
          url={ipo.url}
          open={ipo.ticker ?? ipo.cik}
          prompt={t("{company} has filed an S-1 to go public. What should I look for in its prospectus, and what is known about the company?", { company: ipo.company })}
        />
      </div>
    </CardShell>
  );
}

/* ---- The board ---- */

export function AlphaBoard({ onAsk, onOpen }: { onAsk: (prompt: string) => void; onOpen: (query: string) => void }) {
  const t = useT();
  const [data, setData] = useState<AlphaResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [board, setBoard] = useState<BoardId>("buys");
  const [shown, setShown] = useState(PAGE);
  const now = useMinute();

  /* Fast while the filings are still being read, then every few minutes. */
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const tick = () => {
      void fetch("/api/sec/alpha", { cache: "no-store" })
        .then((response) => response.json() as Promise<AlphaResponse>)
        .then((next) => {
          if (cancelled) return;
          setData(next);
          setFailed(false);
          timer = window.setTimeout(tick, next.pending > 0 ? POLL_WARMING_MS : POLL_MS);
        })
        .catch(() => {
          if (cancelled) return;
          setFailed(true);
          timer = window.setTimeout(tick, POLL_MS);
        });
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  /* Today's prices for the buys, where the ticker is a listed stock Pyth carries. */
  const tickers = useMemo(() => [...new Set((data?.buys ?? []).map((move) => move.ticker).filter((ticker): ticker is string => ticker !== null))], [data]);
  const assets = useAssetsBySymbols(tickers);
  const equityIds = useMemo(() => [...assets.values()].filter((asset) => asset.assetType === "equity").map((asset) => asset.id), [assets]);
  const prices = usePrices(equityIds);
  const live = useMemo(() => {
    const map: Live = new Map();
    for (const [symbol, asset] of assets) {
      if (asset.assetType !== "equity") continue;
      const price = prices.rows.get(asset.id)?.price;
      if (price !== undefined) map.set(symbol, price);
    }
    return map;
  }, [assets, prices]);

  if (data === null) {
    return (
      <section aria-label={t("Alpha from today's filings")} className="px-4 pt-5">
        <p className="type-eyebrow text-text-muted">{t("Alpha from today’s filings")}</p>
        {failed ? (
          <p className="type-body-sm mt-2 text-text-secondary">{t("EDGAR could not be read just now. Trying again shortly.")}</p>
        ) : (
          <div aria-busy="true" aria-label={t("Reading filings")} className="mt-2 space-y-2">
            <div className="skeleton h-28 rounded-card" />
            <div className="grid grid-cols-2 gap-2">
              <div className="skeleton h-16 rounded-card" />
              <div className="skeleton h-16 rounded-card" />
            </div>
          </div>
        )}
      </section>
    );
  }
  if (!data.configured) {
    return <p className="type-body-sm px-4 pt-5 text-text-secondary">{data.errors[0]}</p>;
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
  const spotlit =
    data.clusters[0] !== undefined
      ? `c${data.clusters[0].cik}`
      : data.buys[0] !== undefined
        ? `b${data.buys[0].accession}`
        : newStake !== undefined
          ? `k${newStake.accession}`
          : null;
  const spotlight: React.ReactNode =
    data.clusters[0] !== undefined ? (
      <ClusterCard cluster={data.clusters[0]} onAsk={onAsk} onOpen={onOpen} />
    ) : data.buys[0] !== undefined ? (
      <MoveCard move={data.buys[0]} live={live} onAsk={onAsk} onOpen={onOpen} highlight />
    ) : newStake !== undefined ? (
      <StakeCard stake={newStake} onAsk={onAsk} onOpen={onOpen} highlight />
    ) : null;

  const tiles: Array<{ board: BoardId; icon: LucideIcon; value: string; label: string; tone?: string }> = [
    {
      board: "buys",
      icon: TrendingUp,
      value: String(data.summary.insiderBuys),
      label: data.summary.buyValue > 0 ? t("insider buys · {value}", { value: formatCompactUsd(data.summary.buyValue) }) : t("insider buys"),
      tone: data.summary.insiderBuys > 0 ? "text-positive" : undefined,
    },
    {
      board: "stakes",
      icon: Users,
      value: String(data.summary.newActivists),
      label: t("new 5%+ stakes · {count} filings", { count: data.summary.activists }),
    },
    {
      board: "redFlags",
      icon: Flag,
      value: String(data.summary.redFlags),
      label: t("red flags in 8-Ks"),
      tone: data.summary.redFlags > 0 ? "text-negative" : undefined,
    },
    {
      board: "planned",
      icon: TrendingDown,
      value: formatCompactUsd(data.summary.plannedValue),
      label: t("planned insider sales · {count}", { count: data.summary.plannedSales }),
    },
  ];

  const why = t(BOARDS.find((entry) => entry.id === board)!.why);
  const select = (id: BoardId) => {
    setBoard(id);
    setShown(PAGE);
  };

  const all: React.ReactElement[] = (() => {
    switch (board) {
      case "buys":
        return [
          ...data.clusters.map((cluster) => <ClusterCard key={`c${cluster.cik}`} cluster={cluster} onAsk={onAsk} onOpen={onOpen} />),
          ...data.buys.map((move) => <MoveCard key={`b${move.accession}`} move={move} live={live} onAsk={onAsk} onOpen={onOpen} />),
        ];
      case "sells":
        return data.sells.map((move) => <MoveCard key={`s${move.accession}`} move={move} live={live} onAsk={onAsk} onOpen={onOpen} />);
      case "stakes":
        return data.activists.map((stake) => <StakeCard key={`k${stake.accession}`} stake={stake} onAsk={onAsk} onOpen={onOpen} />);
      case "redFlags":
        return data.redFlags.map((event) => <EventCard key={event.accession} event={event} onAsk={onAsk} onOpen={onOpen} now={now} />);
      case "catalysts":
        return data.catalysts.map((event) => <EventCard key={event.accession} event={event} onAsk={onAsk} onOpen={onOpen} now={now} />);
      case "leadership":
        return data.leadership.map((event) => <EventCard key={event.accession} event={event} onAsk={onAsk} onOpen={onOpen} now={now} />);
      case "planned":
        return data.plannedSales.map((sale) => <SaleCard key={sale.accession} sale={sale} onAsk={onAsk} onOpen={onOpen} />);
      case "ipos":
        return data.ipos.map((ipo) => <IpoCard key={ipo.accession} ipo={ipo} onAsk={onAsk} onOpen={onOpen} now={now} />);
    }
  })();

  const list = all.filter((card) => card.key !== spotlit);
  const reading = data.pending > 0;

  return (
    <section aria-label={t("Alpha from today's filings")} className="pt-5">
      <div className="flex items-center gap-2 px-4">
        <p className="type-eyebrow text-text-muted">{t("Alpha from today’s filings")}</p>
        <span className="type-label ml-auto flex items-center gap-1.5 text-text-secondary" aria-live="polite">
          {reading ? (
            <>
              <span aria-hidden className="listening-dot" />
              {t("Reading {pending} more", { pending: data.pending })}
            </>
          ) : (
            <>
              <span aria-hidden className="size-1.5 rounded-pill bg-positive" />
              {t("{read} filings read", { read: data.read })}
            </>
          )}
        </span>
      </div>
      {data.since && now !== null && (
        <p className="type-label px-4 pt-0.5 text-text-muted">
          {t("The latest {value} insider and ownership filings, back to {since}.", { value: data.read + data.pending, since: formatRelativeTime(data.since, now, t.locale) })}
        </p>
      )}

      {/* Spotlight */}
      {spotlight !== null && (
        <div className="px-4 pt-3">
          <p className="type-label mb-1.5 flex items-center gap-1.5 text-text-secondary">
            <Sparkles size={12} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {t("Worth a look first")}
          </p>
          <ul className="list-none">{spotlight}</ul>
        </div>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.board}
              type="button"
              onClick={() => select(tile.board)}
              aria-pressed={board === tile.board}
              className={cn(
                "flex flex-col items-start rounded-card border px-2.5 py-2 text-left",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                "focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
                board === tile.board ? "border-accent-quiet bg-surface-raised" : "border-border-subtle",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn("type-data text-text-primary", tile.tone)}>{tile.value}</span>
                <Icon size={13} strokeWidth={1.5} aria-hidden className="text-text-muted" />
              </span>
              <span className="type-label mt-0.5 text-text-secondary">{tile.label}</span>
            </button>
          );
        })}
      </div>

      {/* Boards */}
      <div role="tablist" aria-label={t("What to look at")} className="flex gap-1.5 overflow-x-auto px-4 pb-1 pt-3">
        {BOARDS.map((entry) => {
          const active = entry.id === board;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(entry.id)}
              className={cn(
                "type-label inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2.5",
                "transition-colors duration-[var(--dur-fast)] ease-brand focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
                active
                  ? "border-accent-quiet bg-surface-active text-text-primary"
                  : "border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {t(entry.label)}
              <span className={cn("type-data-sm", active ? "text-text-secondary" : "text-text-muted")}>{counts[entry.id]}</span>
            </button>
          );
        })}
      </div>
      <p className="type-label px-4 pt-1.5 text-text-muted">{why}</p>

      {list.length === 0 ? (
        <p className="type-body-sm mx-4 mt-2 rounded-card border border-border-subtle px-3 py-3 text-text-secondary">
          {reading
            ? t("Still reading the latest filings — this fills in over the next minute.")
            : board === "buys"
              ? t("No open-market insider purchases in the latest filings. They are rare: most Form 4s are grants, tax withholding and sales.")
              : t("None in the latest filings.")}
        </p>
      ) : (
        <>
          <ul className="flex list-none flex-col gap-2 px-4 pt-2">{list.slice(0, shown)}</ul>
          {list.length > shown && (
            <div className="px-4 pt-2">
              <button
                type="button"
                onClick={() => setShown((value) => value + PAGE * 2)}
                className="type-label inline-flex h-8 w-full items-center justify-center gap-1 rounded-control border border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("Show {value} more of {count}", { value: Math.min(PAGE * 2, list.length - shown), count: list.length })}
                <ArrowRight size={12} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
