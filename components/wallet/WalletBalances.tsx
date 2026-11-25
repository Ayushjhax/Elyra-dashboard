"use client";

import { Coins, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Money, Quantity, useBalancesHidden } from "@/components/portfolio/primitives";
import { IconButton, Tip } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { formatAge, truncateMiddle } from "@/lib/format";
import { useTickerLogos, type TickerLogo } from "@/lib/market/tickerLogos";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import type { TokenBalance } from "@/lib/wallet/types";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();
  return (
    <button
      type="button"
      onClick={wallet.refetch}
      disabled={wallet.refreshing}
      className="type-label relative font-medium text-text-primary underline decoration-border-strong underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2 hover:decoration-accent disabled:text-text-muted disabled:no-underline"
    >
      {wallet.refreshing ? t("Trying…") : t("Try again")}
    </button>
  );
}

/** The total, its state in words, and the switch that hides every figure. */
export function WalletTotal({ wallet }: { wallet: WalletDashboard }) {
  const t = useT();
  const hidden = useBalancesHidden();
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const snapshot = wallet.snapshot;

  let value: React.ReactNode;
  let note: React.ReactNode;
  let tone = "text-text-secondary";

  if (wallet.unconfigured) {
    value = <span className="text-text-muted">—</span>;
    note = t("This server has no Solana RPC configured (SOLANA_RPC_URL), so balances can't be read.");
    tone = "text-caution";
  } else if (snapshot === null && wallet.isLoading) {
    value = <span aria-label={t("Balance loading")} className="skeleton inline-block h-9 w-40 rounded-control align-middle" />;
    note = t("Reading this wallet…");
  } else if (snapshot === null) {
    value = <span className="text-text-muted">—</span>;
    note = (
      <>
        {wallet.error ?? t("The balance couldn't be read.")} <RetryLink wallet={wallet} />
      </>
    );
    tone = "text-negative";
  } else {
    const excluded = snapshot.uncounted.unpriced + snapshot.uncounted.unverified;
    value = (
      <Money
        value={snapshot.usdValue}
        reason={t("The SOL price is unavailable, so the total can't be valued.")}
        className={wallet.stale ? "text-text-secondary" : "text-text-primary"}
      />
    );
    if (wallet.stale) {
      note = (
        <>
          {wallet.fetchedAt !== null && now !== null
            ? t("Last good reading, {age} — the latest refresh failed.", { age: formatAge(wallet.fetchedAt, now, t.locale) })
            : t("Last good reading — the latest refresh failed.")}{" "}<RetryLink wallet={wallet} />
        </>
      );
      tone = "text-caution";
    } else if (snapshot.usdValue === null) {
      note = t("No SOL price right now, so the total can't be valued. The balances below are current.");
    } else if (excluded > 0) {
      note =
        excluded === 1
          ? t("Excludes 1 holding with no price or an unverified mint.")
          : t("Excludes {count} holdings with no price or an unverified mint.", { count: excluded });
    } else if (snapshot.sol === 0 && snapshot.tokenCount === 0) {
      note = t("Nothing in this wallet yet.");
    } else {
      note = t("Available in this wallet.");
    }
  }

  return (
    <section aria-label={t("Solana balance")} className="mx-5 border-t border-border-subtle py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* Named for its wallet: the drawer also lists the EVM wallet's
              balances, which this figure does not include. */}
          <p className="type-body-sm text-text-secondary">{t("Solana balance")}</p>
          {/* One line at the figure's height whatever is in it, so hiding,
              loading and landing never move the drawer. */}
          <p className="type-display mt-1 flex h-9 items-center truncate font-sans tabular-nums">{value}</p>
        </div>
        <IconButton
          label={hidden ? t("Show balances") : t("Hide balances")}
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

/** One holding: its mark, name, amount and value. Shared with the EVM section. */
export function AssetRow({
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
  const t = useT();
  return (
    <li className="flex items-center gap-3 py-2.5">
      <CoinMark symbol={symbol} {...logo} size={32} />
      <div className="min-w-0 flex-1">
        <p className="type-body flex items-center gap-1.5 text-text-primary">
          <span className="truncate">{symbol}</span>
          {/* The only place the reason is given, so it opens on a tap too —
              Radix's tooltip alone never opens on a touch screen. */}
          {unverified && (
            <Tip
              openOnTap
              label={t("Unverified token. Shown because it is in the wallet; not counted in the total, because anyone can create a token under a name that is already taken.")}
            >
              <button
                type="button"
                aria-label={t("Unverified token")}
                className="relative inline-flex shrink-0 rounded-chip text-negative after:absolute after:-inset-2.5"
              >
                <ShieldAlert size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </Tip>
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
  const t = useT();
  /* No name or ticker is invented: an unresolved mint is named by its address. */
  const symbol = token.symbol ?? truncateMiddle(token.mint, 4, 4);
  return (
    <AssetRow
      symbol={symbol}
      name={token.symbol === null ? token.mint : (token.name ?? token.mint)}
      logo={{ logo: token.icon }}
      amount={token.amount}
      usd={token.usdValue}
      reason={token.verified ? t("No price for this token from Jupiter.") : t("Unverified tokens are never valued.")}
      unverified={!token.verified}
    />
  );
}

/** Native SOL first, then every token the read returned. */
export function WalletAssets({ wallet }: { wallet: WalletDashboard }) {
  const t = useT();
  const logos = useTickerLogos(SOL);
  const snapshot = wallet.snapshot;

  if (snapshot === null) {
    if (!wallet.isLoading || wallet.unconfigured) return null;
    return (
      <section aria-label={t("Assets")} aria-busy="true" className="mx-5 border-t border-border-subtle py-4">
        <p className="type-h2 font-sans text-text-secondary">{t("Assets")}</p>
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
          {t("Assets")}
        </h3>
        {held > 0 && (
          <span className="type-body-sm tabular-nums text-text-secondary">
            {held} {held === 1 ? t("holding") : t("holdings")}
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
          reason={t("No SOL price from Pyth right now.")}
        />
        {snapshot.tokens.map((token) => (
          <TokenRow key={token.mint} token={token} />
        ))}
      </ul>

      {snapshot.tokenCount === 0 ? (
        <p className="type-body-sm flex items-center gap-3 border-t border-border-subtle py-3.5 text-text-secondary">
          <Coins size={18} strokeWidth={1.5} aria-hidden className="mx-[7px] shrink-0 text-text-muted" />
          {t("No other token balances yet.")}
        </p>
      ) : (
        <>
          {/* A capped list must not read as a complete one; the total above
              still counts every holding. */}
          {snapshot.tokenCount > snapshot.tokens.length && (
            <p className="type-label border-t border-border-subtle py-2.5 text-text-muted">
              {t("Showing the {count} largest of {tokenCount} tokens. The total includes them all.", { count: snapshot.tokens.length, tokenCount: snapshot.tokenCount })}
            </p>
          )}
          {excluded > 0 && (
            <p className="type-label border-t border-border-subtle py-2.5 text-text-muted">
              {(excluded === 1 ? t("{excluded} holding not in the total", { excluded }) : t("{excluded} holdings not in the total", { excluded }))}
              {snapshot.uncounted.unverified > 0 && t(" — {unverified} unverified", { unverified: snapshot.uncounted.unverified })}
              {snapshot.uncounted.unpriced > 0 && t(" — {unpriced} with no price", { unpriced: snapshot.uncounted.unpriced })}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
