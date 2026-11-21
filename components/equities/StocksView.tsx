"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ExternalLink, Landmark, RefreshCw, Search } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ISSUER_ORDER, matches, type EquityGroup, type EquityIssuer } from "@/lib/equities/catalogue";
import type { EquitiesCatalogue } from "@/lib/equities/server";
import { formatPriceUsd, truncateMiddle } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Every tokenized stock and ETF Elyra knows, grouped by the share behind it
   (lib/equities/catalogue.ts says what each issuer is). For each share: the
   share's own price, and each token's on-chain price and premium to it —
   the secondary market against the primary — with how that issuer's
   tokens are minted and redeemed, and a Trade button where Elyra can swap
   one in the person's wallet. Trading goes through the one swap path
   (SwapDialog); a Sunrise-listed stock asks the eligibility question there.
--------------------------------------------------------------------------- */

const ISSUER_LABEL: Record<EquityIssuer, string> = {
  sunrise: msg("Sunrise"),
  backed: msg("xStocks"),
  ondo: msg("Ondo"),
  robinhood: msg("Robinhood"),
};

const PRIMARY: Record<EquityIssuer, string> = {
  sunrise: msg(
    "Issued through Backpack's tokenization service and Trek Nexus Markets' trust, listed on Solana by Sunrise. Shares are converted to tokens and back on Backpack Exchange, with a Backpack account and its eligibility checks.",
  ),
  backed: msg("Backed Finance's xStocks on Solana. Minted and redeemed by Backed for its eligible clients."),
  ondo: msg("Ondo Global Markets' tokens on Solana. Minted and redeemed through Ondo for its eligible clients."),
  robinhood: msg("Robinhood's stock tokens on Robinhood Chain. Issued and redeemed by Robinhood."),
};

const SECONDARY: Record<EquityIssuer, string> = {
  sunrise: msg("Swapped in your wallet through Sunrise's routes — Jupiter, Titan, DFlow and its market makers — once you confirm you are eligible."),
  backed: msg("Swapped in your wallet through Jupiter."),
  ondo: msg("Swapped in your wallet through Jupiter, where Ondo's market maker quotes during its trading window."),
  robinhood: msg("Shown, not traded: Robinhood says they may not be sold to US persons, and Elyra cannot check that."),
};

/** Backpack's own page on converting shares to tokens and back, as Sunrise's docs link it. */
const BACKPACK_CONVERSION = "https://support.backpack.exchange/exchange/backpack-securities/tokenized-securities/conversion-flow";
const PAGE = 30;

function useEquities() {
  const [state, setState] = useState<{ data: EquitiesCatalogue | null; loading: boolean; failed: boolean }>({ data: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/equities")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as EquitiesCatalogue;
      })
      .then((data) => !cancelled && setState({ data, loading: false, failed: false }))
      .catch(() => !cancelled && setState((current) => ({ ...current, loading: false, failed: true })));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, reload };
}

function Premium({ value }: { value: number | null }) {
  if (value === null) return <span className="type-data-sm text-text-muted">—</span>;
  return (
    <span className={cn("type-data-sm tabular-nums", Math.abs(value) >= 2 ? "text-caution" : "text-text-secondary")}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function GroupCard({ group, onTrade }: { group: EquityGroup; onTrade: (symbol: string) => void }) {
  const t = useT();
  return (
    <li className="rounded-card border border-border-subtle bg-surface-raised p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="type-data text-text-primary">{group.ticker}</p>
          <p className="type-label truncate text-text-muted">{group.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="type-data-sm tabular-nums text-text-primary">{group.shareUsd === null ? "—" : formatPriceUsd(group.shareUsd)}</p>
          <p className="type-label text-text-muted">
            {group.session !== null && group.session !== "regular" ? t("Share price · outside regular hours") : t("Share price")}
          </p>
        </div>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-border-subtle">
        {group.tokens.map((token) => (
          <li key={`${token.chain}:${token.address}`} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="type-body-sm truncate text-text-primary">
                {token.symbol} <span className="type-label text-text-muted">· {t(ISSUER_LABEL[token.issuer])}</span>
              </p>
              <p className="type-mono-addr truncate text-text-muted">
                {token.chain === "solana" ? t("Solana") : t("Robinhood Chain")} · {truncateMiddle(token.address, 4, 4)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="type-data-sm tabular-nums text-text-primary">{token.priceUsd === null ? "—" : formatPriceUsd(token.priceUsd)}</p>
              <Premium value={token.premiumPct} />
            </div>
            {token.swap !== null ? (
              <Button size="xs" variant="quiet" onClick={() => onTrade(token.swap!.symbol)} aria-label={t("Trade {symbol}", { symbol: token.symbol })}>
                <ArrowRightLeft size={12} aria-hidden />
                {t("Trade")}
              </Button>
            ) : (
              <span className="type-label w-14 shrink-0 text-right text-text-muted">{t("Read only")}</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function StocksView() {
  const t = useT();
  const auth = useElyraAuth();
  const { data, loading, failed, reload } = useEquities();
  const [query, setQuery] = useState("");
  const [issuer, setIssuer] = useState<EquityIssuer | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const [trading, setTrading] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = data?.groups ?? [];
    return all
      .map((group) => (issuer === "all" ? group : { ...group, tokens: group.tokens.filter((token) => token.issuer === issuer) }))
      .filter((group) => group.tokens.length > 0 && matches(group, query));
  }, [data, issuer, query]);

  const trade = (symbol: string) => {
    if (!auth.authenticated) {
      auth.login();
      return;
    }
    setTrading(symbol);
  };

  return (
    <div className="@container flex flex-col gap-4">
      <DrawerCard icon={Landmark} title={t("Primary and secondary markets")}>
        <ul className="flex flex-col gap-3">
          {ISSUER_ORDER.filter((entry) => entry !== "sunrise" || data?.sunrise !== false).map((entry) => (
            <li key={entry} className="flex flex-col gap-0.5">
              <p className="type-body-sm text-text-primary">
                {t(ISSUER_LABEL[entry])}
                {data !== null && <span className="type-label text-text-muted"> · {t("{count} tokens", { count: data.counts[entry] })}</span>}
              </p>
              <p className="type-label text-text-secondary">
                <span className="text-text-muted">{t("Primary market")}: </span>
                {t(PRIMARY[entry])}
                {entry === "sunrise" && (
                  <>
                    {" "}
                    <a href={BACKPACK_CONVERSION} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                      {t("How conversion works")}
                      <ExternalLink size={10} aria-hidden />
                    </a>
                  </>
                )}
              </p>
              <p className="type-label text-text-secondary">
                <span className="text-text-muted">{t("Secondary market")}: </span>
                {t(SECONDARY[entry])}
              </p>
            </li>
          ))}
        </ul>
        <p className="type-label mt-3 text-text-muted">
          {t(
            "A tokenized stock is not the share: it gives no ownership in the company, and its issuer gives no guarantee of a market or of redemption. These tokens are not offered to US persons; Sunrise's are not offered to PRC residents either. The premium compares one token with one share, before any multiplier an issuer applies for dividends or corporate actions.",
          )}
        </p>
      </DrawerCard>

      <div className="flex flex-col gap-2">
        <label className="flex h-10 items-center gap-2 rounded-control border border-border-subtle bg-surface-base px-3">
          <Search size={14} className="text-text-muted" aria-hidden />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE);
            }}
            placeholder={t("Search a ticker or a company")}
            aria-label={t("Search tokenized stocks")}
            className="type-body-sm min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Issuer")}>
          {(["all", ...ISSUER_ORDER] as const)
            .filter((entry) => entry !== "sunrise" || data?.sunrise !== false)
            .map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={issuer === entry}
                onClick={() => {
                  setIssuer(entry);
                  setShown(PAGE);
                }}
                className={cn(
                  "type-label h-8 rounded-chip border px-2.5 transition-colors duration-[var(--dur-fast)] ease-brand",
                  issuer === entry ? "border-accent bg-accent text-text-on-accent" : "border-border-subtle text-text-secondary hover:text-text-primary",
                )}
              >
                {entry === "all" ? t("All issuers") : t(ISSUER_LABEL[entry])}
              </button>
            ))}
          <button type="button" onClick={reload} disabled={loading} aria-label={t("Refresh")} className="ml-auto grid size-8 place-items-center rounded-control text-text-muted hover:text-text-primary">
            <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={cn(loading && "motion-safe:animate-spin")} />
          </button>
        </div>
      </div>

      {data?.notes.map((note) => (
        <p key={note} className="type-label text-text-muted">
          {t(note)}
        </p>
      ))}

      {loading && data === null ? (
        <SkeletonRows rows={6} />
      ) : failed && data === null ? (
        <EmptyState
          title={t("Tokenized stocks could not be read just now.")}
          body={t("The listings and prices come from each issuer and from Pyth. Try again in a moment.")}
          action={
            <Button size="sm" variant="quiet" onClick={reload}>
              {t("Try again")}
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState title={t("Nothing matches that.")} body={t("Try a ticker such as TSLA, or a company name.")} />
      ) : (
        <>
          <p className="type-label text-text-muted">{t("{count} shares, each with its tokens", { count: groups.length })}</p>
          <ul className="flex flex-col gap-2">
            {groups.slice(0, shown).map((group) => (
              <GroupCard key={group.ticker} group={group} onTrade={trade} />
            ))}
          </ul>
          {groups.length > shown && (
            <Button size="sm" variant="quiet" onClick={() => setShown((value) => value + PAGE)}>
              {t("Show more")}
            </Button>
          )}
        </>
      )}

      {trading !== null && <SwapDialog address={auth.solanaAddress} onClose={() => setTrading(null)} initialFrom="USDC" initialTo={trading} />}
    </div>
  );
}
