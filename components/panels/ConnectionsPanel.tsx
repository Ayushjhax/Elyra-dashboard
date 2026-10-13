"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, Copy, Link2, Plug, TrendingUp } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { RouteClose } from "@/components/shell/RouteClose";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The agent's console: what it can reach on the operator's behalf.

   Two connections, both read-only. Telegram is a second surface onto the same
   agent; an exchange is what gives the portfolio tools something to read.
--------------------------------------------------------------------------- */

interface Connection {
  exchange: string;
  label: string | null;
  keyLastFour: string | null;
  walletAddress: string | null;
  connectedAt: string;
}

interface LinkCode {
  code: string;
  expiresAt: string;
  deepLink: string | null;
}

const field = cn(
  "type-data-sm h-[var(--control-h)] w-full rounded-control px-2",
  "border border-border-strong bg-surface-raised text-text-primary",
  "placeholder:text-text-muted focus:border-accent-quiet focus:outline-none",
);

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-raised p-3">
      {children}
    </div>
  );
}

/* --- Telegram ------------------------------------------------------------ */

function TelegramSection() {
  const authedFetch = useAuthedFetch();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [code, setCode] = useState<LinkCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Fetches, and does not touch state. Keeping the I/O separate is what lets
     the effect below set state only inside an awaited continuation, guarded
     by a cancel flag — a response that lands after unmount, or out of order
     behind a newer one, is discarded rather than written. */
  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/telegram/link");
      if (!response.ok) return null;
      return (await response.json()) as {
        linked: boolean;
        username: string | null;
      };
    } catch {
      /* Leave the section in its unknown state rather than claiming
         "not linked", which would invite a pointless second link. */
      return null;
    }
  }, [authedFetch]);

  useEffect(() => {
    let cancelled = false;
    void load().then((payload) => {
      if (cancelled || payload === null) return;
      setLinked(payload.linked);
      setUsername(payload.username);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch("/api/telegram/link", { method: "POST" });
      const payload = (await response.json()) as LinkCode & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not issue a code.");
        return;
      }
      setCode(payload);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Link2 size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        <h2 className="type-label text-text-secondary">Telegram</h2>
      </div>

      <Row>
        {linked === true ? (
          <div className="flex flex-col gap-3">
            <p className="type-body-sm text-text-primary">
              Linked{username === null ? "" : ` to @${username}`}. Send{" "}
              <code className="type-data-sm text-text-secondary">/unlink</code> in
              the chat to disconnect.
            </p>
            <NotificationToggles />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="type-body-sm text-text-secondary">
              Ask Elyra from Telegram. Same agent, same data, same limits.
            </p>

            {code === null ? (
              <Button
                variant="accent"
                size="sm"
                onClick={issue}
                disabled={busy}
                className="self-start"
              >
                {busy ? "Generating…" : "Connect Telegram"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-h2 tracking-[0.2em] text-accent">
                    {code.code}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Copy code"
                    onClick={() => {
                      void navigator.clipboard?.writeText(code.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? (
                      <Check size={12} strokeWidth={1.5} aria-hidden />
                    ) : (
                      <Copy size={12} strokeWidth={1.5} aria-hidden />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <p className="type-label text-text-muted">
                  Expires in ten minutes, single use.
                </p>

                {code.deepLink === null ? (
                  <p className="type-body-sm text-text-secondary">
                    Send <code className="type-data-sm">/link {code.code}</code> to
                    the bot.
                  </p>
                ) : (
                  <a
                    href={code.deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "type-label self-start rounded-control border border-border-strong",
                      "bg-surface-raised px-3 py-2 text-text-primary",
                      "transition-colors duration-[var(--dur-fast)] ease-brand",
                      "hover:bg-surface-hover",
                    )}
                  >
                    Open Telegram and link
                  </a>
                )}
              </div>
            )}

            {error !== null && (
              <p className="type-label text-negative">{error}</p>
            )}
          </div>
        )}
      </Row>
    </section>
  );
}

/* --- Notifications -------------------------------------------------------- */

interface Preferences {
  priceAlerts: boolean;
  liquidationAlerts: boolean;
  largeMoves: boolean;
  dailySummary: boolean;
  moveThresholdPct: number;
}

const TOGGLES: Array<{ key: keyof Preferences; label: string; hint: string }> = [
  {
    key: "liquidationAlerts",
    label: "Liquidation warnings",
    hint: "When a DeFi position approaches its published liquidation threshold.",
  },
  {
    key: "largeMoves",
    label: "Large moves",
    hint: "When something you hold moves more than your threshold.",
  },
  {
    key: "priceAlerts",
    label: "Price alerts",
    hint: "Levels you set on the chart.",
  },
  {
    key: "dailySummary",
    label: "Daily summary",
    hint: "One message a day with where your capital stands.",
  },
];

/**
 * What Elyra is allowed to send, unprompted, into a Telegram chat.
 *
 * Everything starts off. Linking a chat is consent to ASK questions; it is not
 * consent to be told things, and an unsolicited message containing a balance
 * is a disclosure nobody agreed to. Each switch is written immediately rather
 * than behind a Save, because a half-applied notification setting is worse
 * than either state.
 */
function NotificationToggles() {
  const authedFetch = useAuthedFetch();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await authedFetch("/api/telegram/notifications");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as Preferences;
        if (!cancelled) setPreferences(body);
      } catch {
        /* Silence rather than a wrong claim — the section simply does not
           render until we know what is actually set. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  const toggle = useCallback(
    async (key: keyof Preferences, next: boolean) => {
      setPending(key);
      setError(null);
      try {
        const response = await authedFetch("/api/telegram/notifications", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [key]: next }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          setError(body.error ?? "Could not save that.");
          return;
        }

        /* The server's answer, not the optimistic value. A switch that shows
           on while the row says off is a promise the product will not keep. */
        setPreferences((await response.json()) as Preferences);
      } catch {
        setError("Could not save that. Nothing was changed.");
      } finally {
        setPending(null);
      }
    },
    [authedFetch],
  );

  if (preferences === null) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
      <p className="type-label text-text-muted">What Elyra sends you</p>

      {TOGGLES.map((item) => {
        const on = preferences[item.key] === true;
        return (
          <label
            key={item.key}
            className="flex cursor-pointer items-start justify-between gap-3 py-1"
          >
            <span className="flex flex-col">
              <span className="type-body-sm text-text-primary">{item.label}</span>
              <span className="type-label text-text-muted">{item.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={on}
              disabled={pending === item.key}
              onChange={(event) => void toggle(item.key, event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
          </label>
        );
      })}

      {error !== null && <p className="type-label text-negative">{error}</p>}
    </div>
  );
}

/* --- Prediction markets --------------------------------------------------- */

interface PredictionState {
  connected: boolean;
  address: string | null;
  verifiedAt: string | null;
  /** The connected wallet, offered as a starting point. */
  suggestion: string | null;
}

interface PredictionFound {
  address: string;
  positionCount: number;
  valueUsd: number;
  sample: Array<{ market: string; outcome: string; valueUsd: number | null }>;
}

const shortAddress = (value: string): string =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;

/**
 * Linking a prediction-market account.
 *
 * ── Why this asks instead of deriving ──────────────────────────────────
 *
 * Polymarket holds positions in a contract wallet, not the EOA that controls
 * it. The newest generation is derivable from the signer, but the legacy
 * Proxy wallets (email login) and Safe wallets (browser wallet) are not, and
 * between them they cover most existing accounts. A derivation that produces
 * the wrong address does not fail loudly — it attaches a stranger's positions
 * to this portfolio and reports them as the operator's own.
 *
 * ── Check before saving ────────────────────────────────────────────────
 *
 * The check is a live read that writes nothing. It shows what is actually at
 * that address — count, value, a couple of market names — so the operator
 * recognises their own account before it is attached. A typo shows an empty
 * result rather than becoming a permanent wrong link.
 */
function PredictionSection() {
  const authedFetch = useAuthedFetch();
  const addressId = useId();

  const [state, setState] = useState<PredictionState | null>(null);
  const [draft, setDraft] = useState("");
  const [found, setFound] = useState<PredictionFound | null>(null);
  const [busy, setBusy] = useState<"detect" | "check" | "save" | "unlink" | null>(null);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Re-reads the linked state. Used after a save or an unlink. */
  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/prediction/account");
      if (!response.ok) return;
      setState((await response.json()) as PredictionState);
    } catch {
      /* Silence rather than a wrong claim — the section stays hidden until
         we know what is actually linked. */
    }
  }, [authedFetch]);

  useEffect(() => {
    let cancelled = false;

    /* Inlined rather than calling `load` directly: every setState below sits
       behind an await, so nothing runs synchronously in the effect body and
       there is no cascading render. */
    void (async () => {
      try {
        const response = await authedFetch("/api/prediction/account");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as PredictionState;
        if (!cancelled) setState(body);
      } catch {
        /* See above. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  /**
   * Finds the account from the connected wallet, so nothing is typed.
   *
   * Links only what it actually finds. A derived address with nothing at it
   * is reported, never stored — a silent wrong link would attach a stranger's
   * positions to this portfolio.
   */
  const detect = useCallback(async () => {
    setBusy("detect");
    setError(null);
    setDetectNote(null);
    try {
      const response = await authedFetch("/api/prediction/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ detect: true }),
      });
      const body = (await response.json()) as {
        detected?: boolean;
        reason?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Could not check your wallet.");
        return;
      }
      if (body.detected === true) {
        await load();
        return;
      }
      setDetectNote(body.reason ?? "Nothing found for your connected wallet.");
    } catch {
      setError("Could not reach the provider.");
    } finally {
      setBusy(null);
    }
  }, [authedFetch, load]);

  const check = useCallback(async () => {
    setBusy("check");
    setError(null);
    setFound(null);
    try {
      const response = await authedFetch("/api/prediction/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: draft.trim(), preview: true }),
      });
      const body = (await response.json()) as { found?: PredictionFound; error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not check that address.");
        return;
      }
      setFound(body.found ?? null);
    } catch {
      setError("Could not reach the provider.");
    } finally {
      setBusy(null);
    }
  }, [authedFetch, draft]);

  const save = useCallback(async () => {
    setBusy("save");
    setError(null);
    try {
      const response = await authedFetch("/api/prediction/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: draft.trim() }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }
      setDraft("");
      setFound(null);
      await load();
    } catch {
      setError("Could not save that. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }, [authedFetch, draft, load]);

  const unlink = useCallback(async () => {
    setBusy("unlink");
    try {
      await authedFetch("/api/prediction/account", { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }, [authedFetch, load]);

  if (state === null) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        <h2 className="type-label text-text-secondary">Prediction markets</h2>
      </div>

      <Row>
        {state.connected ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="type-body-sm text-text-primary">
                  Linked{state.verifiedAt === null ? "" : " and verified"}.
                </p>
                <p className="type-mono-addr mt-0.5 break-all text-text-muted">
                  {state.address}
                </p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => void unlink()} disabled={busy !== null}>
                {busy === "unlink" ? "Removing…" : "Unlink"}
              </Button>
            </div>

            {state.verifiedAt === null && (
              /* Saved but nothing found. Said out loud, because the likeliest
                 explanation is a typo and the second likeliest is a brand-new
                 account — and only the operator can tell which. */
              <p className="type-label text-text-muted">
                Nothing was found at this address yet. That is normal for a new
                account; if you expected positions, check the address.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="type-body-sm text-text-secondary">
              Track your prediction-market positions alongside the rest of your
              capital. Browsing markets needs no account.
            </p>

            <Button
              variant="accent"
              size="sm"
              className="self-start"
              onClick={() => void detect()}
              disabled={busy !== null}
            >
              {busy === "detect" ? "Looking…" : "Find my account"}
            </Button>

            {detectNote !== null && (
              <p className="type-label text-text-muted">{detectNote}</p>
            )}

            <label htmlFor={addressId} className="type-label pt-1 text-text-muted">
              Or enter the address yourself
            </label>
            <input
              id={addressId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className={cn(
                "type-mono-addr w-full rounded-control border border-border-subtle",
                "bg-surface-base px-2.5 py-2 text-text-primary",
                "placeholder:text-text-muted focus:border-border-strong focus:outline-none",
              )}
            />

            <p className="type-label text-text-muted">
              Needed only if you trade on Polymarket under a different login.
              Find it on polymarket.com under your profile — it is the address
              your positions are held in, which is usually not the wallet you
              sign in with.
            </p>

            {state.suggestion !== null && draft.length === 0 && (
              <button
                type="button"
                onClick={() => setDraft(state.suggestion ?? "")}
                className="type-label self-start text-accent hover:underline"
              >
                Try my connected wallet ({shortAddress(state.suggestion)})
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void check()}
                disabled={busy !== null || draft.trim().length === 0}
              >
                {busy === "check" ? "Checking…" : "Check"}
              </Button>
              {found !== null && (
                <Button variant="accent" size="sm" onClick={() => void save()} disabled={busy !== null}>
                  {busy === "save" ? "Linking…" : "This is mine — link it"}
                </Button>
              )}
            </div>

            {found !== null && (
              <div className="rounded-control border border-border-subtle bg-surface-base p-2.5">
                {found.positionCount === 0 ? (
                  <p className="type-body-sm text-text-secondary">
                    No positions found at {shortAddress(found.address)}. Link it
                    anyway if the account is new, or check the address.
                  </p>
                ) : (
                  <>
                    <p className="type-body-sm text-text-primary">
                      {found.positionCount} position
                      {found.positionCount === 1 ? "" : "s"} worth{" "}
                      {found.valueUsd.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <ul className="mt-1.5 flex list-none flex-col gap-0.5">
                      {found.sample.map((row) => (
                        <li
                          key={`${row.market}:${row.outcome}`}
                          className="type-label text-text-muted"
                        >
                          {row.market.slice(0, 54)} · {row.outcome}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {error !== null && <p className="type-label text-negative">{error}</p>}
          </div>
        )}
      </Row>
    </section>
  );
}

/* --- Exchanges ----------------------------------------------------------- */

function ExchangeSection() {
  const authedFetch = useAuthedFetch();
  const keyId = useId();
  const secretId = useId();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Fetch only, no state — see the note in TelegramSection. */
  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/exchanges");
      if (!response.ok) return null;
      return (await response.json()) as {
        connections: Connection[];
        sessionWallet: string | null;
      };
    } catch {
      /* Same reasoning as Telegram: silence beats a wrong claim. */
      return null;
    }
  }, [authedFetch]);

  const apply = useCallback(
    (payload: { connections: Connection[]; sessionWallet: string | null } | null) => {
      if (payload === null) return;
      setConnections(payload.connections);
      setSessionWallet(payload.sessionWallet);
    },
    [],
  );

  const refresh = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((payload) => {
      if (!cancelled) apply(payload);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch("/api/exchanges", {
        method: "POST",
        body: JSON.stringify({ exchange: "binance", apiKey, apiSecret }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      setApiKey("");
      setApiSecret("");
      await refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (exchange: string) => {
    await authedFetch(`/api/exchanges?exchange=${exchange}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Plug size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        <h2 className="type-label text-text-secondary">Exchanges</h2>
      </div>

      {sessionWallet !== null && (
        <Row>
          <p className="type-body-sm text-text-primary">
            Hyperliquid is readable from your wallet already — no key needed.
          </p>
          <p className="type-mono-addr mt-1 break-all text-text-muted">
            {sessionWallet}
          </p>
        </Row>
      )}

      {connections.map((connection) => (
        <Row key={connection.exchange}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="type-body-sm capitalize text-text-primary">
                {connection.exchange}
              </p>
              <p className="type-label text-text-muted">
                {connection.keyLastFour === null
                  ? connection.walletAddress
                  : `Key ending ${connection.keyLastFour}`}
              </p>
            </div>
            <Button
              variant="danger"
              size="xs"
              onClick={() => void disconnect(connection.exchange)}
            >
              Disconnect
            </Button>
          </div>
        </Row>
      ))}

      {!connections.some((entry) => entry.exchange === "binance") && (
        <Row>
          <div className="flex flex-col gap-2">
            <p className="type-body-sm text-text-secondary">
              Connect Binance to let Elyra read your positions and equity.
            </p>
            <p className="type-label text-text-muted">
              Create the key with trading disabled and an IP allowlist. Elyra
              only ever calls read endpoints, but a key that can trade is still
              a key that can trade.
            </p>

            <label htmlFor={keyId} className="sr-only">
              Binance API key
            </label>
            <input
              id={keyId}
              className={field}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API key"
              autoComplete="off"
              spellCheck={false}
            />

            <label htmlFor={secretId} className="sr-only">
              Binance API secret
            </label>
            <input
              id={secretId}
              className={field}
              value={apiSecret}
              /* type=password so a shared screen does not leak it, and so
                 browsers do not offer to remember it as ordinary text. */
              type="password"
              onChange={(event) => setApiSecret(event.target.value)}
              placeholder="API secret"
              autoComplete="off"
              spellCheck={false}
            />

            <Button
              variant="accent"
              size="sm"
              className="self-start"
              disabled={busy || apiKey.length === 0 || apiSecret.length === 0}
              onClick={connect}
            >
              {busy ? "Saving…" : "Connect Binance"}
            </Button>

            {error !== null && <p className="type-label text-negative">{error}</p>}
          </div>
        </Row>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */

export function ConnectionsPanel() {
  const auth = useElyraAuth();

  return (
    <Panel label="Agent" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Agent</Eyebrow>
        <RouteClose />
      </PanelHeader>

      <PanelBody className="p-4">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
          <div>
            <h1 className="type-h1 text-text-primary">Connections</h1>
            <p className="type-body mt-1 text-text-secondary">
              What Elyra can reach on your behalf. Everything here is read-only —
              it cannot place, change or cancel an order.
            </p>
          </div>

          {!auth.available ? (
            <Row>
              <p className="type-body-sm text-text-secondary">
                Authentication is not configured, so there is no account to
                connect anything to.
              </p>
            </Row>
          ) : !auth.ready ? (
            <Row>
              <p className="type-body-sm text-text-muted">Loading…</p>
            </Row>
          ) : !auth.authenticated ? (
            <Row>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-body-sm text-text-secondary">
                  Sign in to connect Telegram or an exchange.
                </p>
                <Button variant="accent" size="sm" onClick={auth.login}>
                  Sign in
                </Button>
              </div>
            </Row>
          ) : (
            <>
              <TelegramSection />
              <PredictionSection />
              <ExchangeSection />
            </>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}
