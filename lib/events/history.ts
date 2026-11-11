import type { EventCategory } from "@/lib/events/types";

/* ---------------------------------------------------------------------------
   Crypto milestones that are not hacks, reviewed by hand. Pure.

   Hacks and exploits — the Binance and Bybit thefts, Mt. Gox, Ronin, the DAO
   — come from DefiLlama's hack list instead, read live (lib/events/
   defillama.ts), so their dates and amounts are DefiLlama's record rather
   than a copy here. This file holds what that list does not: halvings,
   collapses, upgrades, ETF approvals and laws.

   Every entry is a widely documented fact with a source. Figures are kept
   to the ones that are not in dispute; where accounts differ, the text says
   so in words rather than picking a number.
--------------------------------------------------------------------------- */

export interface Milestone {
  slug: string;
  /** UTC date, YYYY-MM-DD. */
  date: string;
  category: EventCategory;
  title: string;
  body: string;
  link: { label: string; url: string };
}

const WIKI = (page: string, label = "Wikipedia") => ({ label, url: `https://en.wikipedia.org/wiki/${page}` });

export const MILESTONES: Milestone[] = [
  {
    slug: "bitcoin-genesis",
    date: "2009-01-03",
    category: "milestone",
    title: "The Bitcoin genesis block is mined",
    body: "Satoshi Nakamoto mines the first block of the Bitcoin blockchain. Its coinbase carries a newspaper headline about bank bailouts, a timestamp and a statement in one line.",
    link: WIKI("History_of_bitcoin"),
  },
  {
    slug: "bitcoin-pizza-day",
    date: "2010-05-22",
    category: "milestone",
    title: "10,000 bitcoin for two pizzas",
    body: "Laszlo Hanyecz pays 10,000 BTC for two pizzas, the first widely known purchase of a physical good with bitcoin. The date is still marked as Bitcoin Pizza Day.",
    link: WIKI("Laszlo_Hanyecz"),
  },
  {
    slug: "first-halving",
    date: "2012-11-28",
    category: "halving",
    title: "Bitcoin's first halving",
    body: "The block reward falls from 50 to 25 BTC. Halvings repeat every 210,000 blocks, roughly every four years, until the 21 million supply cap is reached.",
    link: WIKI("Bitcoin_halving"),
  },
  {
    slug: "mt-gox-bankruptcy",
    date: "2014-02-28",
    category: "collapse",
    title: "Mt. Gox files for bankruptcy protection",
    body: "The Tokyo exchange, once handling most of the world's bitcoin trading, files for bankruptcy protection after disclosing that it had lost hundreds of thousands of its customers' bitcoin. Repayments to creditors took a decade.",
    link: WIKI("Mt._Gox"),
  },
  {
    slug: "ethereum-launch",
    date: "2015-07-30",
    category: "milestone",
    title: "Ethereum goes live",
    body: "Ethereum's first public release, Frontier, launches: a blockchain that runs programs — smart contracts — rather than only moving coins.",
    link: WIKI("Ethereum"),
  },
  {
    slug: "second-halving",
    date: "2016-07-09",
    category: "halving",
    title: "Bitcoin's second halving",
    body: "The block reward falls from 25 to 12.5 BTC.",
    link: WIKI("Bitcoin_halving"),
  },
  {
    slug: "dao-fork",
    date: "2016-07-20",
    category: "upgrade",
    title: "Ethereum hard-forks to reverse the DAO hack",
    body: "After an attacker drains The DAO, Ethereum forks to return the funds. The chain that refused the fork carries on as Ethereum Classic.",
    link: WIKI("The_DAO"),
  },
  {
    slug: "bitcoin-cash-fork",
    date: "2017-08-01",
    category: "upgrade",
    title: "Bitcoin Cash splits from Bitcoin",
    body: "A dispute over block size ends in a hard fork. Bitcoin Cash launches with larger blocks; every bitcoin holder at the fork receives the same amount of the new coin.",
    link: WIKI("Bitcoin_Cash"),
  },
  {
    slug: "third-halving",
    date: "2020-05-11",
    category: "halving",
    title: "Bitcoin's third halving",
    body: "The block reward falls from 12.5 to 6.25 BTC, two months after the market crash of March 2020.",
    link: WIKI("Bitcoin_halving"),
  },
  {
    slug: "coinbase-listing",
    date: "2021-04-14",
    category: "market",
    title: "Coinbase lists on Nasdaq",
    body: "Coinbase goes public through a direct listing, the first major US crypto exchange to trade on a stock exchange.",
    link: WIKI("Coinbase"),
  },
  {
    slug: "ethereum-london",
    date: "2021-08-05",
    category: "upgrade",
    title: "Ethereum's London upgrade burns fees",
    body: "EIP-1559 changes how Ethereum prices transactions: a base fee that is burned rather than paid to miners, so heavy use reduces the supply of ether.",
    link: { label: "ethereum.org", url: "https://ethereum.org/en/history/" },
  },
  {
    slug: "el-salvador-legal-tender",
    date: "2021-09-07",
    category: "regulation",
    title: "El Salvador makes bitcoin legal tender",
    body: "El Salvador becomes the first country to make bitcoin legal tender alongside the US dollar.",
    link: WIKI("Bitcoin_in_El_Salvador"),
  },
  {
    slug: "terra-collapse",
    date: "2022-05-09",
    category: "collapse",
    title: "TerraUSD loses its peg and LUNA collapses",
    body: "The algorithmic stablecoin UST falls away from one dollar and its sister token LUNA goes to nearly zero within days, erasing tens of billions of dollars of value and setting off a chain of failures across crypto lenders.",
    link: WIKI("Terra_(blockchain)"),
  },
  {
    slug: "celsius-freeze",
    date: "2022-06-12",
    category: "collapse",
    title: "Celsius freezes withdrawals",
    body: "The crypto lender Celsius halts all withdrawals, swaps and transfers, citing extreme market conditions. It files for bankruptcy a month later.",
    link: WIKI("Celsius_Network"),
  },
  {
    slug: "three-arrows-liquidation",
    date: "2022-06-27",
    category: "collapse",
    title: "Three Arrows Capital is ordered into liquidation",
    body: "A British Virgin Islands court orders the liquidation of the crypto hedge fund Three Arrows Capital after it fails to meet margin calls from its lenders.",
    link: WIKI("Three_Arrows_Capital"),
  },
  {
    slug: "the-merge",
    date: "2022-09-15",
    category: "upgrade",
    title: "The Merge: Ethereum moves to proof of stake",
    body: "Ethereum switches from mining to staking, cutting its energy use by more than 99.9%.",
    link: { label: "ethereum.org", url: "https://ethereum.org/en/roadmap/merge/" },
  },
  {
    slug: "ftx-bankruptcy",
    date: "2022-11-11",
    category: "collapse",
    title: "FTX files for bankruptcy",
    body: "FTX, then one of the largest crypto exchanges, files for Chapter 11 bankruptcy days after a run on its deposits. Its founder Sam Bankman-Fried was later convicted of fraud.",
    link: WIKI("Bankruptcy_of_FTX"),
  },
  {
    slug: "usdc-depeg",
    date: "2023-03-11",
    category: "market",
    title: "USDC briefly loses its peg",
    body: "After Silicon Valley Bank fails, Circle discloses that $3.3 billion of USDC's reserves are held there, and USDC trades well below one dollar for a weekend until US regulators guarantee the bank's deposits.",
    link: WIKI("USD_Coin"),
  },
  {
    slug: "ethereum-shapella",
    date: "2023-04-12",
    category: "upgrade",
    title: "Shapella lets stakers withdraw",
    body: "Ethereum's Shanghai and Capella upgrades let validators withdraw staked ether for the first time since staking began in 2020.",
    link: { label: "ethereum.org", url: "https://ethereum.org/en/history/" },
  },
  {
    slug: "binance-plea",
    date: "2023-11-21",
    category: "regulation",
    title: "Binance pleads guilty in the US",
    body: "Binance agrees to pay more than $4 billion to resolve US charges including money-laundering violations, and its founder Changpeng Zhao steps down as chief executive.",
    link: WIKI("Binance"),
  },
  {
    slug: "spot-bitcoin-etfs",
    date: "2024-01-10",
    category: "etf",
    title: "The SEC approves spot bitcoin ETFs",
    body: "The US Securities and Exchange Commission approves the first exchange-traded funds that hold bitcoin directly. They begin trading the next day.",
    link: { label: "SEC", url: "https://www.sec.gov/news/statement/gensler-statement-spot-bitcoin-011023" },
  },
  {
    slug: "ethereum-dencun",
    date: "2024-03-13",
    category: "upgrade",
    title: "Dencun makes layer-2 transactions cheaper",
    body: "Ethereum's Dencun upgrade adds blobs (EIP-4844), a cheaper place for rollups to post their data, cutting fees on layer-2 networks.",
    link: { label: "ethereum.org", url: "https://ethereum.org/en/roadmap/dencun/" },
  },
  {
    slug: "fourth-halving",
    date: "2024-04-20",
    category: "halving",
    title: "Bitcoin's fourth halving",
    body: "The block reward falls from 6.25 to 3.125 BTC at block 840,000.",
    link: WIKI("Bitcoin_halving"),
  },
  {
    slug: "spot-ether-etfs",
    date: "2024-05-23",
    category: "etf",
    title: "The SEC approves spot ether ETF listings",
    body: "The SEC approves exchanges' rule changes to list funds that hold ether directly. The funds begin trading in July 2024.",
    link: WIKI("Ethereum"),
  },
  {
    slug: "bitcoin-100k",
    date: "2024-12-05",
    category: "market",
    title: "Bitcoin crosses $100,000",
    body: "Bitcoin trades above $100,000 for the first time.",
    link: WIKI("History_of_bitcoin"),
  },
  {
    slug: "ethereum-pectra",
    date: "2025-05-07",
    category: "upgrade",
    title: "Pectra upgrades Ethereum's accounts and staking",
    body: "Ethereum's Pectra upgrade lets ordinary accounts act like smart-contract wallets for a transaction (EIP-7702) and raises the most a single validator can stake.",
    link: { label: "ethereum.org", url: "https://ethereum.org/en/roadmap/pectra/" },
  },
  {
    slug: "genius-act",
    date: "2025-07-18",
    category: "regulation",
    title: "The GENIUS Act becomes US law",
    body: "The United States enacts its first federal law for payment stablecoins, setting reserve and licensing rules for their issuers.",
    link: WIKI("GENIUS_Act"),
  },
];
