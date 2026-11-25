import type { Messages } from "../../translate";
import { analysis } from "./analysis";
import { agent } from "./agent";
import { arena } from "./arena";
import { assets } from "./assets";
import { automation } from "./automation";
import { briefing } from "./briefing";
import { catalog } from "./catalog";
import { common } from "./common";
import { connections } from "./connections";
import { copy } from "./copy";
import { dynamic } from "./dynamic";
import { equities } from "./equities";
import { events } from "./events";
import { funds } from "./funds";
import { invest } from "./invest";
import { markets } from "./markets";
import { personalized } from "./personalized";
import { paper } from "./paper";
import { portfolio } from "./portfolio";
import { rails } from "./rails";
import { referrals } from "./referrals";
import { research } from "./research";
import { shell } from "./shell";
import { telegram } from "./telegram";
import { trade } from "./trade";
import { voice } from "./voice";
import { wallet } from "./wallet";
import { workspace } from "./workspace";
import { strategies } from "./strategies";
import { insider } from "./insider";
import { scout } from "./scout";
import { portfolioOverview } from "./portfolioOverview";
import { backpackStocks } from "./backpackStocks";

/* ---------------------------------------------------------------------------
   Simplified Chinese.

   Keyed by the English text, split by the part of the product it belongs to
   so a change to one surface edits one file. Where two parts share a word
   the first file to define it is enough — later spreads only add.

   Voice follows docs/ELYRA_BRAND.md §6 in Chinese: precise, quiet, never
   excited about money; errors give the cause and the fix; no exclamation
   marks. Tickers, venue and product names (Solana, Hyperliquid, Jupiter,
   Elyra, USDC) stay in Latin script, as Chinese crypto readers write them.
   Full-width punctuation in Chinese sentences; figures stay ASCII.
--------------------------------------------------------------------------- */

export const zhCN: Messages = {
  ...analysis,
  ...strategies,
  ...insider,
  ...scout,
  ...portfolioOverview,
  ...backpackStocks,
  ...agent,
  ...arena,
  ...assets,
  ...automation,
  ...briefing,
  ...catalog,
  ...common,
  ...connections,
  ...copy,
  ...dynamic,
  ...equities,
  ...events,
  ...funds,
  ...invest,
  ...markets,
  ...personalized,
  ...paper,
  ...portfolio,
  ...rails,
  ...referrals,
  ...research,
  ...shell,
  ...telegram,
  ...trade,
  ...voice,
  ...wallet,
  ...workspace,
};
