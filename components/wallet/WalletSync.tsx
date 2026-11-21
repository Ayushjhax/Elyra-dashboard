"use client";

import { useId, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { ROW } from "@/components/wallet/WalletActions";
import { formatAge } from "@/lib/format";
import { useSecond } from "@/lib/useClock";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Where the numbers above came from, folded away.

   Everything here is read off the last response, not assumed: the sources are
   the ones the wallet route prices with (Pyth for SOL, Jupiter for SPL
   tokens), the time is when this browser last got a good read, and the slot
   is the ledger's own clock for that read. Nothing claims "just now" that a
   timestamp does not back.
--------------------------------------------------------------------------- */

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="type-label shrink-0 text-text-muted">{label}</dt>
      <dd className="type-label min-w-0 text-right tabular-nums text-text-secondary">{children}</dd>
    </div>
  );
}

export function WalletSync({ wallet }: { wallet: WalletDashboard }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const now = useSecond();
  const id = useId();
  const snapshot = wallet.snapshot;

  const age = wallet.fetchedAt !== null && now !== null ? formatAge(wallet.fetchedAt, now, t.locale) : null;
  const summary =
    snapshot === null
      ? wallet.isLoading
        ? t("Reading the wallet…")
        : t("Not read yet")
      : [
          `${wallet.stale ? t("Last good read") : t("Last read")}${age === null ? "" : ` ${age}`}`,
          t("slot {slot}", { slot: snapshot.slot.toLocaleString("en-US") }),
          "Pyth · Jupiter",
        ].join(" · ");

  return (
    <section aria-label={t("Pricing and sync details")} className="mx-5 border-t border-border-subtle pb-3 pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(ROW, "items-start")}
      >
        <Info size={18} strokeWidth={1.5} aria-hidden className="mt-px shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1">
          {t("Pricing & sync details")}
          <span className={cn("type-label block", wallet.stale ? "text-caution" : "text-text-muted")}>{summary}</span>
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn("mt-0.5 text-text-muted transition-transform duration-[var(--dur-fast)] ease-brand", open && "rotate-90")}
        />
      </button>

      {open && (
        <dl id={id} className="mt-1 pl-8">
          <Detail label={t("SOL price")}>
            {snapshot === null ? "—" : snapshot.solUsd === null ? t("Pyth — unavailable right now") : "Pyth"}
          </Detail>
          <Detail label={t("Token prices and names")}>
            Jupiter
            {snapshot !== null && snapshot.uncounted.unpriced > 0 && t(" — {unpriced} unpriced", { unpriced: snapshot.uncounted.unpriced })}
          </Detail>
          <Detail label={t("Last good read")}>
            {wallet.fetchedAt === null ? "—" : `${new Date(wallet.fetchedAt).toLocaleTimeString("en-GB")}${age === null ? "" : ` · ${age}`}`}
          </Detail>
          {snapshot !== null && <Detail label={t("Read at slot")}>{snapshot.slot.toLocaleString("en-US")}</Detail>}
          <Detail label={t("Network")}>{wallet.cluster === null ? t("Not read yet") : t("{chain}, by genesis hash", { chain: wallet.chain })}</Detail>
          {wallet.latencyMs !== null && <Detail label={t("RPC round trip")}>{t("{latencyMs} ms", { latencyMs: wallet.latencyMs.toLocaleString("en-US") })}</Detail>}
          {wallet.stale && wallet.error !== null && (
            <p className="type-label py-1 text-caution">{t("The latest refresh failed: {error}", { error: wallet.error })}</p>
          )}
          {snapshot !== null && snapshot.uncounted.unverified > 0 && (
            <p className="type-label py-1 text-text-muted">
              {t("{unverified} unverified", { unverified: snapshot.uncounted.unverified })}{" "}{snapshot.uncounted.unverified === 1 ? t("token is") : t("tokens are")}{" "}{t("shown but never valued.")}
            </p>
          )}
        </dl>
      )}
    </section>
  );
}
