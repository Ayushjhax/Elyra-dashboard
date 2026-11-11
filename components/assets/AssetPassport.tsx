"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatRelativeTime, truncateMiddle } from "@/lib/format";
import type { AssetPassport as Passport, PassportFact, PassportResponse, Verification } from "@/lib/passport/types";
import { accountExplorerUrl } from "@/lib/solana/address";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Asset Passport, opened from a token row in Assets → Balances.

   Read-only: nothing here trades, transfers or signs. Every fact shows where
   it came from and how far it is verified, beside the value rather than in a
   footnote, and an unknown is shown as unknown — the passport's job is to
   make the limits of what is known as visible as what is.

   Fetched on open rather than through an account store: a passport describes
   a public token, not the signed-in account, and is only read when asked for.
--------------------------------------------------------------------------- */

const VERIFICATION: Record<Verification, { label: string; className: string }> = {
  "on-chain": { label: "Verified on-chain", className: "border-positive/40 text-positive" },
  "elyra-list": { label: "Elyra's verified list", className: "border-border-strong text-text-primary" },
  jupiter: { label: "Reported by Jupiter", className: "border-border-subtle text-text-secondary" },
  "not-verified": { label: "Not verified", className: "border-caution/50 text-caution" },
  unknown: { label: "Unknown", className: "border-border-subtle text-text-muted" },
};

function Chip({ verification }: { verification: Verification }) {
  const { label, className } = VERIFICATION[verification];
  return <span className={cn("type-label inline-flex h-5 shrink-0 items-center rounded-chip border px-1.5 whitespace-nowrap", className)}>{label}</span>;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="type-label inline-flex items-center gap-1 rounded-chip text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {children}
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="type-eyebrow text-text-muted">{title}</h3>
      <div className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-raised px-3">{children}</div>
    </section>
  );
}

function FactRow({ fact, mono = false }: { fact: PassportFact; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="type-label text-text-secondary">{fact.label}</span>
        <Chip verification={fact.verification} />
      </div>
      {fact.value !== null ? (
        <span className={cn(mono ? "type-mono-addr break-all" : "type-data-sm", "text-text-primary")}>{fact.value}</span>
      ) : (
        <span className="type-data-sm text-text-muted">{fact.verification === "not-verified" ? "Not verified" : "Unknown"}</span>
      )}
      {fact.note !== null && <p className="type-label text-text-muted">{fact.note}</p>}
      {fact.url !== null && (
        <span>
          <SourceLink href={fact.url}>{fact.label === "Mint address" ? "View on explorer" : "Source"}</SourceLink>
        </span>
      )}
    </div>
  );
}

function PassportBody({ passport, now }: { passport: Passport; now: number | null }) {
  const live = passport.controls.filter((control) => control.live);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <CoinMark symbol={passport.symbol ?? "?"} logo={passport.icon} size={28} />
        <div className="flex min-w-0 flex-col">
          <span className="type-h2 truncate text-text-primary">{passport.name ?? "Unnamed token"}</span>
          <span className="type-label text-text-muted">
            {passport.symbol ?? "No symbol"} · Solana mainnet · {truncateMiddle(passport.mint, 4, 4)}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-raised px-3 py-2.5">
        <ShieldAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
        <div className="flex flex-col gap-1.5">
          {passport.context.map((line) => (
            <p key={line} className="type-label text-text-secondary">
              {line}
            </p>
          ))}
        </div>
      </div>

      <Section title="What it is">
        <FactRow fact={passport.represents} />
        <FactRow fact={passport.issuer} />
      </Section>

      <Section title={`On-chain controls · ${live.length} live`}>
        {passport.controls.map((control) => (
          <div key={control.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className={cn("type-data-sm", control.live ? "text-text-primary" : "text-text-secondary")}>{control.title}</span>
              <span className="flex items-center gap-1.5">
                {control.live && <span className="type-label text-caution">Live</span>}
                <Chip verification="on-chain" />
              </span>
            </div>
            <p className="type-label text-text-muted">{control.detail}</p>
            {control.authority !== null && (
              <span className="type-label text-text-muted">
                Held by{" "}
                <SourceLink href={accountExplorerUrl(control.authority)}>
                  <span className="type-mono-addr">{truncateMiddle(control.authority, 4, 4)}</span>
                </SourceLink>
              </span>
            )}
          </div>
        ))}
      </Section>

      <Section title="Terms">
        {passport.terms.map((fact) => (
          <FactRow key={fact.label} fact={fact} />
        ))}
      </Section>

      <Section title="Token">
        {passport.identity.map((fact) => (
          <FactRow key={fact.label} fact={fact} mono={fact.label === "Mint address"} />
        ))}
      </Section>

      <Section title="Sources">
        {passport.sources.map((source) => (
          <div key={source.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="type-data-sm text-text-primary">{source.label}</span>
              <span className="type-label text-text-muted">
                {source.unavailable !== null
                  ? "No data"
                  : source.asOf !== null && now !== null
                    ? `Updated ${formatRelativeTime(source.asOf, now)}`
                    : "Not dated"}
              </span>
            </div>
            {source.unavailable !== null && <p className="type-label text-text-muted">{source.unavailable}</p>}
            {source.url !== null && (
              <span>
                <SourceLink href={source.url}>Open source</SourceLink>
              </span>
            )}
          </div>
        ))}
      </Section>

      <p className="type-label text-text-muted">
        Assembled {now !== null ? formatRelativeTime(passport.readAt, now) : "just now"} from the sources above. Read-only: nothing here trades or moves tokens.
      </p>
    </div>
  );
}

type LoadState = { status: "loading" } | { status: "ready"; passport: Passport } | { status: "error"; message: string };

async function readPassport(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  mint: string,
): Promise<Exclude<LoadState, { status: "loading" }>> {
  try {
    const response = await fetcher(`/api/assets/passport?mint=${encodeURIComponent(mint)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({ passport: null, error: null }))) as PassportResponse;
    if (response.ok && body.passport !== null) return { status: "ready", passport: body.passport };
    return { status: "error", message: body.error ?? "The passport could not be loaded." };
  } catch {
    return { status: "error", message: "The network did not answer." };
  }
}

export function AssetPassportDialog({ mint, symbol, onClose }: { mint: string; symbol: string; onClose: () => void }) {
  const authedFetch = useAuthedFetch();
  const now = useMinute();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void readPassport(authedFetch, mint).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [authedFetch, mint, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  }, []);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="panel" className="flex max-h-[90dvh] flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>Asset passport · {symbol}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            What this token is, who issues it, what its mint allows, and where each fact comes from.
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {state.status === "loading" && (
            <div aria-busy="true" aria-live="polite">
              <p className="type-label mb-2 text-text-muted">Reading the mint and its listing…</p>
              <SkeletonRows rows={6} />
            </div>
          )}
          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-card border border-border-subtle bg-surface-raised px-3 py-3">
              <p className="type-body-sm text-text-primary">No passport for this token right now.</p>
              <p className="type-label text-text-secondary">{state.message}</p>
              <Button size="sm" variant="quiet" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
          {state.status === "ready" && <PassportBody passport={state.passport} now={now} />}
        </div>

        <footer className="flex shrink-0 items-center justify-end border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={onClose}>
            Close
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
