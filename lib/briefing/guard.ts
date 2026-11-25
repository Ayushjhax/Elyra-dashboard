import { carriesLink, numbersIn, staysOnFacts } from "@/lib/arena/writer";

/* ---------------------------------------------------------------------------
   The briefing's writer is held to its facts the way every model-written
   public text is (lib/arena/writer.ts): a number the facts do not hold, a
   link or a stray domain, and the line is discarded.

   Chinese needs two allowances, both exact: an amount written in 万 or 亿
   ("$2.7 billion" is 27亿) and a month written as its number ("November 24"
   is 11月24日). They are derived from the English by code, so a translation
   that converts correctly passes and one that invents a figure still fails.
--------------------------------------------------------------------------- */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const SCALE: Array<[RegExp, number]> = [
  [/^(k|thousand)/i, 1e3],
  [/^(m|mn|million)/i, 1e6],
  [/^(b|bn|billion)/i, 1e9],
  [/^(t|tn|trillion)/i, 1e12],
];

const normal = (value: number) => String(Number(value.toPrecision(12)));

/** The numbers a Chinese rendering of `text` may use that the English does not show. */
export function chineseForms(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|tn|bn|mn|[kmbt])?\b/gi)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const scale = SCALE.find(([unit]) => unit.test(match[2] ?? ""))?.[1] ?? 1;
    const full = value * scale;
    out.add(normal(full));
    if (full >= 1e4) out.add(normal(full / 1e4));
    if (full >= 1e8) out.add(normal(full / 1e8));
  }
  const lower = text.toLowerCase();
  MONTHS.forEach((month, index) => {
    /* "November" and "Nov." alike; "Sept." too. */
    const short = month.slice(0, 3);
    if (lower.includes(month) || new RegExp(`\\b${short}${short === "sep" ? "t?" : ""}\\.?(?![a-z])`).test(lower)) out.add(String(index + 1));
  });
  return out;
}

/** Chinese numerals in front of a magnitude or percent: a figure the number check cannot read. */
const HAN_FIGURE = /[零一二三四五六七八九十百千两]+\s*(?:万|亿|%|％|个百分点)/;

export function englishStaysOnFacts(text: string, facts: readonly string[]): boolean {
  return staysOnFacts(text, facts);
}

export function chineseStaysOnFacts(text: string, sources: readonly string[]): boolean {
  if (HAN_FIGURE.test(text)) return false;
  const joined = sources.join("\n");
  const allowed = numbersIn(joined);
  for (const form of chineseForms(joined)) allowed.add(form);
  for (const number of numbersIn(text)) if (!allowed.has(number)) return false;
  return !carriesLink(text, sources);
}

/**
 * Words that are tickers and also everyday English. For these a ticker is
 * taken only when the facts write it in capitals or with a `$`.
 */
const COMMON = new Set(
  "MOVE ONE NEAR BASE LINK GAS SAFE BAND ACT WIN TRUE MAGIC PEOPLE HIGH HOOK SUN JUST OPEN PUMP FUN MAX LOOKS BLUR ANT ICE POWER DOG CAT BOND STORY FORM ZERO DEGEN RENDER LAYER SIGN OMNI SUPER AUCTION TRUMP CORE FLOW GAME HOT MASK ONDO SKY SOON".split(" "),
);

/** The names a source uses for a coin instead of its ticker: "Bitcoin", "Ether". */
const NAMES: Readonly<Record<string, readonly string[]>> = {
  BTC: ["bitcoin"],
  ETH: ["ether", "ethereum"],
  SOL: ["solana"],
  XRP: ["ripple"],
  BNB: ["bnb chain"],
  DOGE: ["dogecoin"],
  ADA: ["cardano"],
  AVAX: ["avalanche"],
  DOT: ["polkadot"],
  LINK: ["chainlink"],
  LTC: ["litecoin"],
  XMR: ["monero"],
  TRX: ["tron"],
  TON: ["toncoin"],
  APT: ["aptos"],
  ARB: ["arbitrum"],
  OP: ["optimism"],
  HYPE: ["hyperliquid"],
  ATOM: ["cosmos"],
  INJ: ["injective"],
  TIA: ["celestia"],
  AAVE: ["aave"],
  UNI: ["uniswap"],
  LDO: ["lido"],
  STRK: ["starknet"],
  ZEC: ["zcash"],
  BCH: ["bitcoin cash"],
  ETC: ["ethereum classic"],
  PEPE: ["pepe"],
  SHIB: ["shiba inu"],
  ENA: ["ethena"],
  JUP: ["jupiter"],
};

/** Whether the facts name `ticker` — "$SUI", "SUI", "Sui" for a ticker that is not a common word, or its coin's name. */
export function factsName(ticker: string, facts: readonly string[]): boolean {
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return false;
  const text = facts.join("\n");
  for (const name of NAMES[symbol] ?? []) {
    if (new RegExp(`(^|[^A-Za-z0-9])${name}([^A-Za-z0-9]|$)`, "i").test(text)) return true;
  }
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\$${escaped}\\b`, "i").test(text)) return true;
  if (new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`).test(text)) return true;
  if (symbol.length < 3 || COMMON.has(symbol)) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(text);
}
