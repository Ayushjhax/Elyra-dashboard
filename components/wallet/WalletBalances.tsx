"use client";

import { Coins, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Money, Quantity, useBalancesHidden } from "@/components/portfolio/primitives";
import { IconButton } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAge, truncateMiddle } from "@/lib/format";
import { useTickerLogos, type TickerLogo } from "@/lib/market/tickerLogos";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import type { TokenBalance } from "@/lib/wallet/types";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What the wallet holds, and what it is worth.

   Two rules govern every number here.

   A value that is not known is absent, never zero. Loading is a skeleton, a
   failed read is a dash with the reason beside it, and a token with no price
   shows a dash and is counted in the "not included" line — so neither the
   total nor a row is ever quietly smaller than the truth. $0.00 appears only
   for a wallet that was read and holds nothing.

   An unverified token is shown and never counted. Airdropping a mint named
   "USDC" at a wallet costs a few cents, and a total that added one in could
   be made to display any figure an attacker chose. It is marked, not
   hidden, because it genuinely is in the wallet.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

function RetryLink({ wallet }: { wallet: WalletDashboard }) {
  return (
    <button
      type="button"
      onClick={wallet.refetch}
      disabled={wallet.refreshing}
      className="type-label relative font-medium text-text-primary underline decoration-border-strong underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2 hover:decoration-accent disabled:text-text-muted disabled:no-underline"
    >
      {wallet.refreshing ? "Trying…" : "Try again"}
    </button>
  );
}

/** The total, its state in words, and the switch that hides every figure. */
export function WalletTotal({ wallet }: { wallet: WalletDashboard }) {
  const hidden = useBalancesHidden();
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const snapshot = wallet.snapshot;

  let value: React.ReactNode;
  let note: React.ReactNode;
  let tone = "text-text-secondary";

  if (wallet.unconfigured) {
    value = <span className="text-text-muted">—</span>;
    note = "This server has no Solana RPC configured (SOLANA_RPC_URL), so balances can't be read.";
    tone = "text-caution";
  } else if (snapshot === null && wallet.isLoading) {
    value = <span aria-label="Balance loading" className="skeleton inline-block h-9 w-40 rounded-control align-middle" />;
    note = "Reading this wallet…";
  } else if (snapshot === null) {
    value = <span className="text-text-muted">—</span>;
    note = (
      <>
        {wallet.error ?? "The balance couldn't be read."} <RetryLink wallet={wallet} />
      </>
    );
    tone = "text-negative";
  } else {
    const excluded = snapshot.uncounted.unpriced + snapshot.uncounted.unverified;
    value = (
      <Money
        value={snapshot.usdValue}
        reason="The SOL price is unavailable, so the total can't be valued."
        className={wallet.stale ? "text-text-secondary" : "text-text-primary"}
      />
    );
    if (wallet.stale) {
      note = (
        <>
          Last good reading{wallet.fetchedAt !== null && now !== null ? `, ${formatAge(wallet.fetchedAt, now)}` : ""} — the
          latest refresh failed. <RetryLink wallet={wallet} />
        </>
      );
      tone = "text-caution";
    } else if (snapshot.usdValue === null) {
      note = "No SOL price right now, so the total can't be valued. The balances below are current.";
    } else if (excluded > 0) {
      note = `Excludes ${excluded} holding${excluded === 1 ? "" : "s"} with no price or an unverified mint.`;
    } else if (snapshot.sol === 0 && snapshot.tokenCount === 0) {
      note = "Nothing in this wallet yet.";
    } else {
      note = "Available in this wallet.";
    }
  }

  return (
    <section aria-label="Total balance" className="mx-5 border-t border-border-subtle py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="type-body-sm text-text-secondary">Total balance</p>
          {/* One line at the figure's height whatever is in it, so hiding,
              loading and landing never move the drawer. */}
          <p className="type-display mt-1 flex h-9 items-center truncate font-sans tabular-nums">{value}</p>
        </div>
        <IconButton
          label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
          onClick={() => setHidden(!hidden)}
          className={cn("size-10 rounded-pill bg-surface-raised", hidden && "text-accent")}
        >
          {hidden ? <EyeOff size={18} strokeWidth={1.5} aria-hidden /> : <Eye size={18} strokeWidth={1.5} aria-hidden />}
        </IconButton>
      </div>
      <p className={cn("type-label mt-1.5", tone)}>{note}</p>
    </section>
  );
}

function AssetRow({
  symbol,
  name,
  logo,
  amount,
  usd,
  reason,
  unverified = false,
}: {
  symbol: string;
  name: string;
  logo: Partial<TickerLogo>;
  amount: number;
  usd: number | null;
  reason: string;
  unverified?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <CoinMark symbol={symbol} {...logo} size={32} />
      <div className="min-w-0 flex-1">
        <p className="type-body flex items-center gap-1.5 text-text-primary">
          <span className="truncate">{symbol}</span>
          {unverified && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex shrink-0 rounded-chip">
                  <ShieldAlert size={14} strokeWidth={1.5} aria-label="Unverified token" className="text-negative" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Unverified mint. Shown because it is in the wallet; not counted in the total, because anyone can
                mint a token under a name that is already taken.
              </TooltipContent>
            </Tooltip>
          )}
        </p>
        <p className="type-body-sm truncate text-text-secondary" title={name}>
          {name}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="type-data text-text-primary">
          <Quantity value={amount} /> {symbol}
        </span>
        <Money value={usd} reason={reason} className="type-body-sm text-text-secondary" />
      </div>
    </li>
  );
}

function TokenRow({ token }: { token: TokenBalance }) {
  /* No name or ticker is invented: an unresolved mint is named by its address. */
  const symbol = token.symbol ?? truncateMiddle(token.mint, 4, 4);
  return (
    <AssetRow
      symbol={symbol}
      name={token.symbol === null ? token.mint : (token.name ?? token.mint)}
      logo={{ logo: token.icon }}
      amount={token.amount}
      usd={token.usdValue}
      reason={token.verified ? "No price for this token from Jupiter." : "Unverified tokens are never valued."}
      unverified={!token.verified}
    />
  );
}

/** Native SOL first, then every token the read returned. */
export function WalletAssets({ wallet }: { wallet: WalletDashboard }) {
  const logos = useTickerLogos(SOL);
  const snapshot = wallet.snapshot;

  if (snapshot === null) {
    if (!wallet.isLoading || wallet.unconfigured) return null;
    return (
      <section aria-label="Assets" aria-busy="true" className="mx-5 border-t border-border-subtle py-4">
        <p className="type-h2 font-sans text-text-secondary">Assets</p>
        {[0, 1].map((index) => (
          <div key={index} aria-hidden className="flex items-center gap-3 py-2.5">
            <span className="skeleton size-8 rounded-pill" />
            <span className="skeleton h-3.5 w-20" />
            <span className="skeleton ml-auto h-3.5 w-16" />
          </div>
        ))}
      </section>
    );
  }

  /* Holdings with a balance — not the rows drawn. Native SOL is always
     drawn, at zero too, because it is the account rather than a holding;
     counting it would put "1 asset" on an empty wallet. */
  const held = (snapshot.sol > 0 ? 1 : 0) + snapshot.tokenCount;
  const excluded = snapshot.uncounted.unpriced + snapshot.uncounted.unverified;

  return (
    <section aria-labelledby="wallet-assets-heading" className="mx-5 border-t border-border-subtle pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="wallet-assets-heading" className="type-h2 font-sans text-text-secondary">
          Assets
        </h3>
        {held > 0 && (
          <span className="type-body-sm tabular-nums text-text-secondary">
            {held} {held === 1 ? "holding" : "holdings"}
          </span>
        )}
      </div>

      <ul className="mt-1 list-none">
        <AssetRow
          symbol="SOL"
          name="Solana"
          logo={logos("SOL")}
          amount={snapshot.sol}
          usd={snapshot.solUsd === null ? null : snapshot.sol * snapshot.solUsd}
          reason="No SOL price from Pyth right now."
        />
        {snapshot.tokens.map((token) => (
          <TokenRow key={token.mint} token={token} />
        ))}
      </ul>

      {snapshot.tokenCount === 0 ? (
        <p className="type-body-sm flex items-center gap-3 border-t border-border-subtle py-3.5 text-text-secondary">
          <Coins size={18} strokeWidth={1.5} aria-hidden className="mx-[7px] shrink-0 text-text-muted" />
          No other token balances yet.
        </p>
      ) : (
        <>
          {/* A capped list must not read as a complete one; the total above
              still counts every holding. */}
          {snapshot.tokenCount > snapshot.tokens.length && (
            <p className="type-label border-t border-border-subtle py-2.5 text-text-muted">
              Showing the {snapshot.tokens.length} largest of {snapshot.tokenCount} tokens. The total includes them all.
            </p>
          )}
          {excluded > 0 && (
            <p className="type-label border-t border-border-subtle py-2.5 text-text-muted">
              {excluded} holding{excluded === 1 ? "" : "s"} not in the total
              {snapshot.uncounted.unverified > 0 && ` — ${snapshot.uncounted.unverified} unverified`}
              {snapshot.uncounted.unpriced > 0 && ` — ${snapshot.uncounted.unpriced} with no price`}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
