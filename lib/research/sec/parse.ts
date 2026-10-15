/* ---------------------------------------------------------------------------
   Reading the structured filings: Form 4, Schedule 13D/G and Form 144.

   All three are machine-generated XML inside the filing's full submission
   text, with a fixed vocabulary of tags. They are read with small
   extractors rather than a general XML parser: the documents are regular,
   the tags are known, and a missing tag reads as missing, never as zero.

   Client-safe and pure — fed strings, so every rule here is tested.
--------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&amp;": "&" };

export function decodeXml(text: string): string {
  return text
    .replace(/&(lt|gt|quot|apos|amp|#39);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** A tag, with or without a namespace prefix. */
function open(tag: string): string {
  return `<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>`;
}
function close(tag: string): string {
  return `</(?:[\\w-]+:)?${tag}>`;
}

/** Every `<tag>…</tag>` body, in document order. */
export function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`${open(tag)}([\\s\\S]*?)${close(tag)}`, "g");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

/** The text of the first `<tag>`, or its `<value>` when it wraps one. Null when absent or empty. */
export function text(xml: string, tag: string): string | null {
  const body = blocks(xml, tag)[0];
  if (body === undefined) return null;
  const inner = blocks(body, "value")[0] ?? body;
  const cleaned = decodeXml(inner.replace(/<[^>]+>/g, "")).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function number(xml: string, tag: string): number | null {
  const raw = text(xml, tag);
  if (raw === null) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function flag(xml: string, tag: string): boolean {
  const raw = text(xml, tag)?.toLowerCase();
  return raw === "1" || raw === "true";
}

/** The XML document inside a full submission text file. */
export function xmlFromSubmission(submission: string): string | null {
  const match = /<XML>([\s\S]*?)<\/XML>/i.exec(submission);
  return match ? match[1].trim() : null;
}

/** "MM/DD/YYYY" or "YYYY-MM-DD" to "YYYY-MM-DD". */
export function isoDate(value: string | null): string | null {
  if (value === null) return null;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/* ---------------------------------------------------------------------------
   Form 4 — what an insider traded
--------------------------------------------------------------------------- */

export interface Form4Owner {
  name: string;
  director: boolean;
  officer: boolean;
  tenPercent: boolean;
  title: string | null;
}

export interface Form4Transaction {
  /** P open-market purchase, S open-market sale, A grant, M exercise, F tax, G gift… */
  code: string;
  shares: number | null;
  price: number | null;
  acquired: boolean | null;
  date: string | null;
  ownedAfter: number | null;
  security: string | null;
}

export interface Form4 {
  issuerCik: string | null;
  issuerName: string | null;
  ticker: string | null;
  owners: Form4Owner[];
  /** Reported as made under a Rule 10b5-1 plan — scheduled in advance. */
  planned: boolean;
  transactions: Form4Transaction[];
}

export function parseForm4(xml: string): Form4 | null {
  const issuer = blocks(xml, "issuer")[0];
  if (issuer === undefined) return null;

  const owners = blocks(xml, "reportingOwner").map((owner) => {
    const relation = blocks(owner, "reportingOwnerRelationship")[0] ?? "";
    return {
      name: text(owner, "rptOwnerName") ?? "An insider",
      director: flag(relation, "isDirector"),
      officer: flag(relation, "isOfficer"),
      tenPercent: flag(relation, "isTenPercentOwner"),
      title: text(relation, "officerTitle") ?? text(relation, "otherText"),
    };
  });

  /* Non-derivative only: shares bought and sold. Options and grants sit in
     the derivative table and are not a decision to put money in. */
  const table = blocks(xml, "nonDerivativeTable")[0] ?? "";
  const transactions = blocks(table, "nonDerivativeTransaction").map((row) => {
    const acquired = text(row, "transactionAcquiredDisposedCode");
    return {
      code: text(blocks(row, "transactionCoding")[0] ?? "", "transactionCode") ?? "",
      shares: number(row, "transactionShares"),
      price: number(row, "transactionPricePerShare"),
      acquired: acquired === "A" ? true : acquired === "D" ? false : null,
      date: isoDate(text(row, "transactionDate")),
      ownedAfter: number(row, "sharesOwnedFollowingTransaction"),
      security: text(row, "securityTitle"),
    };
  });

  return {
    issuerCik: text(issuer, "issuerCik"),
    issuerName: text(issuer, "issuerName"),
    ticker: text(issuer, "issuerTradingSymbol")?.toUpperCase() ?? null,
    owners,
    planned: flag(xml, "aff10b5One"),
    transactions,
  };
}

/** "Chief Executive Officer" → "CEO". Short enough for a chip. */
export function roleOf(owner: Form4Owner): string {
  const title = (owner.title ?? "").toLowerCase();
  if (owner.officer && title) {
    if (/chief executive|\bceo\b/.test(title)) return "CEO";
    if (/chief financial|\bcfo\b/.test(title)) return "CFO";
    if (/chief operating|\bcoo\b/.test(title)) return "COO";
    if (/chief technology|\bcto\b/.test(title)) return "CTO";
    if (/general counsel|chief legal|\bclo\b/.test(title)) return "General counsel";
    if (/chair/.test(title)) return "Chair";
    if (/president/.test(title)) return "President";
    const short = owner.title?.trim() ?? "Officer";
    return short.length > 28 ? `${short.slice(0, 27)}…` : short;
  }
  if (owner.officer) return "Officer";
  if (owner.director) return "Director";
  if (owner.tenPercent) return "10% owner";
  return owner.title?.trim() || "Insider";
}

/* ---------------------------------------------------------------------------
   Schedule 13D / 13G — who owns more than 5%, and why
--------------------------------------------------------------------------- */

export interface StakeHolder {
  name: string;
  percent: number | null;
  shares: number | null;
  /** IN individual, IA adviser, PN partnership, CO corporation… */
  type: string | null;
}

export interface Schedule13 {
  form: string;
  issuerCik: string | null;
  issuerName: string | null;
  eventDate: string | null;
  holders: StakeHolder[];
  /** Item 4, the purpose of the transaction, as filed. */
  purpose: string | null;
}

export function parseSchedule13(xml: string): Schedule13 | null {
  const form = text(xml, "submissionType");
  if (form === null || !/13[DG]/.test(form)) return null;
  const holders = blocks(xml, "reportingPersonInfo").map((person) => ({
    name: text(person, "reportingPersonName") ?? "A holder",
    percent: number(person, "percentOfClass"),
    shares: number(person, "aggregateAmountOwned"),
    type: text(person, "typeOfReportingPerson"),
  }));
  const item4 = blocks(xml, "item4")[0];
  return {
    form,
    issuerCik: text(xml, "issuerCIK") ?? text(xml, "issuerCik"),
    issuerName: text(xml, "issuerName"),
    eventDate: isoDate(text(xml, "dateOfEvent") ?? text(xml, "eventDateRequiresFilingThisStatement")),
    holders,
    purpose: cleanPurpose(item4 === undefined ? null : text(item4, "transactionPurpose")),
  };
}

const HOLDER_TYPES: Record<string, string> = {
  IN: "Individual",
  IA: "Investment adviser",
  PN: "Partnership",
  CO: "Corporation",
  HC: "Holding company",
  OO: "Entity",
  BD: "Broker-dealer",
  BK: "Bank",
  IC: "Insurer",
  IV: "Investment company",
  EP: "Pension plan",
  FI: "Foreign institution",
};

export function holderType(code: string | null): string | null {
  if (code === null) return null;
  return HOLDER_TYPES[code.trim().toUpperCase()] ?? null;
}

/** Words whose full stop does not end a sentence. */
const ABBREVIATION = /\b(?:Inc|Co|Corp|Ltd|LLC|L\.P|L\.L\.C|No|Nos|Mr|Ms|Mrs|Dr|St|Jr|Sr|U\.S|N\.A|S\.A|plc|Sec|Rule|et al|i\.e|e\.g|vs)\.$/i;

/** Sentences, without breaking at "Inc." or "Mr.". */
export function splitSentences(text: string): string[] {
  const pieces = text.replace(/([.;])\s+(?=["“A-Z])/g, "$1\u0000").split("\u0000");
  const sentences: string[] = [];
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;
    const last = sentences.at(-1);
    if (last !== undefined && ABBREVIATION.test(last)) sentences[sentences.length - 1] = `${last} ${trimmed}`;
    else sentences.push(trimmed);
  }
  return sentences;
}

/**
 * Item 4 as a reader wants it: amendment boilerplate dropped, the first few
 * sentences kept. Null when nothing is left.
 */
export function cleanPurpose(raw: string | null): string | null {
  if (raw === null) return null;
  const sentences = splitSentences(raw.replace(/\s+/g, " "))
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        !/hereby (amended|supplemented|restated)|amended and restated in its entirety|is amended (by|to)|incorporated (herein )?by reference/i.test(sentence),
    );
  if (sentences.length === 0) return null;
  let out = "";
  for (const sentence of sentences) {
    if (out.length > 0 && out.length + sentence.length > 320) break;
    out = out.length === 0 ? sentence : `${out} ${sentence}`;
  }
  return out.length > 360 ? `${out.slice(0, 357)}…` : out;
}

/* ---------------------------------------------------------------------------
   Form 144 — notice of a planned sale
--------------------------------------------------------------------------- */

export interface Form144 {
  issuerCik: string | null;
  issuerName: string | null;
  seller: string | null;
  relationship: string | null;
  units: number | null;
  value: number | null;
  outstanding: number | null;
  saleDate: string | null;
  acquiredHow: string | null;
}

export function parseForm144(xml: string): Form144 | null {
  if (!/144/.test(text(xml, "submissionType") ?? "")) return null;
  const relation = text(xml, "relationshipToIssuer");
  return {
    issuerCik: text(xml, "issuerCik"),
    issuerName: text(xml, "issuerName"),
    seller: text(xml, "nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold"),
    relationship: relation === null ? null : relation.charAt(0) + relation.slice(1).toLowerCase(),
    units: number(xml, "noOfUnitsSold"),
    value: number(xml, "aggregateMarketValue"),
    outstanding: number(xml, "noOfUnitsOutstanding"),
    saleDate: isoDate(text(xml, "approxSaleDate")),
    acquiredHow: text(xml, "natureOfAcquisitionTransaction"),
  };
}

/* ---------------------------------------------------------------------------
   Names as a reader expects them.

   EDGAR records many filers in capitals — "KAMFAR RAMIN", "FRANKLIN STREET
   PROPERTIES CORP. /MA/". Shown as filed they shout beside everything else,
   so an all-capitals name is set in title case, keeping what must stay as
   it is: legal suffixes (LLC, L.P., N.V.), roman numerals, initials, and —
   for companies — short vowel-less acronyms (BHP, NRG). A name already in
   mixed case is the filer's own spelling and is left alone.
--------------------------------------------------------------------------- */

const KEEP: Record<string, string> = {
  LLC: "LLC", "L.L.C.": "L.L.C.", LP: "LP", "L.P.": "L.P.", LLP: "LLP", PLC: "plc", "N.V.": "N.V.", NV: "N.V.",
  "S.A.": "S.A.", SA: "S.A.", AG: "AG", SE: "SE", ETF: "ETF", REIT: "REIT", USA: "USA", "U.S.": "U.S.", US: "US",
  UK: "UK", ADR: "ADR", INC: "Inc", "INC.": "Inc.", CORP: "Corp", "CORP.": "Corp.", CO: "Co", "CO.": "Co.",
  LTD: "Ltd", "LTD.": "Ltd.", JR: "Jr", "JR.": "Jr.", SR: "Sr", "SR.": "Sr.", "&": "&",
};
const ROMAN = /^(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XVIII|XX)$/;

function titleWord(word: string, company: boolean): string {
  if (KEEP[word] !== undefined) return KEEP[word];
  if (ROMAN.test(word) || /\d/.test(word) || /^[A-Z]\.?$/.test(word)) return word;
  if (company && word.length <= 5 && !/[AEIOUY]/.test(word.replace(/[^A-Z]/g, ""))) return word;
  return word
    .toLowerCase()
    .replace(/(^|[-'’(/])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/^Mc([a-z])/, (_, letter: string) => `Mc${letter.toUpperCase()}`);
}

function titleCase(name: string, company: boolean): string {
  const trimmed = name.trim().replace(/\s+\/[A-Z]{2,3}\/?$/, "");
  if (/[a-z]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => titleWord(word, company))
    .join(" ");
}

export function personName(name: string): string {
  return titleCase(name, false);
}

export function companyName(name: string): string {
  return titleCase(name, true);
}

const COMPANY_WORDS = /\b(LLC|L\.?L\.?C|LP|L\.P|INC|CORP|CO|LTD|FUND|TRUST|CAPITAL|PARTNERS|HOLDINGS?|MANAGEMENT|ADVISORS?|GROUP|INVESTMENTS?|VENTURES|BANK|PLC|N\.?V|S\.?A|AG|SE)\b/i;

/** A filer that may be a person or an entity: entities keep their acronyms. */
export function filerName(name: string): string {
  return COMPANY_WORDS.test(name) ? companyName(name) : personName(name);
}
