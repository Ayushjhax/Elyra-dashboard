import { marketFor, PERP_MARKETS } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   A spoken order, understood by code. Pure.

   In a voice conversation, what the person says is first checked here. If it
   is an order — "long bitcoin, a hundred dollars, three x, stop at two
   percent", "buy fifty dollars of SOL", "close half my ETH", or the same in
   Chinese — it becomes a ticket; anything else is a question for Elyra.

   This is deliberately code, not the model. Elyra's model never moves money
   and is never asked what an order should be (CLAUDE.md, AI safety): the
   words are matched against Elyra's own markets and limits, and anything
   unclear is left out of the ticket rather than guessed. The ticket is then
   read back aloud and shown, and placed only through the same routes a
   ticket typed by hand uses, after the person confirms it.

   The vocabulary is fixed and predictable:
     · long / short (做多 / 做空)       → a Hyperliquid perp, market order
     · buy / sell / swap (买 / 卖 / 换)  → a swap in the person's own wallet
     · close (平仓)                      → close an open perp, whole or part
     · confirm / cancel (确认 / 取消)    → answer a ticket already read back
--------------------------------------------------------------------------- */

export type Side = "long" | "short";

export type VoiceCommand =
  | {
      kind: "perp";
      side: Side;
      coin: string;
      /** Null where the person did not say it: the ticket then uses the default, and says so. */
      sizeUsd: number | null;
      leverage: number | null;
      takeProfitPct: number | null;
      stopLossPct: number | null;
      mode: "paper" | "live";
    }
  | {
      kind: "swap";
      from: string;
      to: string;
      /** In `from`'s units; null when the person named only what to get. */
      amount: string | null;
    }
  | { kind: "close"; coin: string; fraction: 0.25 | 0.5 | 0.75 | 1 }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "none" };

/** What a ticket uses for anything not said — the chart's ticket's own defaults. */
export const TICKET_DEFAULTS = { sizeUsd: 100, leverage: 2, takeProfitPct: 4, stopLossPct: 2 } as const;

/* ---- numbers ---- */

const ONES: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** English number words to digits: "two hundred fifty" → "250", "one point five" → "1.5". */
function englishNumbers(text: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let index = 0;
  while (index < words.length) {
    let total = 0;
    let current = 0;
    let used = 0;
    let decimal = "";
    let cursor = index;
    for (; cursor < words.length; cursor += 1) {
      const word = words[cursor].replace(/-/g, " ");
      const parts = word.split(" ");
      let consumed = true;
      for (const part of parts) {
        const article = part === "a" || part === "an";
        if (article && (words[cursor + 1] === "hundred" || words[cursor + 1] === "thousand")) current += 1;
        else if (part in ONES && !article) current += ONES[part];
        else if (part in TENS) current += TENS[part];
        else if (part === "hundred") current = (current || 1) * 100;
        else if (part === "thousand" || part === "grand") {
          total += (current || 1) * 1_000;
          current = 0;
        } else if (part === "and" && used > 0) {
          /* "a hundred and fifty" */
        } else consumed = false;
      }
      if (!consumed) {
        if (word === "point" && used > 0 && cursor + 1 < words.length && words[cursor + 1] in ONES) {
          decimal = String(ONES[words[cursor + 1]]);
          cursor += 2;
        }
        break;
      }
      used += 1;
    }
    if (used > 0) {
      out.push(`${total + current}${decimal === "" ? "" : `.${decimal}`}`);
      index = cursor;
    } else {
      out.push(words[index]);
      index += 1;
    }
  }
  return out.join(" ");
}

const ZH_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Chinese numerals to digits: 五十 → 50, 一百二十 → 120, 两千 → 2000, 三点五 → 3.5. */
function chineseNumbers(text: string): string {
  return text.replace(/[零一二两三四五六七八九十百千万]+(?:点[零一二三四五六七八九]+)?/g, (match) => {
    const [whole, fraction] = match.split("点");
    let total = 0;
    let section = 0;
    let digit = 0;
    for (const char of whole) {
      if (char in ZH_DIGITS) digit = ZH_DIGITS[char];
      else if (char === "十") {
        section += (digit || 1) * 10;
        digit = 0;
      } else if (char === "百") {
        section += digit * 100;
        digit = 0;
      } else if (char === "千") {
        section += digit * 1_000;
        digit = 0;
      } else if (char === "万") {
        total += (section + digit) * 10_000;
        section = 0;
        digit = 0;
      }
    }
    const value = total + section + digit;
    const decimals = fraction === undefined ? "" : `.${[...fraction].map((char) => ZH_DIGITS[char] ?? "").join("")}`;
    return ` ${value}${decimals} `;
  });
}

/* ---- what the words name ---- */

/** Spoken names of Elyra's perp markets, English and Chinese. Tickers are matched directly. */
const PERP_NAMES: Record<string, string> = {
  bitcoin: "BTC", "bit coin": "BTC", 比特币: "BTC", 大饼: "BTC",
  ethereum: "ETH", ether: "ETH", 以太坊: "ETH", 以太: "ETH", 二饼: "ETH",
  solana: "SOL", 索拉纳: "SOL",
  hyperliquid: "HYPE",
  ripple: "XRP", 瑞波: "XRP",
  avalanche: "AVAX",
  chainlink: "LINK",
  dogecoin: "DOGE", 狗狗币: "DOGE",
  pepe: "kPEPE", bonk: "kBONK", shib: "kSHIB", "shiba inu": "kSHIB", shiba: "kSHIB",
  dogwifhat: "WIF", "dog wif hat": "WIF", "dog with hat": "WIF",
  "pudgy penguins": "PENGU", penguin: "PENGU",
  spx6900: "SPX",
  nvidia: "xyz:NVDA", 英伟达: "xyz:NVDA",
  apple: "xyz:AAPL", 苹果: "xyz:AAPL",
  microsoft: "xyz:MSFT", 微软: "xyz:MSFT",
  tesla: "xyz:TSLA", 特斯拉: "xyz:TSLA",
  amazon: "xyz:AMZN", 亚马逊: "xyz:AMZN",
  alphabet: "xyz:GOOGL", google: "xyz:GOOGL", 谷歌: "xyz:GOOGL",
  meta: "xyz:META", facebook: "xyz:META",
  palantir: "xyz:PLTR",
  coinbase: "xyz:COIN",
  "xyz 100": "xyz:XYZ100", xyz100: "xyz:XYZ100",
};

/** Spoken names of tokens on the swap list. Listed symbols are matched directly. */
const SWAP_NAMES: Record<string, string> = {
  sol: "SOL", solana: "SOL", 索拉纳: "SOL",
  usdc: "USDC", usdt: "USDT", jup: "JUP", bonk: "BONK", wif: "WIF",
  bitcoin: "CBBTC", 比特币: "CBBTC",
  jupiter: "JUP",
  dogwifhat: "WIF", "dog wif hat": "WIF",
  "usd coin": "USDC", dollars: "USDC", dollar: "USDC", 美元: "USDC", 美金: "USDC",
  tether: "USDT",
  nvidia: "NVDAX", 英伟达: "NVDAX",
  apple: "AAPLX", 苹果: "AAPLX",
  tesla: "TSLAX", 特斯拉: "TSLAX",
  microsoft: "MSFTX", 微软: "MSFTX",
  google: "GOOGLX", alphabet: "GOOGLX", 谷歌: "GOOGLX",
  amazon: "AMZNX", 亚马逊: "AMZNX",
  meta: "METAX",
  coinbase: "COINX",
  microstrategy: "MSTRX", strategy: "MSTRX",
};

/** Words that are never a ticker even when they spell one ("meme" the word, "a", "on"…). */
const NOT_TICKERS = new Set(["a", "an", "at", "of", "on", "to", "for", "and", "in", "my", "me", "it", "is", "go", "up", "x", "k", "usd"]);

function perpCoin(text: string): string | null {
  for (const [name, coin] of Object.entries(PERP_NAMES)) {
    if (new RegExp(`(?:^|[^a-z])${name.replace(/ /g, "\\s*")}(?:$|[^a-z])`, "i").test(text) || (/[^\x00-\x7f]/.test(name) && text.includes(name))) return coin;
  }
  for (const word of text.split(/[^a-z0-9]+/i)) {
    if (word.length < 2 || NOT_TICKERS.has(word.toLowerCase())) continue;
    const market = marketFor(word) ?? marketFor(`xyz:${word}`) ?? marketFor(`k${word}`);
    if (market !== null) return market.coin;
  }
  return null;
}

/** Every swap token named, in the order said. */
function swapTokens(text: string, listed: ReadonlySet<string>): string[] {
  const found: Array<{ at: number; symbol: string }> = [];
  for (const [name, symbol] of Object.entries(SWAP_NAMES)) {
    const pattern = /[^\x00-\x7f]/.test(name) ? new RegExp(name, "g") : new RegExp(`(?:^|[^a-z])(${name.replace(/ /g, "\\s*")})(?=$|[^a-z])`, "gi");
    for (const match of text.matchAll(pattern)) found.push({ at: match.index ?? 0, symbol });
  }
  for (const match of text.matchAll(/[a-z][a-z0-9]{1,9}/gi)) {
    const word = match[0].toUpperCase();
    if (NOT_TICKERS.has(match[0].toLowerCase())) continue;
    if (listed.has(word)) found.push({ at: match.index ?? 0, symbol: word });
  }
  found.sort((a, b) => a.at - b.at);
  const ordered: string[] = [];
  for (const entry of found) if (ordered[ordered.length - 1] !== entry.symbol && !ordered.includes(entry.symbol)) ordered.push(entry.symbol);
  return ordered;
}

/* ---- the utterance ---- */

const CONFIRM = /^(?:ok(?:ay)?[, ]*)?(?:yes|yeah|yep|confirm|confirmed|confirm it|place it|do it|go ahead|send it|execute)(?:[, ]*(?:please|now|confirm))?$|^(?:确认|确定|下单|是的|对|好的?)(?:下单)?$/;
const CANCEL = /^(?:no|nope|cancel|cancel it|stop|never ?mind|don'?t|scrap (?:it|that))(?:[, ]*please)?$|^(?:取消|不要|算了|不用了?)$/;

function normalise(raw: string): string {
  return chineseNumbers(
    raw
      .toLowerCase()
      /* Fractions first, before their numerals become digits. */
      .replace(/四分之三/g, " three quarters ")
      .replace(/四分之一/g, " quarter ")
      .replace(/一半/g, " half ")
      /* "百分之三" is three percent; its 百 is not a hundred. */
      .replace(/百分之/g, "§")
      .replace(/[，、]/g, ",")
      .replace(/[。！？]/g, ".")
      .replace(/％/g, "%")
      .replace(/\$\s?(\d)/g, "usd$1")
      .replace(/(\d),(?=\d{3}\b)/g, "$1"),
  )
    .replace(/§\s*(\d+(?:\.\d+)?)/g, "$1%")
    .replace(/\busd(\d[\d.]*)/g, "$1 usd")
    .replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_match, figure: string) => String(Number(figure) * 1_000))
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;

const POLITE = /^(?:(?:ok(?:ay)?|so|hey elyra|elyra|please|can you|could you|would you|will you|i want to|i'?d like to|i wanna|let'?s|go ahead and|just)[, ]*)+|^(?:请|帮我|给我|我要|我想)+/;
const ORDER_VERB = /^(?:go |open (?:a )?)?(?:long|short|buy|purchase|get me|sell|dump|swap|convert|exchange|close|exit|flatten|take off)\b|^(?:做多|开多|做空|开空|买|购买|卖|兑换|换|把|用|平仓|平掉|平)/;

function firstNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Leverage, TP, SL and size out of a perp order, each by its own marker. */
function perpFigures(text: string) {
  const leverage =
    firstNumber(text, new RegExp(`${NUMBER}\\s*(?:x|times|倍)(?![a-z])`)) ??
    firstNumber(text, new RegExp(`(?:leverage|杠杆)(?:\\s*of)?\\s*${NUMBER}`));
  const takeProfitPct = firstNumber(text, new RegExp(`(?:take[ -]?profit|target|tp|止盈)(?:\\s*(?:at|of|is))?\\s*${NUMBER}`));
  const stopLossPct = firstNumber(text, new RegExp(`(?:stop[ -]?loss|stop|sl|止损)(?:\\s*(?:at|of|is))?\\s*${NUMBER}`));
  /* Size: a figure with a currency word; else the first figure no other marker claimed. */
  let sizeUsd = firstNumber(text, new RegExp(`${NUMBER}\\s*(?:usd|usdc|dollars?|bucks|美元|美金|刀|u)(?![a-z])`));
  if (sizeUsd === null) {
    const claimed = text
      .replace(new RegExp(`${NUMBER}\\s*(?:x|times|倍)(?![a-z])`, "g"), " ")
      .replace(new RegExp(`(?:leverage|杠杆|take[ -]?profit|target|tp|止盈|stop[ -]?loss|stop|sl|止损)(?:\\s*(?:at|of|is))?\\s*${NUMBER}\\s*(?:%|percent|个点)?`, "g"), " ")
      .replace(new RegExp(`${NUMBER}\\s*(?:%|percent)`, "g"), " ");
    sizeUsd = firstNumber(claimed, new RegExp(`(?:^|[^a-z0-9.])${NUMBER}(?![a-z0-9.%])`));
  }
  return { sizeUsd, leverage, takeProfitPct, stopLossPct };
}

/**
 * What an utterance asks for. `swapSymbols` is the swap list as the server
 * serves it (/api/swap/tokens), so a token can be named by its ticker.
 */
export function parseVoiceCommand(raw: string, options: { swapSymbols?: readonly string[] } = {}): VoiceCommand {
  const said = englishNumbers(normalise(raw)).replace(/[.!?。]+$/, "").trim();
  if (said.length === 0) return { kind: "none" };
  if (CONFIRM.test(said)) return { kind: "confirm" };
  if (CANCEL.test(said)) return { kind: "cancel" };

  /* "Please", "can you", "帮我" before an order still make it an order… */
  const text = said.replace(POLITE, "").trim();
  const ordering = ORDER_VERB.test(text);
  /* …but a question about an order is a question. */
  if (!ordering || /\?|吗|为什么|怎么|是否|应该/.test(text)) return { kind: "none" };

  const live = /\b(?:live|real money|for real)\b|实盘|真钱/.test(text);

  /* ---- close ---- */
  if (/\b(?:close|exit|flatten|take off)\b|平仓|平掉|平了/.test(text)) {
    const coin = perpCoin(text);
    if (coin === null) return { kind: "none" };
    const fraction = /three quarters|3 quarters|四分之三|75 ?%/.test(text)
      ? 0.75
      : /\bhalf\b|一半|50 ?%/.test(text)
        ? 0.5
        : /\bquarter\b|四分之一|25 ?%/.test(text)
          ? 0.25
          : 1;
    return { kind: "close", coin, fraction };
  }

  /* ---- perps ---- */
  const side: Side | null = /\b(?:go |open (?:a )?)?long\b|做多|开多|多单/.test(text)
    ? "long"
    : /\b(?:go |open (?:a )?)?short\b|做空|开空|空单/.test(text)
      ? "short"
      : null;
  if (side !== null) {
    const coin = perpCoin(text);
    if (coin === null) return { kind: "none" };
    return { kind: "perp", side, coin, ...perpFigures(text), mode: live ? "live" : "paper" };
  }

  /* ---- swaps ---- */
  const listed = new Set((options.swapSymbols ?? []).map((symbol) => symbol.toUpperCase()));
  const buying = /\b(?:buy|purchase|get me)\b|买入|购买|买/.test(text);
  const selling = /\b(?:sell|dump)\b|卖出|卖掉|卖/.test(text);
  const swapping = /\b(?:swap|convert|exchange)\b|兑换|换成|换/.test(text);
  if (!buying && !selling && !swapping) return { kind: "none" };

  const tokens = swapTokens(text, listed);
  const dollars = firstNumber(text, new RegExp(`${NUMBER}\\s*(?:usd|dollars?|bucks|美元|美金|刀)(?![a-z])`));
  const anyNumber = firstNumber(text, new RegExp(`(?:^|[^a-z0-9.])${NUMBER}(?![a-z0-9.%])`));
  const others = tokens.filter((symbol) => symbol !== "USDC");

  if (buying && !swapping) {
    const target = others[0] ?? null;
    if (target === null) return { kind: "none" };
    /* "Buy fifty dollars of SOL" pays USDC; "buy 2 SOL" says what to get, not what to pay — left for the dialog. */
    return { kind: "swap", from: "USDC", to: target, amount: dollars === null ? null : String(dollars) };
  }
  if (selling && !swapping) {
    const source = others[0] ?? null;
    if (source === null) return { kind: "none" };
    return { kind: "swap", from: source, to: "USDC", amount: dollars === null && anyNumber !== null ? String(anyNumber) : null };
  }
  /* "Swap 25 USDC for JUP", "把 25 USDC 换成 JUP": the first token named is sold. */
  if (tokens.length < 2) return { kind: "none" };
  return { kind: "swap", from: tokens[0], to: tokens[1], amount: anyNumber === null ? null : String(anyNumber) };
}

/** A perp order with the defaults filled in, and which of them were not said. */
export function completePerp(command: Extract<VoiceCommand, { kind: "perp" }>): {
  order: { coin: string; side: Side; sizeUsd: number; leverage: number; takeProfitPct: number; stopLossPct: number; mode: "paper" | "live" };
  defaulted: Array<"sizeUsd" | "leverage" | "takeProfitPct" | "stopLossPct">;
} {
  const defaulted: Array<"sizeUsd" | "leverage" | "takeProfitPct" | "stopLossPct"> = [];
  const pick = <K extends keyof typeof TICKET_DEFAULTS>(key: K, said: number | null): number => {
    if (said !== null) return said;
    defaulted.push(key);
    return TICKET_DEFAULTS[key];
  };
  return {
    order: {
      coin: command.coin,
      side: command.side,
      sizeUsd: pick("sizeUsd", command.sizeUsd),
      leverage: pick("leverage", command.leverage),
      takeProfitPct: pick("takeProfitPct", command.takeProfitPct),
      stopLossPct: pick("stopLossPct", command.stopLossPct),
      mode: command.mode,
    },
    defaulted,
  };
}

/** The market's spoken label: "BTC", "NVIDIA", "kPEPE". */
export function marketLabel(coin: string): string {
  const market = PERP_MARKETS.find((entry) => entry.coin === coin);
  return market === undefined ? coin : market.label.replace(/\s*\(.*\)$/, "");
}

/** Whether a spoken "confirm" may place this ticket: paper only — live money needs a tap. */
export function voiceMayConfirm(command: VoiceCommand): boolean {
  return command.kind === "perp" && command.mode === "paper";
}

