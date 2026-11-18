"use client";

import { useState } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { CharterFields, charterBody, draftOf, type CharterDraft } from "@/components/funds/CharterFields";
import { FreshKey } from "@/components/funds/ManagerBrief";
import { field, Problem } from "@/components/funds/parts";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button, buttonVariants } from "@/components/ui/Button";
import { CHARTER_DEFAULTS, FUND_LIMITS } from "@/lib/funds/policy";
import type { FundManagerOption, FundSummary } from "@/lib/funds/types";
import type { FundsFeed } from "@/lib/funds/useFunds";
import type { FundsResponse } from "@/lib/funds/types";

/* ---------------------------------------------------------------------------
   Launching a fund: its charter, its starting capital (always paper first),
   and its manager — an agent key the person already has, a new one made
   for it (shown once, here, with how to connect it), or none yet.
--------------------------------------------------------------------------- */

type ManagerChoice = { kind: "new"; name: string } | { kind: "existing"; keyId: string } | { kind: "none" };

export function LaunchFund({ feed, managers, onClose }: { feed: FundsFeed<FundsResponse>; managers: FundManagerOption[]; onClose: () => void }) {
  const free = managers.filter((manager) => manager.managing === null);
  const [draft, setDraft] = useState<CharterDraft>(() => draftOf(CHARTER_DEFAULTS));
  const [capital, setCapital] = useState("10000");
  const [manager, setManager] = useState<ManagerChoice>({ kind: "new", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ fund: FundSummary; key: string | null } | null>(null);

  const launch = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { ...charterBody(draft), capitalUsd: Number(capital.replace(/[$,\s]/g, "")) };
    if (manager.kind === "new") body.newKeyName = manager.name.trim().length > 0 ? manager.name : `${draft.name.trim() || "Fund"} manager`;
    if (manager.kind === "existing") body.keyId = manager.keyId;
    const result = await feed.write("/api/funds", "POST", body);
    setBusy(false);
    if (result.error !== null) return setError(result.error);
    setLaunched({ fund: result.body.fund as FundSummary, key: (result.body.key as string | null) ?? null });
  };

  if (launched !== null) {
    return (
      <DrawerCard icon={Rocket} title={`${launched.fund.name} is trading on paper`}>
        <div className="flex flex-col gap-4">
          {launched.key !== null ? (
            <FreshKey keyText={launched.key} fundName={launched.fund.name} />
          ) : (
            <p className="type-body-sm text-text-secondary">
              {manager.kind === "existing"
                ? "Its manager's key already exists; the fund's page has the instructions to give the agent."
                : "It has no manager yet. Assign one from the fund's page — until then, nothing trades."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/funds/${launched.fund.id}`} className={buttonVariants({ variant: "accent", size: "sm" })}>
              Open the fund
            </Link>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </DrawerCard>
    );
  }

  return (
    <DrawerCard icon={Rocket} title="Launch a fund">
      <div className="flex flex-col gap-5">
        <p className="type-body-sm text-text-secondary">
          You write the charter; an AI agent manages the fund inside it; Elyra holds every order to it, marks the book every five minutes and halts the fund at its
          drawdown limit. Every fund starts on paper at Hyperliquid&apos;s prices, after fees. After {FUND_LIMITS.minIncubationDays} days and{" "}
          {FUND_LIMITS.minIncubationTrades} closed trades it can graduate to your own Hyperliquid account.
        </p>
        <CharterFields draft={draft} onChange={setDraft} />

        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">Starting capital, on paper (USD)</span>
          <input inputMode="decimal" className={field} value={capital} onChange={(event) => setCapital(event.target.value)} />
          <span className="type-label text-text-muted">
            ${FUND_LIMITS.minCapitalUsd} to ${FUND_LIMITS.maxPaperCapitalUsd.toLocaleString("en-US")}. Units start at 100, so returns are the manager&apos;s, whatever you add later.
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="type-label mb-1 text-text-secondary">Manager</legend>
          <label className="flex items-start gap-2.5">
            <input type="radio" name="manager" className="mt-1 size-4 accent-[var(--accent)]" checked={manager.kind === "new"} onChange={() => setManager({ kind: "new", name: "" })} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="type-body-sm text-text-primary">Make a key for a new AI manager</span>
              {manager.kind === "new" && (
                <input
                  className={field}
                  maxLength={60}
                  value={manager.name}
                  onChange={(event) => setManager({ kind: "new", name: event.target.value })}
                  placeholder={`${draft.name.trim() || "Fund"} manager`}
                  aria-label="Name of the manager's key"
                />
              )}
            </span>
          </label>
          {free.length > 0 && (
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="manager"
                className="mt-1 size-4 accent-[var(--accent)]"
                checked={manager.kind === "existing"}
                onChange={() => setManager({ kind: "existing", keyId: free[0].keyId })}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="type-body-sm text-text-primary">Use one of my agent keys</span>
                {manager.kind === "existing" && (
                  <select className={field} value={manager.keyId} onChange={(event) => setManager({ kind: "existing", keyId: event.target.value })} aria-label="Agent key">
                    {free.map((option) => (
                      <option key={option.keyId} value={option.keyId}>
                        {option.name} · {option.prefix}…
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
          )}
          <label className="flex items-start gap-2.5">
            <input type="radio" name="manager" className="mt-1 size-4 accent-[var(--accent)]" checked={manager.kind === "none"} onChange={() => setManager({ kind: "none" })} />
            <span className="type-body-sm text-text-primary">Assign one later</span>
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="accent" disabled={busy || draft.name.trim().length === 0 || draft.objective.trim().length === 0 || draft.markets.length === 0} onClick={() => void launch()}>
            {busy ? "Launching" : "Launch on paper"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <Problem text={error} />
      </div>
    </DrawerCard>
  );
}
