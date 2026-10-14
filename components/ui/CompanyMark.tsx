import { Briefcase, Building2, Landmark, Rocket, University, type LucideIcon } from "lucide-react";
import { CoinMark } from "@/components/ui/CoinMark";
import { cn } from "@/lib/utils";

/**
 * SEC-listed company artwork, using the same source as the market catalog.
 *
 * Two sources by ticker — Parqet, then Financial Modeling Prep, which covers
 * the small caps and OTC names Parqet does not — before the lettered chip.
 * Both answer an unknown ticker with an error rather than a placeholder, so
 * a miss falls through instead of showing someone else's logo.
 */
export function CompanyMark({ ticker, logo, size = 28, name }: {
  ticker: string;
  logo?: string | null;
  size?: number;
  /** When given, a company with no logo anywhere is marked by its kind. */
  name?: string;
}) {
  const symbol = encodeURIComponent(ticker.toUpperCase());
  const parqet = `https://assets.parqet.com/logos/symbol/${symbol}`;
  const fmp = `https://financialmodelingprep.com/image-stock/${symbol}.png`;
  const source = logo ?? parqet;
  return (
    <CoinMark
      key={source}
      symbol={ticker}
      logo={source}
      fallbackLogo={logo ? parqet : fmp}
      fallback={name ? <FilerMark name={name} size={size} listed /> : undefined}
      size={size}
    />
  );
}

/** What an unlisted filer is, from its registered name. */
export function filerKind(name: string): { icon: LucideIcon; label: string } {
  const value = name.toUpperCase();
  if (/\b(FUND|TRUST|ETF|PORTFOLIOS?|SERIES|INCOME)\b/.test(value)) return { icon: Landmark, label: "Fund or trust" };
  if (/\bACQUISITION\b/.test(value)) return { icon: Rocket, label: "Blank-cheque company" };
  if (/\b(BANK|BANCORP|BANCSHARES|SAVINGS)\b/.test(value)) return { icon: University, label: "Bank" };
  if (/\b(L\.?P\.?|LLC|PARTNERS|CAPITAL|MANAGEMENT|ADVISORS?|INVESTMENTS?|VENTURES)\b/.test(value)) {
    return { icon: Briefcase, label: "Investment firm" };
  }
  return { icon: Building2, label: "Company" };
}

/**
 * A filer with no exchange listing — a fund, a private company, a SPAC
 * before it lists. There is no logo to find, so it is marked by what it is
 * rather than by a lone initial.
 */
export function FilerMark({
  name,
  size = 28,
  className,
  listed = false,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Listed, but with no logo to show. */
  listed?: boolean;
}) {
  const { icon: Icon, label } = filerKind(name);
  return (
    <span
      title={listed ? label : `${label} · not listed on a US exchange`}
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill border border-border-strong bg-surface-active text-text-secondary",
        className,
      )}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.5} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
