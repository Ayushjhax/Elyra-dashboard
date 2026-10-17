"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Landmark, Search } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { YieldOpportunity } from "@/lib/research/yield";
import {
  dollars,
  Loading,
  percentage,
  Problem,
  SignIn,
  Timestamp,
  useResearchResource,
} from "./shared";

export function YieldTab({ active }: { active: boolean }) {
  const auth = useElyraAuth();
  const [stables, setStables] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"apyPct" | "apy30dPct" | "tvlUsd">("apyPct");
  const [selected, setSelected] = useState<YieldOpportunity | null>(null);
  const feed = useResearchResource<{
    opportunities: YieldOpportunity[];
    asOf: string;
    ranking: string;
    warnings: string[];
  }>(
    `/api/research/yield${stables ? "?stables=true" : ""}`,
    active && auth.authenticated,
  );
  const rows = useMemo(
    () =>
      (feed.data?.opportunities ?? [])
        .filter((row) =>
          `${row.name} ${row.asset} ${row.provider} ${row.id}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        )
        .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity)),
    [feed.data, query, sort],
  );
  return (
    <div>
      <div className="r-section-heading">
        <h2>Yield opportunities</h2>
        <Timestamp at={feed.data?.asOf} label="Kamino ·" />
      </div>
      <div className="r-toolbar r-yield-toolbar">
        <label className="r-search">
          <Search size={18} aria-hidden />
          <span className="sr-only">Search pools or protocols</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pools or protocols…"
          />
        </label>
        <label className="r-toggle">
          <input
            type="checkbox"
            checked={stables}
            onChange={(event) => setStables(event.target.checked)}
          />
          <span>Stablecoins only</span>
        </label>
        <label>
          <span className="sr-only">Sort yield opportunities</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="apyPct">Sort: Current APY</option>
            <option value="apy30dPct">Sort: 30-day APY</option>
            <option value="tvlUsd">Sort: Deposited</option>
          </select>
        </label>
      </div>
      {!auth.authenticated ? (
        <SignIn />
      ) : (
        <>
          {feed.loading && !feed.data && (
            <Loading>Reading Kamino vaults…</Loading>
          )}
          {feed.error && <Problem retry={feed.reload}>{feed.error}</Problem>}
          {feed.data && (
            <div className="r-table-scroll">
              <table className="r-yield-table">
                <thead>
                  <tr>
                    <th scope="col">Pool</th>
                    <th scope="col">Asset</th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={sort === "tvlUsd" ? "descending" : undefined}
                    >
                      Deposited
                    </th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={sort === "apyPct" ? "descending" : undefined}
                    >
                      Yield · APY
                    </th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={
                        sort === "apy30dPct" ? "descending" : undefined
                      }
                    >
                      30-day avg · APY
                    </th>
                    <th scope="col">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="r-pool">
                          <Landmark size={22} strokeWidth={1.5} aria-hidden />
                          <div>
                            <span>{row.name}</span>
                            <small>{row.provider}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="r-asset-id" title={row.asset}>
                          {row.asset.length > 16
                            ? `${row.asset.slice(0, 6)}…${row.asset.slice(-4)}`
                            : row.asset}
                        </span>
                      </td>
                      <td className="r-number">{dollars(row.tvlUsd)}</td>
                      <td className="r-number r-accent">
                        {percentage(row.apyPct)}
                      </td>
                      <td className="r-number">{percentage(row.apy30dPct)}</td>
                      <td>
                        <button
                          type="button"
                          className="r-button"
                          aria-label={`View ${row.name} details`}
                          onClick={() => setSelected(row)}
                        >
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="r-empty">
                  <h3>No pools match</h3>
                  <p>Try another search or turn off the stablecoins filter.</p>
                </div>
              )}
            </div>
          )}
          {feed.data && (
            <p className="r-footnote">
              {feed.data.ranking}
              <br />
              {feed.data.warnings.join(" ")}
            </p>
          )}
        </>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="research-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? "Pool details"}</DialogTitle>
            <DialogDescription>
              Kamino vault · Protocol-reported APY.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="r-dialog-body">
              <dl className="r-definition">
                <dt>Asset</dt>
                <dd>{selected.asset}</dd>
                <dt>Token mint</dt>
                <dd>{selected.mint}</dd>
                <dt>Vault</dt>
                <dd>{selected.id}</dd>
                <dt>Deposited</dt>
                <dd>{dollars(selected.tvlUsd)}</dd>
                <dt>Current APY</dt>
                <dd>{percentage(selected.apyPct)}</dd>
                <dt>30-day average APY</dt>
                <dd>{percentage(selected.apy30dPct)}</dd>
                <dt>Reward APY</dt>
                <dd>{percentage(selected.rewardApyPct)}</dd>
                <dt>Available capital</dt>
                <dd>{dollars(selected.availableUsd)}</dd>
                <dt>Holders</dt>
                <dd>{selected.holders?.toLocaleString() ?? "—"}</dd>
              </dl>
              {selected.flags.map((flag) => (
                <p key={flag} className="r-note">
                  {flag}
                </p>
              ))}
              <Timestamp at={selected.asOf} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
