import { describe, expect, it } from "vitest";
import { LABEL_TEXT } from "@/lib/arena/review";
import { MARKET_GROUP_LABEL } from "@/lib/autotrade/rules";
import { HORIZONS } from "@/lib/desk/protocol";
import { SEATS } from "@/lib/desk/roster";
import { CLUSTER_LABEL } from "@/lib/solana/cluster";
import {
  CATEGORY_LABEL,
  ELIGIBILITY_NOTE,
  HOW_IT_WORKS,
  INCOME_NOTE,
  NOT_ADVICE_NOTE,
  PORTFOLIOS,
  RISK_LABEL,
} from "@/lib/invest/catalog";
import { zhCN } from "./messages/zh-CN";

/* ---------------------------------------------------------------------------
   Text the website translates through a variable is complete too.

   The coverage test sees only literal keys. The Intelligent Portfolios
   catalog, the cluster names, the Arena's review labels and the Desk's
   seats reach `t()` as data, so they are checked here against the data
   itself: a portfolio or a seat added in English fails until it has its
   Chinese.
--------------------------------------------------------------------------- */

const untranslated = (texts: readonly string[]) => texts.filter((text) => zhCN[text] === undefined);

describe("Simplified Chinese for data-driven text", () => {
  it("covers every portfolio's name, summary, thesis and holding roles", () => {
    const texts = PORTFOLIOS.flatMap((portfolio) => [
      portfolio.name,
      portfolio.summary,
      ...portfolio.thesis,
      ...portfolio.holdings.map((holding) => holding.role),
    ]);
    expect(untranslated(texts)).toEqual([]);
  });

  it("covers the catalog's labels and notes", () => {
    expect(
      untranslated([
        ...Object.values(CATEGORY_LABEL),
        ...Object.values(RISK_LABEL),
        ...HOW_IT_WORKS,
        INCOME_NOTE,
        ELIGIBILITY_NOTE,
        NOT_ADVICE_NOTE,
      ]),
    ).toEqual([]);
  });

  it("covers the Solana cluster names", () => {
    expect(untranslated(Object.values(CLUSTER_LABEL))).toEqual([]);
  });

  it("covers the Arena's review labels and the market groups", () => {
    expect(untranslated([...Object.values(LABEL_TEXT), ...Object.values(MARKET_GROUP_LABEL)])).toEqual([]);
  });

  it("covers the Desk's horizons, seat titles and lenses", () => {
    expect(untranslated([...HORIZONS.map((horizon) => horizon.label), ...SEATS.flatMap((seat) => [seat.title, seat.lens]), "The desk"])).toEqual([]);
  });
});
