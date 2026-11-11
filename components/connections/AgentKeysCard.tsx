"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { BrainCircuit, Copy, KeyRound, Plug } from "lucide-react";
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
  outlinedAction,
  primaryAction,
  readJson,
  useAccountFetch,
} from "@/components/connections/primitives";
import { useCopy } from "@/lib/clipboard";
import { formatRelativeTime } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   AI agents: keys that let an outside agent — Claude, ChatGPT, a bot of the
   person's own — read Elyra's live context over MCP (/api/mcp) or REST
   (/api/v1/tools).

   A key reads market data. It reads the person's own portfolio only if they
   tick the box when creating it. Nothing an agent can call trades, moves
   funds or changes settings. The key is shown once, at creation; Elyra keeps
   only its hash, so a lost key is revoked and replaced, never recovered.
--------------------------------------------------------------------------- */

interface KeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: ("market" | "account")[];
  createdAt: string;
  lastUsedAt: string | null;
}

const subscribeNever = () => () => {};

function CopyLine({ text, label, multiline = false }: { text: string; label: string; multiline?: boolean }) {
  const { state, copy } = useCopy();
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
      <code className={cn("type-mono-addr min-w-0 flex-1 text-text-primary", multiline ? "whitespace-pre-wrap break-all" : "truncate")}>{text}</code>
      <button type="button" onClick={() => void copy(text)} aria-label={label} className={cn(outlinedAction, "h-8 shrink-0 px-2.5")}>
        <Copy size={13} strokeWidth={1.5} aria-hidden />
        {state === "copied" ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function HowToConnect({ origin, keyText }: { origin: string; keyText: string }) {
  const endpoint = `${origin}/api/mcp`;
  const config = JSON.stringify({ mcpServers: { elyra: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${keyText}` } } } }, null, 2);
  return (
    <div className="flex flex-col gap-2">
      <p className="type-label text-text-secondary">Claude Code</p>
      <CopyLine multiline label="Copy the Claude Code command" text={`claude mcp add --transport http elyra ${endpoint} --header "Authorization: Bearer ${keyText}"`} />
      <p className="type-label text-text-secondary">Any MCP client that takes a JSON config (Cursor, Windsurf and others)</p>
      <CopyLine multiline label="Copy the MCP config" text={config} />
      <p className="type-label text-text-secondary">Without MCP — plain HTTP</p>
      <CopyLine
        multiline
        label="Copy the curl example"
        text={`curl -X POST ${origin}/api/v1/tools/get_market_snapshot -H "Authorization: Bearer ${keyText}" -H "content-type: application/json" -d '{"symbols":["BTC","NVDA"]}'`}
      />
    </div>
  );
}

export function AgentKeysCard() {
  const accountFetch = useAccountFetch();
  const now = useMinute();
  const nameId = useId();
  const [keys, setKeys] = useState<KeyView[] | null | "failed">(null);
  const [name, setName] = useState("");
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  /* The endpoint is wherever this page is served from; the server render has no window. */
  const origin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "https://api.getelyra.xyz");

  const fetchKeys = useCallback(async (): Promise<{ keys: KeyView[] | "failed"; error: string | null }> => {
    try {
      const response = await accountFetch("/api/agent-keys", { cache: "no-store" });
      const body = await readJson<{ keys: KeyView[]; error: string }>(response);
      if (response.ok && Array.isArray(body.keys)) return { keys: body.keys, error: null };
      return { keys: "failed", error: typeof body.error === "string" ? body.error : null };
    } catch {
      return { keys: "failed", error: null };
    }
  }, [accountFetch]);

  const apply = useCallback((next: { keys: KeyView[] | "failed"; error: string | null }) => {
    setKeys(next.keys);
    if (next.error !== null) setProblem(next.error);
  }, []);

  const load = useCallback(async () => apply(await fetchKeys()), [apply, fetchKeys]);

  useEffect(() => {
    let live = true;
    void fetchKeys().then((next) => {
      if (live) apply(next);
    });
    return () => {
      live = false;
    };
  }, [apply, fetchKeys]);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await accountFetch("/api/agent-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, account }),
      });
      const body = await readJson<{ key: string; error: string }>(response);
      if (!response.ok || typeof body.key !== "string") {
        setProblem(typeof body.error === "string" ? body.error : "The key could not be created.");
        return;
      }
      setFresh({ key: body.key, name: name.trim() });
      setName("");
      setAccount(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    setProblem(null);
    try {
      const response = await accountFetch(`/api/agent-keys/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await readJson<{ error: string }>(response);
        setProblem(typeof body.error === "string" ? body.error : "The key could not be revoked.");
      }
      await load();
    } finally {
      setRevoking(null);
    }
  };

  const list = Array.isArray(keys) ? keys : [];
  const status =
    keys === null ? (
      <StatusBadge name="AI agents" status="checking" />
    ) : keys === "failed" ? (
      <StatusBadge name="AI agents" status="unavailable" />
    ) : list.length === 0 ? (
      <StatusBadge name="AI agents" status="not-connected" label="No keys" />
    ) : (
      <StatusBadge name="AI agents" status="connected" label={`${list.length} ${list.length === 1 ? "key" : "keys"}`} />
    );

  return (
    <ConnectionCard
      mark={<MarkTile icon={BrainCircuit} />}
      title="AI agents"
      subtitle="Give Claude, ChatGPT or your own agent Elyra's live market context over MCP. Read-only."
      status={status}
    >
      {fresh !== null && (
        <div role="status" className="flex flex-col gap-2 rounded-card border border-accent-quiet p-3">
          <p className="type-body-sm text-text-primary">
            Key for {fresh.name}. Copy it now — Elyra keeps only a fingerprint and cannot show it again.
          </p>
          <CopyLine text={fresh.key} label="Copy the new agent key" />
          <HowToConnect origin={origin} keyText={fresh.key} />
          <button type="button" onClick={() => setFresh(null)} className={cn(outlinedAction, "self-start")}>
            I have saved it
          </button>
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor={nameId} className="type-label text-text-secondary">
          New key, named for the agent that will use it
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Claude Code on my laptop"
            maxLength={60}
            className={cn(fieldInput, "min-w-[12rem] flex-1")}
          />
          <button type="submit" disabled={busy || name.trim().length === 0} className={primaryAction}>
            <KeyRound size={15} strokeWidth={1.5} aria-hidden />
            {busy ? "Creating…" : "Create key"}
          </button>
        </div>
        <label className="type-body-sm flex items-start gap-2 text-text-secondary">
          <input type="checkbox" checked={account} onChange={(event) => setAccount(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
          <span>
            Also let it read my portfolio, positions, orders and activity
            <span className="type-label block text-text-muted">Without this, the key reads market data only.</span>
          </span>
        </label>
      </form>

      {problem !== null && <InlineError>{problem}</InlineError>}
      {keys === "failed" && problem === null && <InlineError>Your keys could not be loaded.</InlineError>}

      {list.length > 0 && (
        <>
          <CardRule />
          <ul className="flex flex-col divide-y divide-border-subtle">
            {list.map((key) => (
              <li key={key.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="type-body-sm min-w-0 font-medium text-text-primary">{key.name}</span>
                  <span className="type-mono-addr text-text-muted">{key.prefix}…</span>
                </div>
                <span className="type-label text-text-muted">
                  {key.scopes.includes("account") ? "Market data and your account" : "Market data only"} ·{" "}
                  {key.lastUsedAt === null || now === null ? "never used" : `used ${formatRelativeTime(key.lastUsedAt, now)}`}
                </span>
                <ConfirmAction
                  trigger="Revoke"
                  question={`Revoke ${key.name}? Agents using it stop working at once.`}
                  confirm="Revoke key"
                  pendingLabel="Revoking…"
                  pending={revoking === key.id}
                  onConfirm={() => void revoke(key.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Disclosure open={helpOpen} onOpenChange={setHelpOpen} label="How to connect an agent" icon={Plug}>
        <div className="flex flex-col gap-2">
          <InlineNote>
            Endpoint <span className="type-mono-addr text-text-primary">{origin}/api/mcp</span>. Each key may make 60 calls a minute and 2,000 a day.
          </InlineNote>
          <HowToConnect origin={origin} keyText="elyra_ak_YOUR_KEY" />
        </div>
      </Disclosure>
    </ConnectionCard>
  );
}
