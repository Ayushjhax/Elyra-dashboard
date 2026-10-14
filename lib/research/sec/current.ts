import "server-only";

import { fail, ok, type ToolResult } from "@/lib/providers/types";
import { secText } from "@/lib/research/sec/client";
import { entitiesByCik } from "@/lib/research/sec/entities";
import { CATEGORIES, ITEM_LABELS, formLabel, type EdgarCategory } from "@/lib/research/sec/forms";

/* ---------------------------------------------------------------------------
   What the whole US market is filing, as it files it.

   EDGAR publishes its latest filings as an Atom feed, one form type per
   request — every registrant, listed or not, crypto or not. This reads it
   for the forms a market reader acts on and merges them newest first.

   Two things the feed does that the parser has to undo:

   - A Form 4 arrives as TWO entries with the same accession: one titled
     "(Reporting)" naming the insider, one "(Issuer)" naming the company.
     A 13D/G does the same with "(Filed by)" and "(Subject)". They are
     joined back into one filing: the company it is about, and who filed.
   - The summary is escaped HTML. An 8-K's items are in it as lines like
     "Item 2.02: Results of Operations…", and are read from there.

   The ticker beside each filing comes from the SEC's own CIK mapping. A
   filer it does not list has no ticker and is shown by name.
--------------------------------------------------------------------------- */

/** The feed moves by the minute; two is fresh enough and spares the SEC. */
const FEED_TTL_MS = 2 * 60_000;
/** Paired forms (4, 144, 13D/G) spend two entries a filing, so the page is generous. */
const PER_FORM = 80;

export interface FeedEntry {
  form: string;
  name: string;
  cik: string;
  role: string;
  url: string;
  accession: string;
  filedAt: string;
  items: string[];
}

export interface EdgarFiling {
  accession: string;
  form: string;
  label: string;
  company: string;
  cik: string;
  ticker: string | null;
  /** Who filed it about the company: the insider on a Form 4, the holder on a 13D/G. */
  filer: string | null;
  /** 8-K items as "2.02 Results of operations". */
  items: Array<{ code: string; label: string }>;
  filedAt: string;
  url: string;
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const TITLE = /^(.+?) - (.+) \((\d{10})\) \(([^)]+)\)$/;

/** Entries out of the Atom feed. Pure, so it is tested against a captured feed. */
export function parseCurrentFeed(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = match[1];
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(body)?.[1]?.trim() ?? "");
    const parts = TITLE.exec(title);
    if (parts === null) continue;
    const url = /<link[^>]*href="([^"]+)"/.exec(body)?.[1] ?? "";
    const accession = /accession-number=([\d-]+)/.exec(body)?.[1] ?? "";
    const filedAt = /<updated>([^<]+)<\/updated>/.exec(body)?.[1] ?? "";
    const summary = decode(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(body)?.[1] ?? "");
    const items = [...summary.matchAll(/Item (\d+\.\d+)/g)].map((item) => item[1]);
    if (url.length === 0 || accession.length === 0) continue;
    entries.push({
      form: parts[1].trim(),
      name: parts[2].trim(),
      cik: parts[3],
      role: parts[4].trim(),
      url,
      accession,
      filedAt,
      items,
    });
  }
  return entries;
}

/** The company side of a paired filing, and the filer side. */
const SUBJECT_ROLES = new Set(["Issuer", "Subject", "Filer"]);
const FILER_ROLES = new Set(["Reporting", "Filed by"]);

/**
 * Joins the two halves of each filing and attaches tickers. Entries with no
 * company side (a reporting owner whose issuer entry fell outside the page)
 * are dropped rather than shown as if the person were the company.
 */
export function toFilings(entries: FeedEntry[], tickers: Map<string, { ticker: string }>): EdgarFiling[] {
  const byAccession = new Map<string, { subject?: FeedEntry; filer?: FeedEntry }>();
  for (const entry of entries) {
    const pair = byAccession.get(entry.accession) ?? {};
    if (SUBJECT_ROLES.has(entry.role)) pair.subject ??= entry;
    else if (FILER_ROLES.has(entry.role)) pair.filer ??= entry;
    byAccession.set(entry.accession, pair);
  }

  const filings: EdgarFiling[] = [];
  for (const [accession, { subject, filer }] of byAccession) {
    if (subject === undefined) continue;
    filings.push({
      accession,
      form: subject.form,
      label: formLabel(subject.form),
      company: subject.name,
      cik: subject.cik,
      ticker: tickers.get(subject.cik)?.ticker ?? null,
      filer: filer?.name ?? null,
      items: subject.items
        .filter((code) => code !== "9.01")
        .map((code) => ({ code, label: ITEM_LABELS[code] ?? `Item ${code}` })),
      filedAt: subject.filedAt,
      url: subject.url,
    });
  }
  return filings.sort((a, b) => Date.parse(b.filedAt) - Date.parse(a.filedAt));
}

async function feedFor(form: string): Promise<ToolResult<FeedEntry[]>> {
  const path =
    `/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}` +
    `&company=&dateb=&owner=include&start=0&count=${PER_FORM}&output=atom`;
  const result = await secText(path, FEED_TTL_MS, "www");
  if (!result.ok || result.data === undefined) {
    return fail("sec", result.error?.code ?? "UPSTREAM_UNAVAILABLE", result.error?.message ?? `The ${form} feed could not be read.`);
  }
  /* The feed's type filter matches by prefix: asking for "4" also returns
     424B2 prospectuses and 497 fund filings. Only the form asked for, and
     its amendments, are kept. */
  const wanted = (entry: FeedEntry) => {
    const base = entry.form.replace(/\/A$/, "");
    return base === form || (form === "10-K" && base === "10-KT");
  };
  return ok(parseCurrentFeed(result.data).filter(wanted), "sec", { asOf: result.asOf });
}

export interface LatestFilings {
  filings: EdgarFiling[];
  /** Forms that could not be read, by name. */
  errors: string[];
  asOf: string;
}

/** The newest filings across the market for a category. Never throws. */
export async function latestFilings(category: EdgarCategory, limit = 60): Promise<LatestFilings> {
  const forms =
    category === "all"
      ? CATEGORIES.flatMap((entry) => entry.forms)
      : (CATEGORIES.find((entry) => entry.id === category)?.forms ?? []);

  const [results, tickers] = await Promise.all([Promise.all(forms.map(feedFor)), entitiesByCik()]);
  const entries = results.flatMap((result) => result.data ?? []);
  const errors = forms.filter((_, index) => !results[index].ok);

  return {
    filings: toFilings(entries, tickers).slice(0, limit),
    errors,
    asOf: new Date().toISOString(),
  };
}
