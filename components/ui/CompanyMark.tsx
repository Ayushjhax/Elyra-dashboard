import { CoinMark } from "@/components/ui/CoinMark";

/** SEC-listed company artwork, using the same source as the market catalog. */
export function CompanyMark({ ticker, logo, size = 28 }: {
  ticker: string;
  logo?: string | null;
  size?: number;
}) {
  const source = logo ?? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker.toUpperCase())}`;
  return <CoinMark key={source} symbol={ticker} logo={source} size={size} />;
}
