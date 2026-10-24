import "server-only";

import {
  buildBoard,
  eventFlag,
  insiderMoves,
  plannedSaleFrom,
  stakeFrom,
  type DocMeta,
  type InsiderMove,
  type Ipo,
  type PlannedSale,
  type Stake,
} from "@/lib/research/sec/alpha-build";
import { secText } from "@/lib/research/sec/client";
import { feedPage, type FeedEntry } from "@/lib/research/sec/current";
import { entitiesByCik, resolveEntity } from "@/lib/research/sec/entities";
import { companySubmissions } from "@/lib/research/sec/filings";
import { ITEM_LABELS } from "@/lib/research/sec/forms";
import {
  companyName,
  parseForm144,
  parseForm4,
  parseSchedule13,
  xmlFromSubmission,
  type Form144,
  type Form4,
  type Schedule13,
} from "@/lib/research/sec/parse";
import type { AlphaResponse, CompanyInsiders } from "@/lib/research/sec/types";

export type { AlphaResponse, CompanyInsiders };

/* ---------------------------------------------------------------------------
   Reading today's filings for alpha.

   The live feed says THAT an insider filed a Form 4; only the filing itself
   says whether they bought, how much and at what price. So each structured
   filing is read once — one request for its full submission text — parsed,
   and kept for the life of the process: a filing never changes.

   Reading is the slow part (the SEC allows ~8 requests a second), so the
   route answers with what has been read and keeps reading in the
   background. It reads in small chunks, newest first and a few of each
   kind at a time, so a person who opens a company meanwhile waits behind a
   handful of requests rather than hundreds.
--------------------------------------------------------------------------- */

type Kind = "4" | "13" | "144";
type Doc = { kind: "4"; doc: Form4 } | { kind: "13"; doc: Schedule13 } | { kind: "144"; doc: Form144 } | { kind: "none" };

interface Wanted extends DocMeta {
  kind: Kind;
}

const DOC_CAP = 8_000;
const CHUNK = 6;
const MAX_FAILURES = 2;

const docs = new Map<string, Doc>();
const failures = new Map<string, number>();

function remember(accession: string, doc: Doc): void {
  if (docs.size >= DOC_CAP) {
    const oldest = docs.keys().next().value;
    if (oldest !== undefined) docs.delete(oldest);
  }
  docs.set(accession, doc);
}

function needsReading(wanted: Wanted): boolean {
  return !docs.has(wanted.accession) && (failures.get(wanted.accession) ?? 0) < MAX_FAILURES;
}

async function readDoc(wanted: Wanted): Promise<void> {
  let path: string;
  try {
    path = new URL(wanted.url.replace(/-index\.html?$/, ".txt")).pathname;
  } catch {
    remember(wanted.accession, { kind: "none" });
    return;
  }
  /* TTL 0: the parsed result is what is kept, not the text. */
  const result = await secText(path, 0, "www");
  if (!result.ok || result.data === undefined) {
    failures.set(wanted.accession, (failures.get(wanted.accession) ?? 0) + 1);
    return;
  }
  const xml = xmlFromSubmission(result.data);
  if (xml === null) {
    remember(wanted.accession, { kind: "none" });
    return;
  }
  if (wanted.kind === "4") {
    const doc = parseForm4(xml);
    remember(wanted.accession, doc ? { kind: "4", doc } : { kind: "none" });
  } else if (wanted.kind === "13") {
    const doc = parseSchedule13(xml);
    remember(wanted.accession, doc ? { kind: "13", doc } : { kind: "none" });
  } else {
    const doc = parseForm144(xml);
    remember(wanted.accession, doc ? { kind: "144", doc } : { kind: "none" });
  }
}

/** Reads every wanted document not yet read, a chunk at a time. */
async function readAll(list: Wanted[]): Promise<void> {
  const todo = list.filter(needsReading);
  for (let index = 0; index < todo.length; index += CHUNK) {
    await Promise.all(todo.slice(index, index + CHUNK).map(readDoc));
  }
}

/** Interleaves kinds so every board fills early: insider filings lead. */
function interleave(list: Wanted[]): Wanted[] {
  const byKind: Record<Kind, Wanted[]> = { "4": [], "13": [], "144": [] };
  for (const entry of list) byKind[entry.kind].push(entry);
  const out: Wanted[] = [];
  while (byKind["4"].length + byKind["13"].length + byKind["144"].length > 0) {
    out.push(...byKind["4"].splice(0, 3), ...byKind["13"].splice(0, 1), ...byKind["144"].splice(0, 1));
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let warming: Promise<void> | null = null;

/** The background read in progress, for `after()` to keep alive. */
export function warmingPromise(): Promise<void> {
  return warming ?? Promise.resolve();
}

/* ---------------------------------------------------------------------------
   The market board
--------------------------------------------------------------------------- */

const SUBJECT_ROLES = new Set(["Issuer", "Subject", "Filer"]);

function metaFor(entry: FeedEntry, tickers: Map<string, { ticker: string }>): DocMeta {
  return {
    accession: entry.accession,
    cik: entry.cik,
    company: companyName(entry.name),
    ticker: tickers.get(entry.cik)?.ticker ?? null,
    filedAt: entry.filedAt,
    url: entry.url,
  };
}

export async function alphaFeed(options: { budgetMs: number }): Promise<AlphaResponse> {
  const pages = await Promise.all([
    feedPage("4", 0, 100),
    feedPage("4", 100, 100),
    feedPage("SCHEDULE 13D", 0, 80),
    feedPage("144", 0, 80),
    feedPage("8-K", 0, 100),
    feedPage("S-1", 0, 60),
  ]);
  const [form4a, form4b, schedule13, form144, eightK, s1] = pages;
  const tickers = await entitiesByCik();
  const errors = ["Form 4", "Form 4 (older)", "Schedule 13D", "Form 144", "8-K", "S-1"].filter((_, index) => !pages[index].ok);

  /* One entry per filing: co-registrants (a trust and its depositor, a
     parent and its subsidiary) file the same document under one accession. */
  const subjects = (result: (typeof pages)[number], form: RegExp) => {
    const seenHere = new Set<string>();
    return (result.data ?? []).filter((entry) => {
      if (!SUBJECT_ROLES.has(entry.role) || !form.test(entry.form) || seenHere.has(entry.accession)) return false;
      seenHere.add(entry.accession);
      return true;
    });
  };

  const seen = new Set<string>();
  const wanted: Wanted[] = [];
  const add = (entries: FeedEntry[], kind: Kind) => {
    for (const entry of entries) {
      if (seen.has(entry.accession)) continue;
      seen.add(entry.accession);
      wanted.push({ ...metaFor(entry, tickers), kind });
    }
  };
  add([...subjects(form4a, /^4$/), ...subjects(form4b, /^4$/)], "4");
  add(subjects(schedule13, /13D/), "13");
  add(subjects(form144, /^144$/), "144");

  /* Start (or join) the background read, and give it a moment so a cold
     board is not empty. */
  const ordered = interleave(wanted);
  if (warming === null && ordered.some(needsReading)) {
    warming = readAll(ordered).finally(() => {
      warming = null;
    });
  }
  if (warming !== null && options.budgetMs > 0) await Promise.race([warming, sleep(options.budgetMs)]);

  /* ---- Build from what has been read ---- */
  const moves: InsiderMove[] = [];
  const stakes: Stake[] = [];
  const sales: PlannedSale[] = [];
  for (const entry of wanted) {
    const read = docs.get(entry.accession);
    if (read === undefined || read.kind === "none") continue;
    /* A ticker the SEC's map lacks can still be on the filing itself. */
    const meta: DocMeta = { ...entry, ticker: entry.ticker ?? (read.kind === "4" ? read.doc.ticker : null) };
    if (read.kind === "4") moves.push(...insiderMoves(read.doc, meta));
    else if (read.kind === "13") {
      const stake = stakeFrom(read.doc, meta);
      if (stake) stakes.push(stake);
    } else {
      const sale = plannedSaleFrom(read.doc, meta);
      if (sale) sales.push(sale);
    }
  }

  const events = subjects(eightK, /^8-K/)
    .map((entry) =>
      eventFlag(
        {
          form: entry.form,
          items: entry.items.filter((code) => code !== "9.01").map((code) => ({ code, label: ITEM_LABELS[code] ?? `Item ${code}` })),
        },
        metaFor(entry, tickers),
      ),
    )
    .filter((flag) => flag !== null);

  const ipos: Ipo[] = subjects(s1, /^S-1$/).map((entry) => ({ ...metaFor(entry, tickers), form: entry.form }));

  const pending = wanted.filter(needsReading).length;
  const insiderDates = wanted.filter((entry) => entry.kind === "4").map((entry) => entry.filedAt).sort();

  return {
    ...buildBoard({ moves, stakes, sales, events, ipos }),
    read: wanted.length - pending,
    pending,
    since: insiderDates[0] ?? null,
    errors,
    asOf: new Date().toISOString(),
    configured: true,
  };
}

/* ---------------------------------------------------------------------------
   One company's insiders
--------------------------------------------------------------------------- */

const companyReads = new Map<string, Promise<void>>();
const COMPANY_FILINGS = 30;

export async function companyInsiders(query: string, budgetMs: number): Promise<CompanyInsiders | null> {
  const resolved = await resolveEntity(query);
  if (!resolved.ok || resolved.data === undefined) return null;
  const { entity } = resolved.data;
  const submissions = await companySubmissions(entity.cik);
  const recent = (submissions.data?.filings ?? []).filter((filing) => filing.form === "4").slice(0, COMPANY_FILINGS);
  const wanted: Wanted[] = recent.map((filing) => ({
    kind: "4",
    accession: filing.accession,
    cik: entity.cik,
    company: companyName(submissions.data?.name || entity.companyName),
    ticker: entity.ticker,
    filedAt: filing.filedAt,
    url: filing.indexUrl,
  }));

  if (!companyReads.has(entity.cik) && wanted.some(needsReading)) {
    companyReads.set(
      entity.cik,
      readAll(wanted).finally(() => companyReads.delete(entity.cik)),
    );
  }
  const reading = companyReads.get(entity.cik);
  if (reading) await Promise.race([reading, sleep(budgetMs)]);

  const moves = wanted.flatMap((entry) => {
    const read = docs.get(entry.accession);
    return read?.kind === "4" ? insiderMoves(read.doc, entry) : [];
  });
  moves.sort((a, b) => (b.tradeDate ?? b.filedAt).localeCompare(a.tradeDate ?? a.filedAt));
  const buys = moves.filter((move) => move.kind === "buy");
  const sells = moves.filter((move) => move.kind === "sell");
  const sum = (list: InsiderMove[]) => list.reduce((total, move) => total + (move.value ?? 0), 0);

  return {
    ticker: entity.ticker,
    company: submissions.data?.name || entity.companyName,
    moves,
    pending: wanted.filter(needsReading).length,
    filings: wanted.length,
    since: wanted.at(-1)?.filedAt ?? null,
    summary: {
      buys: buys.length,
      buyValue: sum(buys),
      sells: sells.length,
      sellValue: sum(sells),
      buyers: new Set(buys.map((move) => move.insider)).size,
      sellers: new Set(sells.map((move) => move.insider)).size,
    },
  };
}
