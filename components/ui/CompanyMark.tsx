import { Briefcase, Building2, Landmark, Rocket, University, type LucideIcon } from "lucide-react";
import { CoinMark } from "@/components/ui/CoinMark";
import { Monogram } from "@/components/ui/Monogram";
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
 * A filer with no logo to find — a fund, a private company, a SPAC before
 * it lists, or a listed company no logo source carries. Its own monogram,
 * with a small badge saying what kind of filer it is when that is more than
 * "a company".
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
  const badge = Icon !== Building2 && size >= 22;
  return (
    <span
      title={listed ? `${name} · ${label}` : `${name} · ${label}, not listed on a US exchange`}
      style={{ width: size, height: size }}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <span className="inline-flex size-full overflow-hidden rounded-pill border border-border-subtle">
        <Monogram name={name} size={size} />
      </span>
      {badge && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-pill border-2 border-surface-panel bg-surface-raised text-text-secondary"
          style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
        >
          <Icon size={Math.max(8, Math.round(size * 0.28))} strokeWidth={2} />
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
