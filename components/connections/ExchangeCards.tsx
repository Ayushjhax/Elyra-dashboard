"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, ExternalLink, Eye, EyeOff, Info, KeyRound, Lock } from "lucide-react";
import { CopyButton } from "@/components/shell/RouteDrawer";
import {
  CardRule,
  ConfirmAction,
  ConnectionCard,
  Disclosure,
  InlineError,
  InlineNote,
  MarkTile,
  StatusBadge,
  fieldInput,
  primaryAction,
  quietAction,
  readJson,
  textAction,
  useAccountFetch,
} from "@/components/connections/primitives";
import { CoinMark } from "@/components/ui/CoinMark";
import { isBinanceCredential, isEvmAddress, venueRead, type ConnectionStatus } from "@/lib/connections/state";
import { formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon, useTickerLogos } from "@/lib/market/tickerLogos";
import type { PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Exchanges: where Elyra reads venue accounts from.

   Neither card decides on its own that a venue is working. "Synced" means
   the venue answered in the latest shared portfolio reading (`usePortfolio`,
   which every surface already polls); a stored key or an available wallet
   is not, by itself, a read that worked.
--------------------------------------------------------------------------- */

interface StoredConnection {
  exchange: string;
  label: string | null;
  keyLastFour: string | null;
  walletAddress: string | null;
  connectedAt: string;
}

export interface ExchangeState {
  connections: StoredConnection[];
  /** The session's EVM wallet — already a readable Hyperliquid account. */
  sessionWallet: string | null;
  /** Saved connections could not be read; the session wallet still works. */
  unavailable?: string;
}

type Read = ExchangeState | null | "failed";

function statusOf(feed: PortfolioFeed, venue: string): { badge: ConnectionStatus; label: string; reason: string | null } {
  const read = venueRead(feed, venue);
  if (read.status === "synced") return { badge: "connected", label: "Synced", reason: null };
  if (read.status === "checking") return { badge: "checking", label: "Checking", reason: null };
  return { badge: "attention", label: "Needs attention", reason: read.reason };
}

/**
 * Whether the shared reading predates a change made here — a key replaced,
 * an address saved. Until one taken after it lands, the card says Checking
 * rather than vouching for the old key or address with the new one shown.
 */
function useReadingAfterChange(feed: PortfolioFeed): [waiting: boolean, markChanged: () => void] {
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const markChanged = useCallback(() => setChangedAt(Date.now()), []);
  return [changedAt !== null && (feed.fetchedAt ?? 0) < changedAt, markChanged];
}

const CHECKING = { badge: "checking" as const, label: "Checking", reason: null };

/** A failed venue read, with the way to ask again. */
function ReadFailure({ reason, feed }: { reason: string; feed: PortfolioFeed }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <InlineNote tone="caution" className="min-w-0 flex-1">
        Could not read the account: {reason}
      </InlineNote>
      <button type="button" onClick={feed.refetch} disabled={feed.refreshing} className={textAction}>
        {feed.refreshing ? "Reading…" : "Try again"}
      </button>
    </div>
  );
}

/* --- Hyperliquid ------------------------------------------------------------ */

/**
 * Hyperliquid is read from an address, with no key. The session's EVM wallet
 * by default; a saved address instead when the person names one — read and
 * shown to them first, and only stored once they say it is theirs.
 */
export function HyperliquidCard({
  state,
  feed,
  onChanged,
}: {
  state: Read;
  feed: PortfolioFeed;
  /** Re-read the stored connections and the portfolio that reads through them. */
  onChanged: () => Promise<void>;
}) {
  const accountFetch = useAccountFetch();
  const [manualOpen, setManualOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, markChanged] = useReadingAfterChange(feed);

  const ready = state === null || state === "failed" ? null : state;
  const stored = ready?.connections.find((entry) => entry.exchange === "hyperliquid")?.walletAddress ?? null;
  const session = ready?.sessionWallet ?? null;
  const address = stored ?? session;
  /* Saved connections unreadable: the session wallet still works, but a
     saved address can be neither shown nor written. */
  const canSave = ready !== null && ready.unavailable === undefined;

  const removeStored = async () => {
    setRemoving(true);
    setError(null);
    try {
      const response = await accountFetch("/api/exchanges?exchange=hyperliquid", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not remove the saved address. It is still the one being read.");
        return;
      }
      markChanged();
      await onChanged();
    } catch {
      setError("Could not remove the saved address. It is still the one being read.");
    } finally {
      setRemoving(false);
    }
  };

  const saved = async () => {
    markChanged();
    await onChanged();
  };

  const read = address === null ? null : waiting ? CHECKING : statusOf(feed, "hyperliquid");
  const [badge, label]: [ConnectionStatus, string] =
    state === null
      ? ["checking", "Checking"]
      : state === "failed" && address === null
        ? ["attention", "Couldn't check"]
        : read === null
          ? ["not-connected", "Not connected"]
          : [read.badge, read.label];

  return (
    <ConnectionCard
      as="h3"
      mark={
        <MarkTile>
          <CoinMark symbol="HYPE" logo={hyperliquidIcon("HYPE")} size={22} className="border-0 bg-transparent" />
        </MarkTile>
      }
      title="Hyperliquid"
      subtitle="Wallet access · No API key needed"
      status={<StatusBadge name="Hyperliquid" status={badge} label={label} />}
    >
      {state === null ? (
        <p className="type-body-sm text-text-muted">Checking for a wallet…</p>
      ) : (
        <>
          {address !== null ? (
            <>
              <div className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-base py-1 pl-3 pr-1">
                <span className="type-label shrink-0 text-text-muted">
                  {stored === null ? "Session wallet" : "Saved address"}
                </span>
                <span className="type-mono-addr min-w-0 flex-1 truncate text-right text-text-primary" title={address}>
                  <span aria-hidden>{truncateMiddle(address, 6, 4)}</span>
                  <span className="sr-only">{address}</span>
                </span>
                <CopyButton value={address} label="Hyperliquid address" />
              </div>
              {read?.reason !== null && read?.reason !== undefined && <ReadFailure reason={read.reason} feed={feed} />}
            </>
          ) : state === "failed" ? (
            <InlineError>Could not check which address Hyperliquid is read from.</InlineError>
          ) : (
            <InlineNote>
              This account has no EVM wallet to read Hyperliquid from. Enter the address that holds your Hyperliquid
              account instead.
            </InlineNote>
          )}

          {stored !== null ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void removeStored()}
                disabled={removing}
                className={cn(quietAction, "h-9 px-3")}
              >
                {removing ? "Removing…" : session === null ? "Remove saved address" : "Use session wallet instead"}
              </button>
            </div>
          ) : canSave && address === null ? (
            <HyperliquidAddressForm onSaved={saved} />
          ) : canSave ? (
            <>
              <CardRule />
              <Disclosure open={manualOpen} onOpenChange={setManualOpen} label="Read a different address">
                <HyperliquidAddressForm onSaved={saved} />
              </Disclosure>
            </>
          ) : null}

          {error !== null && <InlineError>{error}</InlineError>}
        </>
      )}
    </ConnectionCard>
  );
}

interface HyperliquidFound {
  address: string;
  accountValueUsd: number;
  positionCount: number;
  spotBalanceCount: number;
}

type HyperliquidCheck =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "found"; found: HyperliquidFound }
  | { phase: "failed"; error: string };

/**
 * Names a Hyperliquid address by hand. A check reads it and stores nothing;
 * saving is a second press, made after the person has seen what is there.
 */
function HyperliquidAddressForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const accountFetch = useAccountFetch();
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<HyperliquidCheck>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  const value = draft.trim();
  const valid = isEvmAddress(value);
  const invalid = value.length > 0 && !valid && (touched || value.length >= 42);
  const busy = check.phase === "checking" || saving;

  const inspect = async () => {
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    setCheck({ phase: "checking" });
    setSaveError(null);
    try {
      const response = await accountFetch("/api/exchanges", {
        method: "POST",
        body: JSON.stringify({ exchange: "hyperliquid", walletAddress: value.toLowerCase(), preview: true }),
      });
      const body = await readJson<{ found: HyperliquidFound; error: string }>(response);
      setCheck(
        response.ok && body.found !== undefined
          ? { phase: "found", found: body.found }
          : { phase: "failed", error: body.error ?? "Could not read that address. Try again." },
      );
    } catch {
      setCheck({ phase: "failed", error: "Could not reach Elyra to read that address." });
    } finally {
      inFlight.current = false;
    }
  };

  const save = async (address: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await accountFetch("/api/exchanges", {
        method: "POST",
        body: JSON.stringify({ exchange: "hyperliquid", walletAddress: address }),
      });
      if (!response.ok) {
        const body = await readJson<{ error: string }>(response);
        setSaveError(body.error ?? "Could not save that address. Nothing was changed.");
        return;
      }
      await onSaved();
    } catch {
      setSaveError("Could not save that address. Nothing was changed.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void inspect();
        }}
      >
        <label htmlFor={inputId} className="type-label text-text-secondary">
          Hyperliquid address
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (check.phase !== "idle") setCheck({ phase: "idle" });
            }}
            onBlur={() => setTouched(true)}
            placeholder="0x…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${errorId} ${hintId}` : hintId}
            className={cn(fieldInput, "type-mono-addr flex-1")}
          />
          <button type="submit" disabled={!valid || busy} className={cn(quietAction, "shrink-0 px-4")}>
            {check.phase === "checking" ? "Checking…" : "Check"}
          </button>
        </div>
        {invalid && (
          <p id={errorId} className="type-label text-negative">
            An address starts 0x and is 42 characters long.
          </p>
        )}
        <p id={hintId} className="type-label text-text-muted">
          The address you trade from on Hyperliquid. It is read, never traded from.
        </p>
      </form>

      {check.phase === "failed" && <InlineError>{check.error}</InlineError>}
      {check.phase === "found" && (
        <HyperliquidFoundCard found={check.found} saving={saving} onSave={() => void save(check.found.address)} />
      )}
      {saveError !== null && <InlineError>{saveError}</InlineError>}
    </div>
  );
}

/** What a check found, kept apart from a failed read: an empty account is not an error. */
function HyperliquidFoundCard({
  found,
  saving,
  onSave,
}: {
  found: HyperliquidFound;
  saving: boolean;
  onSave: () => void;
}) {
  const empty = found.accountValueUsd === 0 && found.positionCount === 0 && found.spotBalanceCount === 0;
  return (
    <div role="status" className="rounded-card border border-border-subtle bg-surface-base p-3">
      <p className="type-mono-addr truncate text-text-secondary" title={found.address}>
        {truncateMiddle(found.address, 6, 4)}
      </p>
      {empty ? (
        <p className="type-body-sm mt-1 text-text-primary">Nothing held at this address</p>
      ) : (
        <p className="type-body-sm mt-1 text-text-primary">
          Account value <span className="tabular-nums">{formatUsd(found.accountValueUsd)}</span> ·{" "}
          {found.positionCount} open position{found.positionCount === 1 ? "" : "s"}
          {found.spotBalanceCount > 0 &&
            ` · ${found.spotBalanceCount} spot balance${found.spotBalanceCount === 1 ? "" : "s"}`}
        </p>
      )}
      {empty && (
        <p className="type-label mt-1 text-text-muted">Use it anyway if the account is new. Otherwise, check the address.</p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn(empty ? quietAction : primaryAction, "mt-3 h-9 w-full")}
      >
        {saving ? "Saving…" : empty ? "Use it anyway" : "This is mine — use it"}
      </button>
    </div>
  );
}

/* --- Binance ---------------------------------------------------------------- */

const BNB = ["BNB"] as const;

export function BinanceCard({
  state,
  feed,
  onChanged,
}: {
  state: Read;
  feed: PortfolioFeed;
  /** Re-read the stored connections and the portfolio that reads through them. */
  onChanged: () => Promise<void>;
}) {
  const accountFetch = useAccountFetch();
  const logos = useTickerLogos(BNB);
  const now = useMinute();

  const [replacing, setReplacing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Only what the POST said about the key just stored. Not persisted — the
     next visit reads the venue's state from the portfolio instead. */
  const [justConnected, setJustConnected] = useState<{ ipRestricted: boolean } | null>(null);
  const inFlight = useRef(false);
  const [waiting, markChanged] = useReadingAfterChange(feed);

  const row =
    state === null || state === "failed" ? null : (state.connections.find((entry) => entry.exchange === "binance") ?? null);
  const savedUnknown = state === "failed" || (state !== null && state.unavailable !== undefined);

  const connect = async (apiKey: string, apiSecret: string): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await accountFetch("/api/exchanges", {
        method: "POST",
        body: JSON.stringify({ exchange: "binance", apiKey, apiSecret }),
      });
      const body = await readJson<{ error: string; ipRestricted: boolean }>(response);
      if (!response.ok) {
        setError(body.error ?? "Could not connect Binance. Nothing was saved.");
        return false;
      }
      setReplacing(false);
      setJustConnected({ ipRestricted: body.ipRestricted === true });
      markChanged();
      await onChanged();
      return true;
    } catch {
      setError("Could not reach Elyra to connect Binance. Nothing was saved.");
      return false;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDisconnecting(true);
    setError(null);
    try {
      const response = await accountFetch("/api/exchanges?exchange=binance", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not disconnect Binance. The key is still stored.");
        return;
      }
      setJustConnected(null);
      await onChanged();
    } catch {
      setError("Could not disconnect Binance. The key is still stored.");
    } finally {
      inFlight.current = false;
      setDisconnecting(false);
    }
  };

  const read = row === null ? null : waiting ? CHECKING : statusOf(feed, "binance");
  const [badge, label]: [ConnectionStatus, string] =
    state === null
      ? ["checking", "Checking"]
      : submitting
        ? ["connecting", "Connecting"]
        : read !== null
          ? [read.badge, read.label]
          : savedUnknown
            ? ["attention", "Couldn't check"]
            : ["not-connected", "Not connected"];

  return (
    <ConnectionCard
      as="h3"
      mark={
        <MarkTile>
          <CoinMark symbol="BNB" {...logos("BNB")} size={22} className="border-0 bg-transparent" />
        </MarkTile>
      }
      title="Binance"
      subtitle="Read your positions and equity."
      status={<StatusBadge name="Binance" status={badge} label={label} />}
    >
      {state === null ? (
        <p className="type-body-sm text-text-muted">Checking for a stored key…</p>
      ) : savedUnknown && row === null ? (
        <InlineError>
          {state !== "failed" && state.unavailable !== undefined
            ? state.unavailable
            : "Could not check whether a Binance key is stored."}
        </InlineError>
      ) : row !== null && !replacing ? (
        <>
          <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-base px-3 py-2.5">
            <KeyRound size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
            <div className="min-w-0 flex-1">
              <p className="type-body-sm text-text-primary">
                {row.keyLastFour === null ? "API key stored" : `Key ending ${row.keyLastFour}`}
              </p>
              {now !== null && (
                <p className="type-label text-text-muted">Connected {formatRelativeTime(row.connectedAt, now)}</p>
              )}
            </div>
          </div>

          {read?.reason !== null && read?.reason !== undefined && <ReadFailure reason={read.reason} feed={feed} />}
          {justConnected !== null && !justConnected.ipRestricted && (
            <InlineNote tone="caution" icon={Info}>
              This key has no IP allowlist. Adding one in Binance limits where the key can be used from.
            </InlineNote>
          )}

          <ConfirmAction
            trigger="Disconnect"
            question="Remove the stored key?"
            confirm="Disconnect"
            pendingLabel="Removing…"
            pending={disconnecting}
            onConfirm={() => void disconnect()}
            beside={
              <button
                type="button"
                onClick={() => {
                  setReplacing(true);
                  setJustConnected(null);
                }}
                className={cn(quietAction, "h-9 px-3")}
              >
                Replace key
              </button>
            }
          />
        </>
      ) : (
        <BinanceForm
          focusOnOpen={replacing}
          submitting={submitting}
          onSubmit={connect}
          onCancel={replacing ? () => setReplacing(false) : undefined}
        />
      )}

      {error !== null && <InlineError>{error}</InlineError>}
    </ConnectionCard>
  );
}

/**
 * The key form. The pair lives in this component's state and nowhere else —
 * not the store, not storage, not a URL — and is cleared once Binance has
 * accepted it. It is sent once, in a POST body, and never comes back.
 */
function BinanceForm({
  focusOnOpen,
  submitting,
  onSubmit,
  onCancel,
}: {
  /** Opened by "Replace key": the button that opened it is gone, so focus starts here. */
  focusOnOpen: boolean;
  submitting: boolean;
  onSubmit: (apiKey: string, apiSecret: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [touched, setTouched] = useState({ key: false, secret: false });
  const [guideOpen, setGuideOpen] = useState(false);
  const keyId = useId();
  const secretId = useId();
  const keyErrorId = useId();
  const secretErrorId = useId();
  const noteId = useId();
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnOpen) keyRef.current?.focus();
  }, [focusOnOpen]);

  const key = apiKey.trim();
  const secret = apiSecret.trim();
  const keyValid = isBinanceCredential(key);
  const secretValid = isBinanceCredential(secret);
  const keyInvalid = key.length > 0 && !keyValid && touched.key;
  const secretInvalid = secret.length > 0 && !secretValid && touched.secret;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!keyValid || !secretValid || submitting) return;
        void onSubmit(key, secret).then((ok) => {
          if (!ok) return;
          setApiKey("");
          setApiSecret("");
          setShowSecret(false);
        });
      }}
    >
      <p className="type-label flex items-center gap-2 rounded-control border border-border-subtle bg-surface-base px-3 py-2 text-text-secondary">
        <Info size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
        Read-only API access required
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={keyId} className="type-label text-text-secondary">
          API key
        </label>
        <div className="relative">
          <KeyRound
            size={15}
            strokeWidth={1.5}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={keyRef}
            id={keyId}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, key: true }))}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste your API key"
            aria-invalid={keyInvalid}
            aria-describedby={keyInvalid ? `${keyErrorId} ${noteId}` : noteId}
            className={cn(fieldInput, "type-mono-addr pl-9")}
          />
        </div>
        {keyInvalid && (
          <p id={keyErrorId} className="type-label text-negative">
            Paste the whole key — letters and numbers only, no spaces.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={secretId} className="type-label text-text-secondary">
          API secret
        </label>
        <div className="relative">
          <Lock
            size={15}
            strokeWidth={1.5}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            id={secretId}
            value={apiSecret}
            /* Masked by default so a shared screen does not show it, and so a
               browser does not offer to remember it as ordinary text. */
            type={showSecret ? "text" : "password"}
            onChange={(event) => setApiSecret(event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, secret: true }))}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste your API secret"
            aria-invalid={secretInvalid}
            aria-describedby={secretInvalid ? `${secretErrorId} ${noteId}` : noteId}
            className={cn(fieldInput, "type-mono-addr pl-9 pr-11")}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            aria-label={showSecret ? "Hide API secret" : "Show API secret"}
            aria-pressed={showSecret}
            aria-controls={secretId}
            className={cn(
              "absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-chip text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {showSecret ? (
              <EyeOff size={15} strokeWidth={1.5} aria-hidden />
            ) : (
              <Eye size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
        </div>
        {secretInvalid && (
          <p id={secretErrorId} className="type-label text-negative">
            Paste the whole secret — letters and numbers only, no spaces.
          </p>
        )}
      </div>

      <p id={noteId} className="type-label text-text-muted">
        Disable trading permissions and configure an IP allowlist.
      </p>

      <Disclosure open={guideOpen} onOpenChange={setGuideOpen} icon={BookOpen} label="Setup guide">
        <SetupGuide />
      </Disclosure>

      <button type="submit" disabled={!keyValid || !secretValid || submitting} className={cn(primaryAction, "w-full")}>
        {submitting ? "Checking the key with Binance…" : "Connect Binance"}
      </button>
      {onCancel !== undefined && (
        <button type="button" onClick={onCancel} disabled={submitting} className={cn(textAction, "self-center")}>
          Keep the current key
        </button>
      )}
    </form>
  );
}

/** How to make a key Elyra will accept. Every step is something the check below enforces or depends on. */
function SetupGuide() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <ol className="type-body-sm flex list-decimal flex-col gap-1.5 pl-5 text-text-secondary marker:text-text-muted">
        <li>In Binance, open API Management and create a system-generated key.</li>
        <li>
          Leave only <span className="text-text-primary">Enable Reading</span> on. Elyra checks the key&rsquo;s
          permissions with Binance and refuses one that can trade, transfer or withdraw.
        </li>
        <li>
          If you restrict the key to trusted IPs, the list has to include the address Elyra connects from, or Binance
          will refuse the check.
        </li>
        <li>Paste the key and secret here. They are encrypted on arrival and never shown again.</li>
      </ol>
      <CardRule />
      <a
        href="https://www.binance.com/en/my/settings/api-management"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(textAction, "self-start")}
      >
        Open Binance API Management
        <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
