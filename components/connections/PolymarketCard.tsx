"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight, CircleHelp, Search, TrendingUp, Wallet } from "lucide-react";
import { CopyButton } from "@/components/shell/RouteDrawer";
import {
  CardRule,
  ConnectionCard,
  Disclosure,
  InlineError,
  InlineNote,
  MarkTile,
  StatusBadge,
  fieldInput,
  outlinedAction,
  primaryAction,
  quietAction,
  readJson,
  textAction,
  useAccountFetch,
} from "@/components/connections/primitives";
import { isEvmAddress, type ConnectionStatus } from "@/lib/connections/state";
import { formatUsd, truncateMiddle } from "@/lib/format";
import type { PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Polymarket: positions held in a contract wallet, not the signer.

   Three ways to name the account, and only one of them links on its own:

     Find my account     derives the addresses this wallet's account could
                         live at and checks each. Exactly one holding
                         something is linked; more than one is handed back
                         to choose from. Nothing is ever picked by guessing.
     Use connected wallet checks the session's EVM wallet and SHOWS what is
                         there. Linking it is a second, separate press.
     Manual address      the same check for an address typed in.

   Why it is not simply derived, and why a check precedes every save, is
   written up in app/api/prediction/account/route.ts.
--------------------------------------------------------------------------- */

export interface PredictionState {
  connected: boolean;
  address: string | null;
  verifiedAt: string | null;
  /** The session's EVM wallet, offered as a starting point. */
  suggestion: string | null;
}

interface Found {
  address: string;
  positionCount: number;
  valueUsd: number;
  activityCount: number;
  sample: Array<{ market: string; outcome: string; valueUsd: number | null }>;
}

type Candidate = Found & { kind: string; label: string };

type Search =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "none"; reason: string }
  | { phase: "many"; candidates: Candidate[] }
  | { phase: "failed"; error: string };

type Source = "wallet" | "manual";

type Check =
  | { phase: "idle" }
  | { phase: "checking"; source: Source; address: string }
  | { phase: "found"; source: Source; found: Found }
  | { phase: "failed"; source: Source; error: string };

export function PolymarketCard({
  state,
  onChanged,
  feed,
}: {
  /** Null while the first read is in flight; "failed" when it failed. */
  state: PredictionState | null | "failed";
  /** Re-read the linked state, and the portfolio that reads through it. */
  onChanged: () => Promise<void>;
  feed: PortfolioFeed;
}) {
  const accountFetch = useAccountFetch();
  const [search, setSearch] = useState<Search>({ phase: "idle" });
  const [check, setCheck] = useState<Check>({ phase: "idle" });
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const busy =
    search.phase === "searching" || check.phase === "checking" || linking !== null || unlinking;

  /** One operation at a time, however fast the clicks come. */
  const guarded = async (run: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await run();
    } finally {
      busyRef.current = false;
    }
  };

  const find = () =>
    guarded(async () => {
      setSearch({ phase: "searching" });
      setCheck({ phase: "idle" });
      setError(null);
      try {
        const response = await accountFetch("/api/prediction/account", {
          method: "POST",
          body: JSON.stringify({ detect: true }),
        });
        const body = await readJson<{
          detected: boolean;
          reason: string;
          candidates: Candidate[];
          error: string;
        }>(response);
        if (!response.ok) {
          setSearch({ phase: "failed", error: body.error ?? "Could not search for your account. Try again." });
          return;
        }
        if (body.detected === true) {
          setSearch({ phase: "idle" });
          await onChanged();
          return;
        }
        if (Array.isArray(body.candidates) && body.candidates.length > 1) {
          setSearch({ phase: "many", candidates: body.candidates });
          return;
        }
        setSearch({ phase: "none", reason: body.reason ?? "No Polymarket account was found for your wallet." });
      } catch {
        setSearch({ phase: "failed", error: "Could not reach Elyra to search. Check your connection and try again." });
      }
    });

  const inspect = (address: string, source: Source) =>
    guarded(async () => {
      setCheck({ phase: "checking", source, address });
      setSearch({ phase: "idle" });
      setError(null);
      try {
        const response = await accountFetch("/api/prediction/account", {
          method: "POST",
          body: JSON.stringify({ address, preview: true }),
        });
        const body = await readJson<{ found: Found; error: string }>(response);
        if (!response.ok || body.found === undefined) {
          setCheck({ phase: "failed", source, error: body.error ?? "Could not check that address. Try again." });
          return;
        }
        setCheck({ phase: "found", source, found: body.found });
      } catch {
        setCheck({ phase: "failed", source, error: "Could not reach Elyra to check that address." });
      }
    });

  const link = (address: string) =>
    guarded(async () => {
      setLinking(address);
      setError(null);
      try {
        const response = await accountFetch("/api/prediction/account", {
          method: "POST",
          body: JSON.stringify({ address }),
        });
        const body = await readJson<{ error: string }>(response);
        if (!response.ok) {
          setError(body.error ?? "Could not link that account. Nothing was changed.");
          return;
        }
        setCheck({ phase: "idle" });
        setSearch({ phase: "idle" });
        await onChanged();
      } catch {
        setError("Could not link that account. Nothing was changed.");
      } finally {
        setLinking(null);
      }
    });

  const unlink = () =>
    guarded(async () => {
      setUnlinking(true);
      setError(null);
      try {
        const response = await accountFetch("/api/prediction/account", { method: "DELETE" });
        if (!response.ok) {
          setError("Could not unlink. The account is still linked.");
          return;
        }
        await onChanged();
      } catch {
        setError("Could not unlink. The account is still linked.");
      } finally {
        setUnlinking(false);
      }
    });

  /* --- status ------------------------------------------------------------ */

  const prediction = feed.snapshot?.prediction ?? null;
  const readFailed =
    state !== null && state !== "failed" && state.connected && prediction?.connected === true
      ? prediction.unavailableReason
      : null;

  const [badge, label]: [ConnectionStatus, string] =
    state === null
      ? ["checking", "Checking"]
      : state === "failed"
        ? ["attention", "Couldn't check"]
        : state.connected
          ? state.verifiedAt === null
            ? ["attention", "Unverified"]
            : readFailed !== null
              ? ["attention", "Needs attention"]
              : ["connected", "Connected"]
          : busy
            ? ["connecting", search.phase === "searching" ? "Searching" : "Checking"]
            : ["not-connected", "Not connected"];

  return (
    <ConnectionCard
      mark={<MarkTile icon={TrendingUp} />}
      title="Polymarket"
      subtitle="See your positions alongside the rest of your capital."
      status={<StatusBadge name="Polymarket" status={badge} label={label} />}
    >
      {state === null ? (
        <p className="type-body-sm text-text-muted">Checking for a linked account…</p>
      ) : state === "failed" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <InlineError className="min-w-0 flex-1">Could not check whether an account is linked.</InlineError>
          <button type="button" onClick={() => void onChanged()} className={textAction}>
            Try again
          </button>
        </div>
      ) : state.connected && state.address !== null ? (
        <LinkedAccount
          address={state.address}
          verified={state.verifiedAt !== null}
          readFailed={readFailed}
          summary={
            prediction?.connected === true && prediction.unavailableReason === null ? prediction : null
          }
          unlinking={unlinking}
          onUnlink={() => void unlink()}
        />
      ) : (
        <>
          <button type="button" onClick={() => void find()} disabled={busy} className={cn(outlinedAction, "w-full")}>
            <Search size={15} strokeWidth={1.5} aria-hidden />
            {search.phase === "searching" ? "Searching your wallet…" : "Find my account"}
          </button>

          <SearchOutcome search={search} busy={busy} linking={linking} onLink={(address) => void link(address)} />

          {state.suggestion !== null && isEvmAddress(state.suggestion) ? (
            <>
              <WalletRow
                address={state.suggestion}
                checking={check.phase === "checking" && check.source === "wallet"}
                disabled={busy}
                onCheck={() => void inspect(state.suggestion ?? "", "wallet")}
              />
              {check.phase !== "idle" && check.source === "wallet" && (
                <CheckOutcome check={check} busy={busy} linking={linking} onLink={(address) => void link(address)} />
              )}
            </>
          ) : (
            <InlineNote>This account has no EVM wallet, so enter the address that holds your positions.</InlineNote>
          )}

          <ManualAddress
            busy={busy}
            check={check}
            linking={linking}
            onCheck={(address) => void inspect(address, "manual")}
            onLink={(address) => void link(address)}
          />
        </>
      )}

      {error !== null && <InlineError>{error}</InlineError>}
    </ConnectionCard>
  );
}

/* --- Linked -------------------------------------------------------------- */

function LinkedAccount({
  address,
  verified,
  readFailed,
  summary,
  unlinking,
  onUnlink,
}: {
  address: string;
  verified: boolean;
  readFailed: string | null;
  summary: { valueUsd: number | null; activeMarkets: number | null } | null;
  unlinking: boolean;
  onUnlink: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-base py-1 pl-3 pr-1">
        <span className="type-mono-addr min-w-0 flex-1 truncate text-text-primary" title={address}>
          <span aria-hidden>{truncateMiddle(address, 6, 4)}</span>
          <span className="sr-only">{address}</span>
        </span>
        <CopyButton value={address} label="Polymarket address" />
      </div>

      {summary !== null && summary.activeMarkets !== null && (
        <p className="type-body-sm text-text-secondary">
          {summary.activeMarkets === 0
            ? "No open positions right now."
            : `${summary.activeMarkets} open market${summary.activeMarkets === 1 ? "" : "s"}`}
          {summary.valueUsd !== null && summary.activeMarkets > 0 && (
            <>
              {" · "}
              <span className="tabular-nums text-text-primary">{formatUsd(summary.valueUsd)}</span>
            </>
          )}
        </p>
      )}

      {!verified && (
        /* Saved, but nothing was found there when it was linked. Said out
           loud, because the likeliest explanation is a typo and the second
           likeliest is a brand-new account — and only the person can tell. */
        <InlineNote tone="caution">
          Nothing was found at this address when it was linked. That is normal for a new account; if you expected
          positions, check the address.
        </InlineNote>
      )}
      {readFailed !== null && <InlineNote tone="caution">Positions could not be read: {readFailed}</InlineNote>}

      <div className="flex justify-end">
        <button type="button" onClick={onUnlink} disabled={unlinking} className={cn(quietAction, "h-9 px-3")}>
          {unlinking ? "Unlinking…" : "Unlink"}
        </button>
      </div>
    </>
  );
}

/* --- Finding ------------------------------------------------------------- */

function SearchOutcome({
  search,
  busy,
  linking,
  onLink,
}: {
  search: Search;
  busy: boolean;
  linking: string | null;
  onLink: (address: string) => void;
}) {
  if (search.phase === "none") return <InlineNote>{search.reason}</InlineNote>;
  if (search.phase === "failed") return <InlineError>{search.error}</InlineError>;
  if (search.phase !== "many") return null;

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Accounts found for your wallet">
      <p className="type-body-sm text-text-secondary">
        {search.candidates.length} accounts hold positions for your wallet. Choose yours — nothing is linked until you
        do.
      </p>
      {search.candidates.map((candidate) => (
        <div key={candidate.address} className="rounded-card border border-border-subtle bg-surface-base p-3">
          <FoundSummary found={candidate} detail={candidate.label} />
          <button
            type="button"
            onClick={() => onLink(candidate.address)}
            disabled={busy}
            className={cn(quietAction, "mt-3 h-9 w-full")}
          >
            {linking === candidate.address ? "Linking…" : "Link this account"}
          </button>
        </div>
      ))}
    </div>
  );
}

/** The session wallet, as one row: press it to see what is there. */
function WalletRow({
  address,
  checking,
  disabled,
  onCheck,
}: {
  address: string;
  checking: boolean;
  disabled: boolean;
  onCheck: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={disabled}
      aria-label={`Check your connected wallet, ${address}, for Polymarket positions`}
      className={cn(
        "group flex min-h-12 w-full items-center gap-3 rounded-card border border-border-subtle bg-surface-base px-3 py-2 text-left",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        "hover:border-accent-quiet hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      <Wallet size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body-sm font-medium text-text-primary">
          {checking ? "Checking your wallet…" : "Use connected wallet"}
        </span>
        <span className="type-mono-addr truncate text-text-muted">{truncateMiddle(address, 6, 4)}</span>
      </span>
      <ArrowRight
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className="shrink-0 text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand group-hover:text-text-primary"
      />
    </button>
  );
}

/* --- Checking ------------------------------------------------------------ */

function FoundSummary({ found, detail }: { found: Found; detail?: string }) {
  const empty = found.positionCount === 0;
  return (
    <div className="flex flex-col gap-1">
      <p className="type-mono-addr truncate text-text-secondary" title={found.address}>
        {truncateMiddle(found.address, 6, 4)}
      </p>
      {detail !== undefined && <p className="type-label text-text-muted">{detail}</p>}
      <p className="type-body-sm text-text-primary">
        {empty ? (
          found.activityCount > 0 ? (
            "No open positions, but recent activity"
          ) : (
            "No positions or activity at this address"
          )
        ) : (
          <>
            {found.positionCount} position{found.positionCount === 1 ? "" : "s"} worth{" "}
            <span className="tabular-nums">{formatUsd(found.valueUsd)}</span>
          </>
        )}
      </p>
      {found.sample.length > 0 && (
        <ul className="flex list-none flex-col gap-0.5">
          {found.sample.map((row) => (
            <li key={`${row.market}:${row.outcome}`} className="type-label truncate text-text-muted">
              {row.market} · {row.outcome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What a check found, and the separate press that links it.
 *
 * Three outcomes kept apart: positions found (link it), nothing found (a new
 * account, or the wrong address — the person decides), and a failed read
 * (nothing is known, so nothing is offered).
 */
function CheckOutcome({
  check,
  busy,
  linking,
  onLink,
}: {
  check: Check;
  busy: boolean;
  linking: string | null;
  onLink: (address: string) => void;
}) {
  if (check.phase === "checking") {
    return (
      <p role="status" className="type-body-sm text-text-muted">
        Checking {truncateMiddle(check.address, 6, 4)}…
      </p>
    );
  }
  if (check.phase === "failed") return <InlineError>{check.error}</InlineError>;
  if (check.phase !== "found") return null;

  const { found } = check;
  const empty = found.positionCount === 0 && found.activityCount === 0;

  return (
    <div role="status" className="rounded-card border border-border-subtle bg-surface-base p-3">
      <FoundSummary found={found} />
      {empty && (
        <p className="type-label mt-2 text-text-muted">
          Link it anyway if the account is new. Otherwise, check the address.
        </p>
      )}
      <button
        type="button"
        onClick={() => onLink(found.address)}
        disabled={busy}
        className={cn(empty ? quietAction : primaryAction, "mt-3 h-9 w-full")}
      >
        {linking === found.address ? "Linking…" : empty ? "Link anyway" : "This is mine — link it"}
      </button>
    </div>
  );
}

function ManualAddress({
  busy,
  check,
  linking,
  onCheck,
  onLink,
}: {
  busy: boolean;
  check: Check;
  linking: string | null;
  onCheck: (address: string) => void;
  onLink: (address: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const helpId = useId();

  const value = draft.trim();
  const valid = isEvmAddress(value);
  /* Said once the person has finished typing, not on the first keystroke. */
  const invalid = value.length > 0 && !valid && (touched || value.length >= 42);

  return (
    <>
      <CardRule />
      <Disclosure open={open} onOpenChange={setOpen} label="Enter an address manually">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !busy) onCheck(value.toLowerCase());
          }}
        >
          <label htmlFor={inputId} className="type-label text-text-secondary">
            Position-holding address
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="0x…"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${errorId} ${hintId}` : hintId}
              className={cn(fieldInput, "type-mono-addr flex-1")}
            />
            <button type="submit" disabled={!valid || busy} className={cn(quietAction, "shrink-0 px-4")}>
              {check.phase === "checking" && check.source === "manual" ? "Checking…" : "Check"}
            </button>
          </div>
          {invalid && (
            <p id={errorId} className="type-label text-negative">
              An address starts 0x and is 42 characters long.
            </p>
          )}
          <p id={hintId} className="type-label text-text-muted">
            Use the address that holds your Polymarket positions.{" "}
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              onClick={() => setHelpOpen(!helpOpen)}
              className={cn(textAction, "align-baseline text-text-secondary")}
            >
              <CircleHelp size={12} strokeWidth={1.5} aria-hidden />
              Where do I find it?
            </button>
          </p>
          <div
            id={helpId}
            hidden={!helpOpen}
            className="type-body-sm rounded-card border border-border-subtle bg-surface-base p-3 text-text-secondary"
          >
            On polymarket.com, open your profile and copy the address shown under your name. Polymarket holds positions
            in a wallet it creates for you, so this is usually not the wallet you sign in with.
          </div>
        </form>

        {check.phase !== "idle" && check.source === "manual" && (
          <div className="mt-2">
            <CheckOutcome check={check} busy={busy} linking={linking} onLink={onLink} />
          </div>
        )}
      </Disclosure>
    </>
  );
}
