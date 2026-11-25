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
import { useT } from "@/lib/i18n/client";

export function YieldTab({ active }: { active: boolean }) {
  const t = useT();
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
        <h2>{t("Yield opportunities")}</h2>
        <Timestamp at={feed.data?.asOf} label={t("Kamino ·")} />
      </div>
      <div className="r-toolbar r-yield-toolbar">
        <label className="r-search">
          <Search size={18} aria-hidden />
          <span className="sr-only">{t("Search pools or protocols")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search pools or protocols…")}
          />
        </label>
        <label className="r-toggle">
          <input
            type="checkbox"
            checked={stables}
            onChange={(event) => setStables(event.target.checked)}
          />
          <span>{t("Stablecoins only")}</span>
        </label>
        <label>
          <span className="sr-only">{t("Sort yield opportunities")}</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="apyPct">{t("Sort: Current APY")}</option>
            <option value="apy30dPct">{t("Sort: 30-day APY")}</option>
            <option value="tvlUsd">{t("Sort: Deposited")}</option>
          </select>
        </label>
      </div>
      {!auth.authenticated ? (
        <SignIn />
      ) : (
        <>
          {feed.loading && !feed.data && (
            <Loading>{t("Reading Kamino vaults…")}</Loading>
          )}
          {feed.error && <Problem retry={feed.reload}>{feed.error}</Problem>}
          {feed.data && (
            <div className="r-table-scroll">
              <table className="r-yield-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Pool")}</th>
                    <th scope="col">{t("Asset")}</th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={sort === "tvlUsd" ? "descending" : undefined}
                    >
                      {t("Deposited")}
                    </th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={sort === "apyPct" ? "descending" : undefined}
                    >
                      {t("Yield · APY")}
                    </th>
                    <th
                      scope="col"
                      className="r-number"
                      aria-sort={
                        sort === "apy30dPct" ? "descending" : undefined
                      }
                    >
                      {t("30-day avg · APY")}
                    </th>
                    <th scope="col">
                      <span className="sr-only">{t("Details")}</span>
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
                          aria-label={t("View {name} details", { name: row.name })}
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
                  <h3>{t("No pools match")}</h3>
                  <p>{t("Try another search or turn off the stablecoins filter.")}</p>
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
            <DialogTitle>{selected?.name ?? t("Pool details")}</DialogTitle>
            <DialogDescription>
              {t("Kamino vault · Protocol-reported APY.")}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="r-dialog-body">
              <dl className="r-definition">
                <dt>{t("Asset")}</dt>
                <dd>{selected.asset}</dd>
                <dt>{t("Token mint")}</dt>
                <dd>{selected.mint}</dd>
                <dt>{t("Vault")}</dt>
                <dd>{selected.id}</dd>
                <dt>{t("Deposited")}</dt>
                <dd>{dollars(selected.tvlUsd)}</dd>
                <dt>{t("Current APY")}</dt>
                <dd>{percentage(selected.apyPct)}</dd>
                <dt>{t("30-day average APY")}</dt>
                <dd>{percentage(selected.apy30dPct)}</dd>
                <dt>{t("Reward APY")}</dt>
                <dd>{percentage(selected.rewardApyPct)}</dd>
                <dt>{t("Available capital")}</dt>
                <dd>{dollars(selected.availableUsd)}</dd>
                <dt>{t("Holders")}</dt>
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
