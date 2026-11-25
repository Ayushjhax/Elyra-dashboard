"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RotateCw } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { MarketReport, MarketReportLine } from "@/lib/analysis/reports";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";

/* ---------------------------------------------------------------------------
   The person's saved deep research (lib/analysis/reports.ts), in the agent's
   Research tab: each report the agent wrote, to read again without asking
   again, and a way to ask for a fresh one. Hidden when signed out or when
   there are none — an empty heading is noise.
--------------------------------------------------------------------------- */

const SHOWN = 5;

export function MarketReports({ onAsk }: { onAsk: (prompt: string) => void }) {
  const t = useT();
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const now = useMinute();
  const [reports, setReports] = useState<MarketReportLine[]>([]);
  const [open, setOpen] = useState<MarketReport | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.authenticated) return;
    let cancelled = false;
    void authedFetch("/api/market-reports")
      .then(async (response) => (response.ok ? ((await response.json()) as { reports?: MarketReportLine[] }) : null))
      .then((payload) => {
        if (!cancelled) setReports(payload?.reports ?? []);
      })
      .catch(() => {
        /* The tab still works; only the list is missing. */
      });
    return () => {
      cancelled = true;
    };
  }, [auth.authenticated, authedFetch]);

  const read = useCallback(
    (id: string) => {
      setLoading(id);
      void authedFetch(`/api/market-reports/${id}`)
        .then(async (response) => (response.ok ? ((await response.json()) as { report?: MarketReport }) : null))
        .then((payload) => setOpen(payload?.report ?? null))
        .catch(() => setOpen(null))
        .finally(() => setLoading(null));
    },
    [authedFetch],
  );

  if (!auth.authenticated || reports.length === 0) return null;

  return (
    <section aria-labelledby="market-reports" className="shrink-0 border-b border-border-subtle px-4 py-3">
      <h3 id="market-reports" className="type-eyebrow text-text-muted">
        {t("Your deep research")}
      </h3>
      <ul className="mt-2 flex flex-col">
        {reports.slice(0, SHOWN).map((report) => (
          <li key={report.id}>
            <button
              type="button"
              onClick={() => read(report.id)}
              disabled={loading === report.id}
              className="flex w-full items-center gap-2 rounded-control px-1.5 py-1.5 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
            >
              <FileText size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
              <span className="type-body-sm min-w-0 flex-1 truncate text-text-primary">{report.subject}</span>
              <span className="type-label shrink-0 text-text-muted">{now === null ? "" : formatRelativeTime(report.createdAt, now, t.locale)}</span>
            </button>
          </li>
        ))}
      </ul>

      {open !== null && (
        <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
          <DialogContent side="center" surface="panel" className="flex max-h-[min(860px,92dvh)] w-[min(640px,calc(100vw-24px))] flex-col gap-0 p-0">
            <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle pl-4 pr-11">
              <DialogTitle asChild>
                <Eyebrow>{t("Deep research · {subject}", { subject: open.subject })}</Eyebrow>
              </DialogTitle>
              <DialogDescription className="sr-only">{t("A research report Elyra wrote, saved to read again.")}</DialogDescription>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="type-label text-text-muted">
                {now === null ? null : t("Written {when}, from the figures gathered then.", { when: formatRelativeTime(open.createdAt, now, t.locale) })}
              </p>
              {open.reply === null ? (
                <p className="type-body-sm mt-3 text-text-secondary">{t("The report was not finished when this was saved. Ask for a fresh one.")}</p>
              ) : (
                <p className="type-body-sm mt-3 whitespace-pre-wrap text-text-primary">{open.reply}</p>
              )}
            </div>
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  onAsk(t("Give me deep research on {subject}", { subject: open.subject }));
                  setOpen(null);
                }}
              >
                <RotateCw size={13} aria-hidden />
                {t("Fresh report")}
              </Button>
              <Button size="sm" variant="accent" onClick={() => setOpen(null)}>
                {t("Done")}
              </Button>
            </footer>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
