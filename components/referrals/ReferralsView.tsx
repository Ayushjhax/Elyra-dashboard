"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, Copy, Gift, Link2, Lock, QrCode as QrIcon, RefreshCw, Send, Share2, Users, X } from "lucide-react";
import type { ReferralsResponse } from "@/app/api/referrals/route";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CopyButton, Tip } from "@/components/shell/RouteDrawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OptionMenu } from "@/components/ui/OptionMenu";
import { Popover } from "@/components/ui/Popover";
import { QrCode } from "@/components/ui/QrCode";
import { useCopy, type CopyState } from "@/lib/clipboard";
import { activationRateText, activationStep, plural, poolProgress } from "@/lib/referrals/display";
import type { ReferralListItem, ReferralStats } from "@/lib/referrals/stats";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Referrals — a little better, together.

   One read, `/api/referrals`, carries everything here already worked out on
   the server: points from the ledger, pools from their own table, and the
   programme's rules from lib/referrals/config.ts. The page derives no reward
   of its own — it formats the server's numbers (lib/referrals/display.ts)
   so its promises cannot drift from what is paid.

   Matte forest throughout: solid surfaces, thin borders, no glass. The
   metrics and How it works are deliberately unboxed; only the invite, the
   pool and the list are cards.
--------------------------------------------------------------------------- */

const card = "min-w-0 rounded-sheet border border-border-subtle bg-surface-panel";

const outlined = cn(
  "type-body-sm inline-flex h-11 items-center justify-center gap-2 rounded-control border border-border-strong px-4 font-medium text-text-primary",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:border-accent-quiet hover:bg-surface-hover active:bg-surface-raised",
);

/** "getelyra.xyz/r/CODE" — the scheme dropped for reading; the copy keeps it. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function joined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ---- Statistics ---- */

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-1 @[44rem]:px-8 @[44rem]:first:pl-[76px]">
      <dt className="type-body-sm text-text-secondary">{label}</dt>
      <dd className="type-price font-sans tabular-nums text-text-primary">{value}</dd>
      {sub !== undefined && <dd className="type-body-sm tabular-nums text-text-secondary">{sub}</dd>}
    </div>
  );
}

function Stats({ stats }: { stats: ReferralStats }) {
  return (
    <dl className="grid grid-cols-2 gap-y-6 @[44rem]:grid-cols-4 @[44rem]:divide-x @[44rem]:divide-border-subtle [&>div]:min-h-16">
      <Stat label="Total points" value={stats.totalPoints.toLocaleString("en-US")} />
      <Stat
        label="Referrals"
        value={stats.totalReferrals.toLocaleString("en-US")}
        sub={`${stats.activatedReferrals.toLocaleString("en-US")} activated`}
      />
      <Stat label="Activation rate" value={activationRateText(stats.activationRate)} />
      <Stat label="Bonus earned" value={`${stats.bonusPoints.toLocaleString("en-US")} pts`} />
    </dl>
  );
}

/* ---- Invite ---- */

function ShareControl({ url, onCopy }: { url: string; onCopy: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const message = encodeURIComponent("Join me on Elyra");

  const share = async () => {
    /* The system sheet where there is one — phones, mostly. A dismissed
       sheet is the person's choice, not a failure; it opens the menu. */
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Elyra", text: "Join me on Elyra", url });
        return;
      } catch {
        /* Fall through to the menu. */
      }
    }
    setOpen(true);
  };

  const item =
    "type-body-sm flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary";

  return (
    <Popover
      id={id}
      open={open}
      onOpenChange={setOpen}
      label="Share your invite"
      align="start"
      className="w-56 p-1.5"
      trigger={
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => void share()} className={cn(outlined, "w-full")}>
          <Share2 size={17} strokeWidth={1.5} aria-hidden />
          Share
        </button>
      }
    >
      <a
        href={`https://x.com/intent/tweet?text=${message}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpen(false)}
        className={item}
      >
        <X size={15} strokeWidth={1.5} aria-hidden />
        Share on X
      </a>
      <a
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${message}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpen(false)}
        className={item}
      >
        <Send size={15} strokeWidth={1.5} aria-hidden />
        Share on Telegram
      </a>
      <button
        type="button"
        onClick={() => {
          onCopy();
          setOpen(false);
        }}
        className={item}
      >
        <Link2 size={15} strokeWidth={1.5} aria-hidden />
        Copy link
      </button>
    </Popover>
  );
}

function InviteCard({ stats }: { stats: ReferralStats }) {
  const { state, copy } = useCopy();
  const [qrOpen, setQrOpen] = useState(false);
  const url = stats.referralUrl;
  const code = stats.referralCode;

  return (
    <section aria-labelledby="invite-heading" className={cn(card, "flex flex-col p-6")}>
      <p className="type-eyebrow uppercase text-text-secondary">Your invite</p>
      <h2 id="invite-heading" className="type-h1 mt-2 text-text-primary">
        Share Elyra with a friend
      </h2>
      <p className="type-body mt-1 text-text-secondary">Earn {stats.activationPoints} points when they activate.</p>

      {url === null || code === null ? (
        <p role="alert" className="type-body-sm mt-6 rounded-control border border-border-subtle bg-surface-raised px-4 py-3 text-text-secondary">
          Your referral code couldn&rsquo;t be created just now. Reload the page to try again.
        </p>
      ) : (
        <>
          <div className="mt-5 flex h-[52px] items-center gap-3 rounded-control border border-border-subtle bg-surface-base pl-4 pr-1.5">
            <Link2 size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
            <span className="type-body min-w-0 flex-1 truncate font-mono text-text-primary" title={url}>
              {displayUrl(url)}
              <span className="sr-only"> ({url})</span>
            </span>
            <CopyButton value={url} label="invite link" className="size-10" />
          </div>

          <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-3 @[34rem]:grid-cols-[minmax(0,13rem)_minmax(0,9rem)_auto]">
            <button
              type="button"
              onClick={() => void copy(url)}
              className={cn(
                "type-body-sm inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 font-medium",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                state === "failed" ? "border border-negative/50 text-negative" : "bg-accent text-text-on-accent hover:bg-accent-hover",
              )}
            >
              {state === "copied" ? <Check size={17} strokeWidth={1.75} aria-hidden /> : <Copy size={17} strokeWidth={1.5} aria-hidden />}
              {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy link"}
            </button>
            <ShareControl url={url} onCopy={() => void copy(url)} />
            <Tip label="Show QR code">
              <button type="button" aria-label="Show QR code" onClick={() => setQrOpen(true)} className={cn(outlined, "w-11 px-0")}>
                <QrIcon size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </Tip>
          </div>
          <span aria-live="polite" className="sr-only">
            {state === "copied" ? "Invite link copied" : state === "failed" ? "The invite link could not be copied" : ""}
          </span>

          <p className="type-body-sm mt-5 flex items-center gap-1 text-text-secondary">
            Your referral code:
            <span className="type-mono-addr ml-1 font-medium text-text-primary">{code}</span>
            <CopyButton value={code} label="referral code" className="size-8" />
          </p>

          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="w-[min(360px,calc(100vw-24px))] p-0">
              <DialogHeader className="border-b border-border-subtle px-5 py-4">
                <DialogTitle className="type-h2 text-text-primary">Your invite</DialogTitle>
                <DialogDescription className="type-body-sm text-text-secondary">
                  Scan to open your link on another device.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 p-5">
                <QrCode value={url} label={`QR code for ${displayUrl(url)}`} className="size-52" />
                <p className="type-mono-addr break-all text-center text-text-primary">{displayUrl(url)}</p>
                <CopyButton value={url} label="invite link" text="Copy link" className="w-full" />
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

/* ---- Activation pool ---- */

function PoolCard({ stats }: { stats: ReferralStats }) {
  const pool = stats.pool;
  const { filled, remaining } = poolProgress(pool);
  return (
    <section aria-labelledby="pool-heading" className={cn(card, "flex flex-col p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-eyebrow uppercase text-text-secondary">Activation pool</p>
          <h2 id="pool-heading" className="type-h1 mt-2 text-text-primary">
            Your next milestone
          </h2>
        </div>
        <Gift size={22} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
      </div>

      <p className="mt-4 flex items-baseline gap-2.5 tabular-nums">
        <span className="type-display font-sans text-text-primary">{filled}</span>
        <span className="type-display font-sans text-text-secondary">/ {pool.target}</span>
        <span className="type-body text-text-secondary">activations</span>
      </p>

      {/* Markers on a thin rail; a marker fills only for an activation the
          server has counted into this pool. */}
      <ol
        aria-label={`${filled} of ${pool.target} activations in this pool`}
        className="relative mt-4 flex list-none items-center justify-between"
      >
        <span aria-hidden className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border-strong" />
        <span
          aria-hidden
          className="absolute left-2 top-1/2 h-px -translate-y-1/2 bg-accent-quiet"
          style={{ width: filled <= 1 ? 0 : `calc((100% - 16px) * ${(filled - 1) / (pool.target - 1 || 1)})` }}
        />
        {Array.from({ length: pool.target }, (_, index) => {
          const done = index < filled;
          return (
            <li
              key={index}
              aria-label={`Activation ${index + 1}${done ? ", counted" : ""}`}
              className={cn(
                "relative grid size-4 place-items-center rounded-pill border",
                done ? "border-accent-quiet bg-accent-quiet" : "border-border-strong bg-surface-panel",
              )}
            >
              {done && <Check size={10} strokeWidth={2.5} aria-hidden className="text-surface-base" />}
            </li>
          );
        })}
      </ol>

      <p className="type-body-sm mt-3 text-text-secondary">
        <span className="tabular-nums text-text-primary">{remaining}</span> {remaining === 1 ? "activation" : "activations"} to your next bonus.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border-subtle pt-3">
        <div className="min-w-0">
          <p className="type-body-sm text-text-secondary">Next bonus</p>
          <p className="type-h1 mt-0.5 font-sans tabular-nums text-accent">+{pool.nextBonusPoints.toLocaleString("en-US")} pts</p>
        </div>
        <Tip label={`Unlocks at ${pool.target} activations`}>
          <span tabIndex={0} aria-label={`Locked until ${plural(remaining, "more activation")}`} className="grid size-9 place-items-center rounded-control text-text-secondary">
            <Lock size={20} strokeWidth={1.5} aria-hidden />
          </span>
        </Tip>
      </div>
      <p className="type-label mt-2 text-text-secondary">
        Your pool restarts after each bonus.
        {pool.completedPools > 0 && (
          <span className="text-text-muted">
            {" "}
            {plural(pool.completedPools, "bonus", "bonuses")} earned so far.
          </span>
        )}
      </p>
    </section>
  );
}

/* ---- How it works ---- */

function HowItWorks({ stats }: { stats: ReferralStats }) {
  const steps = [
    { title: "Share your link", body: "Send your invite to a friend." },
    { title: "They join", body: "They create an account through your link." },
    { title: "They activate", body: activationStep(stats.activationRequirement) },
    { title: "You earn", body: `${stats.activationPoints} points per activation, plus pool bonuses.` },
  ];
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-4">
      <h2 id="how-heading" className="type-h1 text-text-primary">
        How it works
      </h2>
      <ol className="mt-4 grid list-none grid-cols-1 gap-y-5 @[40rem]:grid-cols-2 @[64rem]:grid-cols-4 @[64rem]:divide-x @[64rem]:divide-border-subtle">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-5 @[64rem]:px-8 @[64rem]:first:pl-3">
            <span aria-hidden className="type-h2 w-7 shrink-0 font-sans tabular-nums text-text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="type-body block font-medium text-text-primary">{step.title}</span>
              <span className="type-body-sm mt-0.5 block text-text-secondary">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only">
        Each pool of {stats.pool.target} activations adds {stats.pool.nextBonusPoints} bonus points, and the pool repeats.
      </p>
    </section>
  );
}

/* ---- Your referrals ---- */

type Filter = "all" | "pending" | "activated" | "not_eligible";

const STATUS: Record<ReferralListItem["status"], { label: string; className: string }> = {
  activated: { label: "Activated", className: "border-sage/40 bg-positive-bg text-positive" },
  pending: { label: "Pending", className: "border-border-strong text-text-secondary" },
  not_eligible: { label: "Not eligible", className: "border-border-subtle text-text-muted" },
};

function ReferralsList({
  referrals,
  onCopyLink,
  canCopy,
  copyState,
}: {
  referrals: ReferralListItem[];
  onCopyLink: () => void;
  canCopy: boolean;
  copyState: CopyState;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? referrals : referrals.filter((entry) => entry.status === filter);
  const options: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All referrals" },
    { id: "pending", label: "Pending" },
    { id: "activated", label: "Activated" },
    /* Offered only when it exists: most accounts never see one. */
    ...(referrals.some((entry) => entry.status === "not_eligible") ? [{ id: "not_eligible" as const, label: "Not eligible" }] : []),
  ];

  return (
    <section aria-labelledby="list-heading" className={cn(card, "overflow-hidden")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-6 py-4 compact:px-7">
        <div className="min-w-0">
          <h2 id="list-heading" className="type-h2 font-sans text-text-primary">
            Your referrals
          </h2>
          <p className="type-body-sm text-text-secondary">Follow each invite from join to activation.</p>
        </div>
        <OptionMenu
          label="Show"
          options={options}
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          align="end"
          className="h-10 min-w-44 justify-between"
        />
      </header>

      {referrals.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-7 text-center">
          <Users size={26} strokeWidth={1.4} aria-hidden className="text-text-secondary" />
          <p className="type-body mt-2 font-medium text-text-primary">Your first invite starts here</p>
          <p className="type-body-sm text-text-secondary">Share your link. We&rsquo;ll take care of tracking.</p>
          {canCopy && (
            <button
              type="button"
              onClick={onCopyLink}
              className="type-body-sm mt-3 inline-flex items-center gap-1.5 rounded-chip font-medium text-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent-hover"
            >
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy — use the field above" : "Copy invite link"}
              {copyState === "copied" ? (
                <Check size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          )}
          <span aria-live="polite" className="sr-only">
            {copyState === "copied" ? "Invite link copied" : copyState === "failed" ? "The invite link could not be copied" : ""}
          </span>
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-7 text-center">
          <p className="type-body font-medium text-text-primary">No {options.find((option) => option.id === filter)?.label.toLowerCase()} referrals</p>
          <button type="button" onClick={() => setFilter("all")} className="type-body-sm mt-2 rounded-chip text-accent hover:text-accent-hover">
            Show all referrals
          </button>
        </div>
      ) : (
        <ul className="flex list-none flex-col">
          <li aria-hidden className="type-label hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-border-subtle px-7 py-2.5 text-text-muted @[40rem]:grid">
            <span>Referral</span>
            <span>Joined</span>
            <span>Status</span>
            <span className="text-right">Points</span>
          </li>
          {shown.map((entry) => {
            const status = STATUS[entry.status];
            return (
              <li
                key={entry.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border-subtle px-6 py-3.5 transition-colors duration-[var(--dur-fast)] ease-brand last:border-b-0 hover:bg-surface-raised compact:px-7 @[40rem]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="type-label grid size-8 shrink-0 place-items-center rounded-pill border border-border-subtle bg-surface-raised text-text-secondary">
                    {entry.initials}
                  </span>
                  <span className="type-body-sm min-w-0 truncate text-text-primary" title={entry.name}>
                    {entry.name}
                  </span>
                </span>
                <span className="type-body-sm order-3 col-span-2 tabular-nums text-text-secondary @[40rem]:order-none @[40rem]:col-span-1">
                  <span className="@[40rem]:hidden">Joined </span>
                  <time dateTime={entry.joinedAt}>{joined(entry.joinedAt)}</time>
                </span>
                <span className="justify-self-end @[40rem]:justify-self-start">
                  <span className={cn("type-label inline-flex rounded-pill border px-2.5 py-0.5", status.className)}>{status.label}</span>
                </span>
                <span className="type-body-sm order-4 col-span-2 tabular-nums text-text-secondary @[40rem]:order-none @[40rem]:col-span-1 @[40rem]:text-right">
                  {entry.pointsAwarded === null ? (
                    <span className="text-text-muted">
                      <span className="@[40rem]:hidden">No points yet</span>
                      <span className="hidden @[40rem]:inline">—</span>
                    </span>
                  ) : (
                    <span className="text-text-primary">+{entry.pointsAwarded.toLocaleString("en-US")} pts</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---- Page states ---- */

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your referrals" className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-6 @[44rem]:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2 px-1">
            <span className="skeleton h-3.5 w-24" />
            <span className="skeleton h-8 w-16 rounded-control" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 @[60rem]:grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)]">
        <div className={cn(card, "flex h-72 flex-col gap-3 p-7")}>
          <span className="skeleton h-3 w-24" />
          <span className="skeleton h-6 w-64" />
          <span className="skeleton mt-4 h-12 w-full rounded-control" />
        </div>
        <div className={cn(card, "flex h-72 flex-col gap-3 p-7")}>
          <span className="skeleton h-3 w-28" />
          <span className="skeleton h-6 w-48" />
          <span className="skeleton mt-4 h-10 w-32 rounded-control" />
        </div>
      </div>
    </div>
  );
}

/** How often the page re-reads while it is open and visible. */
const REFRESH_MS = 60_000;

export function Referrals() {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const signedIn = auth.ready && auth.authenticated;
  const account = signedIn ? (auth.account?.id ?? "signed-in") : null;
  /* Keyed to the account it was read for, so another account's figures are
     never on screen — not even for the frame before the new read lands. */
  const [state, setState] = useState<{ account: string | null; data: ReferralsResponse | null; refreshError: string | null }>({
    account: null,
    data: null,
    refreshError: null,
  });
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(false);

  const read = useCallback(async (): Promise<ReferralsResponse> => {
    try {
      const response = await authedFetch("/api/referrals", { cache: "no-store" });
      return (await response.json()) as ReferralsResponse;
    } catch (error: unknown) {
      return { stats: null, referrals: [], unconfigured: false, error: error instanceof Error ? error.message : "Your referrals couldn't be loaded." };
    }
  }, [authedFetch]);

  /* Read on open, again whenever the tab comes back, and every minute while
     it is visible — so a referral that activates while the page is open
     appears without a reload. One read at a time; a failed refresh keeps the
     last good figures on screen and says so, rather than blanking them. */
  useEffect(() => {
    if (account === null) return;
    let cancelled = false;
    let timer: number | null = null;
    let lastGood = false;

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") void tick();
        else schedule();
      }, REFRESH_MS);
    };

    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const next = await read();
      inFlight.current = false;
      if (cancelled) return;
      if (next.stats === null && lastGood) {
        setState((current) => ({ ...current, refreshError: next.error ?? "The latest refresh failed." }));
      } else {
        lastGood = next.stats !== null;
        setState({ account, data: next, refreshError: null });
      }
      schedule();
    };

    const onReturn = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [account, read, nonce]);

  const current = state.account === account ? state : null;

  return (
    <ReferralsView
      auth={auth}
      data={current?.data ?? null}
      loading={!auth.ready || (signedIn && current?.data == null)}
      refreshError={current?.refreshError ?? null}
      onRetry={() => setNonce((value) => value + 1)}
    />
  );
}

/** The page with its data passed in, so every state renders from fixtures too. */
export function ReferralsView({
  auth,
  data,
  loading,
  refreshError = null,
  onRetry,
}: {
  auth: Pick<ElyraAuth, "available" | "ready" | "authenticated" | "login">;
  data: ReferralsResponse | null;
  loading: boolean;
  /** A background refresh failed; the figures shown are the last good read. */
  refreshError?: string | null;
  onRetry: () => void;
}) {
  const { state: copyState, copy } = useCopy();
  const stats = data?.stats ?? null;
  const signedIn = auth.ready && auth.authenticated;

  return (
    <div className="min-h-0 overflow-y-auto overflow-x-hidden @container">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-1 pb-6 compact:px-4">
        <header className="flex items-start justify-between gap-4 pt-1">
          <div className="flex min-w-0 items-center gap-4">
            <Gift size={34} strokeWidth={1.4} aria-hidden className="shrink-0 text-accent" />
            <div className="min-w-0">
              <h1 className="type-h1 text-text-primary">Referrals</h1>
              <p className="type-body text-text-secondary">A little better, together.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            }}
            className="type-body-sm mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-chip px-1 py-1 text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent"
          >
            How it works
            <ArrowDown size={15} strokeWidth={1.5} aria-hidden />
          </button>
        </header>

        {loading ? (
          <Skeleton />
        ) : !signedIn ? (
          <section className={cn(card, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
            <Users size={28} strokeWidth={1.4} aria-hidden className="text-text-secondary" />
            <h2 className="type-h1 text-text-primary">Sign in to get your invite</h2>
            <p className="type-body max-w-md text-text-secondary">
              {auth.available
                ? "Your referral link is tied to your Elyra account. Connect to claim yours."
                : "Sign-in isn't configured on this deployment, so there is no referral link to show."}
            </p>
            {auth.available && (
              <button type="button" onClick={auth.login} className="type-body-sm inline-flex h-11 items-center rounded-control bg-accent px-5 font-medium text-text-on-accent hover:bg-accent-hover">
                Connect wallet
              </button>
            )}
          </section>
        ) : stats === null ? (
          <section role="alert" className={cn(card, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
            <h2 className="type-h1 text-text-primary">
              {data?.unconfigured === true ? "Referrals aren't available yet" : "Your referrals couldn't be loaded"}
            </h2>
            <p className="type-body max-w-md text-text-secondary">{data?.error ?? "Something went wrong reading your referrals."}</p>
            {data?.unconfigured !== true && (
              <button type="button" onClick={onRetry} className={outlined}>
                <RefreshCw size={16} strokeWidth={1.5} aria-hidden />
                Try again
              </button>
            )}
          </section>
        ) : (
          <>
            {refreshError !== null && (
              <p role="status" className="type-label -mb-3 text-caution">
                Couldn&rsquo;t refresh just now — showing your last reading. It will try again shortly.
              </p>
            )}
            <Stats stats={stats} />

            <div className="grid grid-cols-1 gap-5 @[60rem]:grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)]">
              <InviteCard stats={stats} />
              <PoolCard stats={stats} />
            </div>

            <HowItWorks stats={stats} />

            <ReferralsList
              referrals={data?.referrals ?? []}
              canCopy={stats.referralUrl !== null}
              copyState={copyState}
              onCopyLink={() => {
                if (stats.referralUrl !== null) void copy(stats.referralUrl);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
