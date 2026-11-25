"use client";

import { useState } from "react";
import { ClipboardPaste, ExternalLink, FileText, Loader2, MessageSquare, PlayCircle, ScanSearch } from "lucide-react";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { GRADE_WHY, GradeBadge, Notice, Segmented, SignedPct, TierBadge } from "@/components/scout/parts";
import { formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { splitLinks } from "@/lib/scout/link";
import type { AssetCheck, ClaimView, ReadsResponse, ReadView, SourceKind } from "@/lib/scout/types";
import { useScoutFeed, useScoutRequest } from "@/lib/scout/useScout";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Read: paste up to three links — a YouTube video, a post on X, an article —
   or a post's text, and see every claim graded by who said it and how, the
   strongest evidence first, with what smart money did in the coins named.
   Several reads sit side by side, each graded on the same scale, so the
   loud one gets no head start.
--------------------------------------------------------------------------- */

const MAX_LINKS = 3;

const KIND_ICON: Record<SourceKind, typeof FileText> = { youtube: PlayCircle, x: MessageSquare, article: FileText, text: ClipboardPaste };

const ORIGIN_NOTE: Record<ReadView["textOrigin"], string> = {
  transcript: msg("Words transcribed by Gemini from the video's first 20 minutes. Names and numbers can be misheard."),
  page: msg("Text read from the page itself."),
  page_copy: msg("The site blocks readers, so Gemini fetched the page through Google and copied its text. It can leave words out."),
  post: msg("Text from X's public embed of the post."),
  pasted: msg("Text you pasted. Scout cannot tell who wrote it, so nothing in it counts as official."),
};

const READ_LABEL = { buying: msg("Buying"), selling: msg("Selling"), quiet: msg("Quiet") } as const;
const VERDICT_LABEL = {
  agrees: msg("Smart money agrees with the source"),
  disagrees: msg("Smart money is doing the opposite"),
  no_read: msg("No clear smart-money move"),
} as const;

function ClaimRow({ claim }: { claim: ClaimView }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <GradeBadge grade={claim.grade} />
        {claim.asset !== null && <span className="type-data-sm rounded-chip border border-border-subtle px-1.5 text-text-primary">{claim.asset}</span>}
        {claim.direction !== "neutral" && (
          <span className={cn("type-label", claim.direction === "bullish" ? "text-positive" : "text-negative")}>
            {claim.direction === "bullish" ? t("Bullish") : t("Bearish")}
          </span>
        )}
      </div>
      <p className="type-body-sm text-text-primary">{claim.statement}</p>
      <blockquote className="type-label border-l-2 border-border-strong pl-2 text-text-muted">“{claim.quote}”</blockquote>
      {claim.confirmedBy !== null ? (
        <p className="type-label text-positive">
          {t("Confirmed by {exchange}'s own listing announcement: ", { exchange: claim.confirmedBy.exchange })}
          <a href={claim.confirmedBy.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            {claim.confirmedBy.title}
          </a>
        </p>
      ) : (
        <p className="type-label text-text-secondary">{t(GRADE_WHY[claim.grade])}</p>
      )}
      {claim.hedged && claim.kind !== "speculation" && claim.kind !== "opinion" && claim.confirmedBy === null && (
        <p className="type-label text-caution">{t("Its own words hedge (“reportedly”, “could”, “sources say”), so it counts as speculation.")}</p>
      )}
      {typeof claim.unreadable === "string" && (
        <p className="type-label text-text-muted">
          {t("Scout cannot check {exchange}'s own listings for free; it reads Bybit, OKX and Upbit. Check {exchange}'s announcements yourself.", { exchange: claim.unreadable })}
        </p>
      )}
      {Array.isArray(claim.notInFeeds) && claim.asset !== null && (
        <p className="type-label text-caution">
          {t("No listing of {asset} in the last 21 days of announcements from {feeds}.", { asset: claim.asset, feeds: claim.notInFeeds.join(", ") })}
        </p>
      )}
    </li>
  );
}

function AssetRow({ asset, hours }: { asset: AssetCheck; hours: number }) {
  const t = useT();
  const flow = asset.flow;
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm font-medium text-text-primary">{asset.coin}</span>
        <span className="flex items-baseline gap-2">
          <span className="type-data-sm tabular-nums text-text-secondary">{asset.price === null ? "—" : formatPriceUsd(asset.price)}</span>
          <SignedPct value={asset.changePct} />
          <span className="type-label text-text-muted">{asset.changeSince === "published" ? t("since it was published") : t("in 24 hours")}</span>
        </span>
      </div>
      <p className="type-label text-text-secondary">
        <span className={cn(asset.read === "buying" ? "text-positive" : asset.read === "selling" ? "text-negative" : "text-text-muted")}>{t(READ_LABEL[asset.read])}</span>
        {" · "}
        {flow === null
          ? t("No smart-money wallet traded it in the last {hours} h.", { hours })
          : t("In the last {hours} h, {long} smart-money wallets opened longs and {short} opened shorts; {closed} closed.", {
              hours,
              long: flow.openedLong,
              short: flow.openedShort,
              closed: flow.closedLong + flow.closedShort,
            })}
      </p>
      {asset.holding !== null && (
        <p className="type-label text-text-secondary">
          {typeof asset.holding.of === "number"
            ? t("Smart money holds it {side}: {wallets} of {total} wallets.", { side: asset.holding.side === "LONG" ? t("long") : t("short"), wallets: asset.holding.wallets, total: asset.holding.of })
            : t("Smart money holds it {side}: {wallets} wallets.", { side: asset.holding.side === "LONG" ? t("long") : t("short"), wallets: asset.holding.wallets })}
        </p>
      )}
      <p className={cn("type-label", asset.verdict === "agrees" ? "text-positive" : asset.verdict === "disagrees" ? "text-caution" : "text-text-muted")}>{t(VERDICT_LABEL[asset.verdict])}</p>
    </li>
  );
}

export function ReadCard({ read, now }: { read: ReadView; now: number | null }) {
  const t = useT();
  const Icon = KIND_ICON[read.kind];
  const who = read.party ?? read.author;
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
          {who !== null && <span className="type-label min-w-0 truncate text-text-primary">{who}</span>}
          <TierBadge tier={read.tier} />
          {read.publishedAt !== null && now !== null && <span className="type-label text-text-muted">{formatRelativeTime(read.publishedAt, now, t.locale)}</span>}
        </div>
        {read.title !== null && <h3 className="type-body-sm font-medium text-text-primary">{read.title}</h3>}
        {read.url !== null && (
          <a href={read.url} target="_blank" rel="noreferrer noopener" className="type-label inline-flex min-w-0 items-center gap-1 text-text-muted hover:text-text-primary pointer-coarse:-my-2 pointer-coarse:py-2">
            <span className="truncate">{read.url.replace(/^https:\/\//, "")}</span>
            <ExternalLink size={11} aria-hidden className="shrink-0" />
          </a>
        )}
      </header>

      {read.attention.length > 0 && (
        <Notice tone="caution">
          {t("Attention words: {words}. Loud words do not make a claim more likely.", { words: read.attention.join(" · ") })}
        </Notice>
      )}

      {read.summary !== null && <p className="type-body-sm text-text-secondary">{read.summary}</p>}

      <section aria-label={t("Claims")} className="flex flex-col gap-2">
        <h4 className="type-eyebrow text-text-muted">{t("Claims, strongest evidence first")}</h4>
        {read.claims.length === 0 ? (
          <p className="type-label text-text-secondary">{t("No claim a trader could check was found in this source.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {read.claims.map((claim, index) => (
              <ClaimRow key={`${read.id}-${index}`} claim={claim} />
            ))}
          </ul>
        )}
      </section>

      {read.assets.length > 0 && (
        <section aria-label={t("Smart-money check")} className="flex flex-col gap-2">
          <h4 className="type-eyebrow text-text-muted">{t("Smart-money check")}</h4>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {read.assets.map((asset) => (
              <AssetRow key={asset.coin} asset={asset} hours={read.flowHours} />
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-col gap-0.5 border-t border-border-subtle pt-2">
        <p className="type-label text-text-muted">{t(ORIGIN_NOTE[read.textOrigin])}</p>
        {read.dropped > 0 && (
          <p className="type-label text-text-muted">
            {read.dropped === 1
              ? t("1 claim the AI offered was dropped: its quote is not in the source.")
              : t("{count} claims the AI offered were dropped: their quotes are not in the source.", { count: read.dropped })}
          </p>
        )}
        <p className="type-label text-text-muted">
          {read.cached ? t("Answered from Scout's shared cache — no AI run used.") : read.model !== null ? t("Read by {model} on Google's free tier.", { model: read.model }) : null}
          {now !== null && ` ${t("Read {when}.", { when: formatRelativeTime(read.readAt, now, t.locale) })}`}
        </p>
      </footer>
    </article>
  );
}

interface Pending {
  id: string;
  label: string;
  error: string | null;
}

export function ReadTab() {
  const t = useT();
  const now = useMinute();
  const history = useScoutFeed<ReadsResponse>("/api/scout/read", { needsAuth: true });
  const request = useScoutRequest();
  const [mode, setMode] = useState<"links" | "text">("links");
  const [links, setLinks] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);

  const busy = pending.some((item) => item.error === null);

  const run = async (bodies: Array<{ label: string; body: { url?: string; text?: string } }>) => {
    const started = bodies.map((entry, index) => ({ id: `${Date.now()}-${index}`, label: entry.label, error: null as string | null }));
    setPending((current) => [...started, ...current.filter((item) => item.error !== null)]);
    await Promise.all(
      bodies.map(async (entry, index) => {
        const result = await request("/api/scout/read", entry.body);
        const id = started[index].id;
        if (result.ok) {
          await history.refresh();
          setPending((current) => current.filter((item) => item.id !== id));
        } else {
          setPending((current) => current.map((item) => (item.id === id ? { ...item, error: String(result.body.error ?? t("Scout could not read that.")) } : item)));
        }
      }),
    );
  };

  const submit = () => {
    if (mode === "links") {
      const list = splitLinks(links, MAX_LINKS);
      if (list.length === 0) return;
      void run(list.map((url) => ({ label: url, body: { url } })));
      setLinks("");
    } else if (text.trim() !== "") {
      void run([{ label: text.trim().slice(0, 80), body: { text } }]);
      setText("");
    }
  };

  const reads = history.data?.reads ?? [];

  return (
    <>
      <DrawerCard icon={ScanSearch} title={t("Read a video, post or article")}>
        <div className="flex flex-col gap-3">
          <p className="type-body-sm text-text-secondary">
            {t("Two posts land at once: one says an exchange has officially announced a listing, the other that people are speculating about one. Attention goes to the louder one first. Scout grades every claim by who said it and how, checks listings against the exchanges' own feeds, and shows what smart money actually did — strongest evidence first, never loudest.")}
          </p>
          <Segmented
            label={t("What to read")}
            value={mode}
            onChange={setMode}
            options={[
              ["links", t("Links")],
              ["text", t("Paste text")],
            ]}
          />
          {mode === "links" ? (
            <label className="flex flex-col gap-1">
              <span className="type-label text-text-muted">{t("Up to three links, one per line: YouTube, X or any article")}</span>
              <textarea
                value={links}
                onChange={(event) => setLinks(event.target.value)}
                rows={3}
                placeholder="https://www.youtube.com/watch?v=…"
                className="type-body-sm min-h-20 w-full resize-y rounded-control border border-border-strong bg-surface-base px-3 py-2 text-text-primary placeholder:text-text-muted"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="type-label text-text-muted">{t("A post's text, when the link cannot be read")}</span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={5}
                maxLength={6000}
                className="type-body-sm min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface-base px-3 py-2 text-text-primary"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="accent" onClick={submit} disabled={!history.signedIn || (mode === "links" ? links.trim() === "" : text.trim() === "")}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScanSearch size={14} aria-hidden />}
              {t("Read")}
            </Button>
            {!history.signedIn && history.ready && <span className="type-label text-text-muted">{t("Sign in to read links.")}</span>}
          </div>
          <p className="type-label text-text-muted">
            {t("Free: Gemini's free tier reads the source; Hyperliquid, Bybit, OKX and Upbit's public data check it. Each new link uses one of your daily AI runs; a link anyone read today uses none. Nothing here places a trade.")}
          </p>
        </div>
      </DrawerCard>

      {pending.map((item) => (
        <div key={item.id} className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
          {item.error === null ? <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden /> : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="type-label truncate text-text-primary">{item.label}</span>
            {item.error === null ? (
              <span className="type-label text-text-muted">{t("Reading, grading the claims and checking smart money… a video takes up to a minute.")}</span>
            ) : (
              <span className="type-label text-negative">{item.error}</span>
            )}
          </div>
          {item.error !== null && (
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setPending((current) => current.filter((entry) => entry.id !== item.id))}>
              {t("Dismiss")}
            </Button>
          )}
        </div>
      ))}

      {history.error !== null && <Notice tone="negative">{history.error}</Notice>}
      {history.data?.error ? (
        <Notice tone="caution">{history.data.error}</Notice>
      ) : (
        reads.length > 0 && (
          <section aria-label={t("Your reads")} className="flex flex-col gap-3">
            <h2 className="type-eyebrow px-1 text-text-muted">{t("Your reads, side by side")}</h2>
            <div className="grid grid-cols-1 gap-3 @[56rem]:grid-cols-2">
              {reads.map((read) => (
                <ReadCard key={read.id} read={read} now={now} />
              ))}
            </div>
          </section>
        )
      )}
    </>
  );
}
