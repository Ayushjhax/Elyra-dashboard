"use client";

import { useState } from "react";
import {
  Activity,
  GitBranch,
  Layers,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { MarketSignal, SignalEvaluation } from "@/lib/research/signals";
import { SIGNAL_CRITERIA } from "@/lib/research/signalCriteria";
import {
  Choices,
  Loading,
  Problem,
  SignIn,
  Timestamp,
  useResearchResource,
} from "./shared";
import { useT } from "@/lib/i18n/client";

type SignalFeed = {
  signals: MarketSignal[];
  asOf: string;
  warnings: string[];
  evaluation?: SignalEvaluation;
};
export function SignalsTab({ active }: { active: boolean }) {
  const t = useT();
  const auth = useElyraAuth();
  const [symbol, setSymbol] = useState("SOL");
  const [criteria, setCriteria] = useState(false);
  const feed = useResearchResource<SignalFeed>(
    `/api/research/signals?symbol=${symbol}`,
    active && auth.authenticated,
  );
  const signals = feed.data?.signals ?? [];
  const evaluation = feed.data?.evaluation;
  const complete =
    evaluation &&
    [evaluation.price, evaluation.funding, evaluation.divergence].every(
      (state) => state === "evaluated",
    );
  return (
    <div>
      <div className="r-toolbar">
        <Choices
          label={t("Signal asset")}
          value={symbol}
          options={["SOL", "BTC", "ETH"].map((value) => ({
            value,
            label: value,
          }))}
          onChange={setSymbol}
        />
        <div className="r-actions">
          <button
            type="button"
            className="r-button"
            onClick={() => setCriteria(true)}
          >
            <SlidersHorizontal size={16} aria-hidden />
            {t("Criteria")}
          </button>
          <button
            type="button"
            className="r-button"
            aria-label={t("Refresh signals")}
            onClick={feed.reload}
            disabled={feed.loading || !auth.authenticated}
          >
            <RefreshCw size={18} aria-hidden />
          </button>
        </div>
      </div>
      {!auth.authenticated ? (
        <SignIn />
      ) : (
        <>
          {feed.loading && !feed.data && (
            <Loading>{t("Evaluating price, funding and venue readings…")}</Loading>
          )}
          {feed.error && <Problem retry={feed.reload}>{feed.error}</Problem>}
          {feed.data &&
            !feed.loading &&
            !feed.error &&
            signals.length === 0 && (
              <div className="r-quiet">
                <Activity size={28} strokeWidth={1.5} aria-hidden />
                <div>
                  <h2>
                    {complete
                      ? t("A quiet market is a signal, too.")
                      : t("Some market readings are unavailable.")}
                  </h2>
                  <p>
                    {complete
                      ? t("No price, funding, or venue divergence thresholds crossed for {symbol}.", { symbol })
                      : t("No triggers were returned for {symbol}. Incomplete or stale data cannot confirm a quiet market.", { symbol })}
                  </p>
                </div>
              </div>
            )}
          {signals.map((signal) => (
            <article
              className="r-signal"
              key={`${signal.type}-${signal.title}`}
            >
              <div className="r-section-heading">
                <h3>{signal.title}</h3>
                <span className="r-note">
                  {(signal.confirmationCount === 1 ? t("{strength} strength · {confirmationCount} venue", { strength: t(signal.strength), confirmationCount: signal.confirmationCount }) : t("{strength} strength · {confirmationCount} venues", { strength: t(signal.strength), confirmationCount: signal.confirmationCount }))}
                </span>
              </div>
              <p>{signal.summary}</p>
              <dl className="r-evidence">
                {signal.evidence.map((item, index) => (
                  <div key={index}>
                    <dt>
                      {item.label} · {item.source}
                      <Timestamp at={item.asOf} />
                    </dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              {signal.contradictions.map((item) => (
                <p key={item} className="r-negative">
                  {item}
                </p>
              ))}
              <Timestamp at={signal.dataFreshness} label={t("Oldest reading")} />
            </article>
          ))}
          <div className="r-summaries">
            {(
              [
                [
                  "price",
                  t("Price movement"),
                  TrendingUp,
                  [
                    "price_momentum",
                    "volatility_expansion",
                    "volume_confirmation",
                  ],
                ],
                ["funding", t("Funding"), Layers, ["funding_dislocation"]],
                [
                  "divergence",
                  t("Venue divergence"),
                  GitBranch,
                  ["cross_venue_divergence", "spot_perp_basis"],
                ],
              ] as const
            ).map(([key, label, Icon, types]) => {
              const state = evaluation?.[key];
              const triggered = signals.some((signal) =>
                (types as readonly string[]).includes(signal.type),
              );
              const status = feed.loading
                ? t("Evaluating…")
                : feed.error
                  ? t("Evaluation unavailable")
                  : !feed.data
                    ? t("Not evaluated")
                    : triggered
                      ? t("Threshold crossed")
                      : state === "evaluated"
                        ? t("Within thresholds")
                        : state === "stale"
                          ? t("Stale reading")
                          : state === "unsupported"
                            ? t("Not supported for this asset")
                            : t("Feed unavailable");
              return (
                <article key={key}>
                  <Icon size={22} strokeWidth={1.5} aria-hidden />
                  <div>
                    <h3>{label}</h3>
                    <p>{status}</p>
                  </div>
                </article>
              );
            })}
          </div>
          {feed.data?.warnings.map((warning) => (
            <p className="r-note" key={warning}>
              {warning}
            </p>
          ))}
          <Timestamp
            at={evaluation?.generatedAt ?? feed.data?.asOf}
            label={t("Evaluated")}
          />
        </>
      )}
      <p className="r-footnote">
        {t("Strength reflects agreement across independent data.")}
        <br />
        {t("Observations, not recommendations.")}
      </p>
      <Dialog open={criteria} onOpenChange={setCriteria}>
        <DialogContent className="research-dialog">
          <DialogHeader>
            <DialogTitle>{t("Signal criteria")}</DialogTitle>
            <DialogDescription>
              {t("The thresholds used by Elyra’s existing observation engine.")}
            </DialogDescription>
          </DialogHeader>
          <div className="r-dialog-body">
            <dl className="r-definition">
              <dt>{t("Price movement")}</dt>
              <dd>{t("Absolute 24h change ≥ {priceChangePct}%.", { priceChangePct: SIGNAL_CRITERIA.priceChangePct })}</dd>
              <dt>{t("Funding")}</dt>
              <dd>
                {t("Absolute annualised funding ≥ {fundingPct}%.", { fundingPct: SIGNAL_CRITERIA.fundingPct })}
              </dd>
              <dt>{t("Venue divergence")}</dt>
              <dd>
                {t("On-chain and centralised prices differ by ≥ {divergenceBps} bps. Requires both feeds; supported on-chain assets only.", { divergenceBps: SIGNAL_CRITERIA.divergenceBps })}
              </dd>
              <dt>{t("Strength")}</dt>
              <dd>
                {t("Price and divergence observations need at least two venue readings for medium or high strength. Magnitude ≥ 5 without contradictions can be high; ≥ 2 can be medium. Readings older than five minutes cap strength at low. Funding dislocations are medium when fresh. Crowded funding above {crowdedFundingPct}% in the direction of a price move is a contradiction.", { crowdedFundingPct: SIGNAL_CRITERIA.crowdedFundingPct })}
              </dd>
            </dl>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
