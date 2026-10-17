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

type SignalFeed = {
  signals: MarketSignal[];
  asOf: string;
  warnings: string[];
  evaluation?: SignalEvaluation;
};
export function SignalsTab({ active }: { active: boolean }) {
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
          label="Signal asset"
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
            Criteria
          </button>
          <button
            type="button"
            className="r-button"
            aria-label="Refresh signals"
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
            <Loading>Evaluating price, funding and venue readings…</Loading>
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
                      ? "A quiet market is a signal, too."
                      : "Some market readings are unavailable."}
                  </h2>
                  <p>
                    {complete
                      ? `No price, funding, or venue divergence thresholds crossed for ${symbol}.`
                      : `No triggers were returned for ${symbol}. Incomplete or stale data cannot confirm a quiet market.`}
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
                  {signal.strength} strength · {signal.confirmationCount} venue
                  {signal.confirmationCount === 1 ? "" : "s"}
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
              <Timestamp at={signal.dataFreshness} label="Oldest reading" />
            </article>
          ))}
          <div className="r-summaries">
            {(
              [
                [
                  "price",
                  "Price movement",
                  TrendingUp,
                  [
                    "price_momentum",
                    "volatility_expansion",
                    "volume_confirmation",
                  ],
                ],
                ["funding", "Funding", Layers, ["funding_dislocation"]],
                [
                  "divergence",
                  "Venue divergence",
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
                ? "Evaluating…"
                : feed.error
                  ? "Evaluation unavailable"
                  : !feed.data
                    ? "Not evaluated"
                    : triggered
                      ? "Threshold crossed"
                      : state === "evaluated"
                        ? "Within thresholds"
                        : state === "stale"
                          ? "Stale reading"
                          : state === "unsupported"
                            ? "Not supported for this asset"
                            : "Feed unavailable";
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
            label="Evaluated"
          />
        </>
      )}
      <p className="r-footnote">
        Strength reflects agreement across independent data.
        <br />
        Observations, not recommendations.
      </p>
      <Dialog open={criteria} onOpenChange={setCriteria}>
        <DialogContent className="research-dialog">
          <DialogHeader>
            <DialogTitle>Signal criteria</DialogTitle>
            <DialogDescription>
              The thresholds used by Elyra’s existing observation engine.
            </DialogDescription>
          </DialogHeader>
          <div className="r-dialog-body">
            <dl className="r-definition">
              <dt>Price movement</dt>
              <dd>Absolute 24h change ≥ {SIGNAL_CRITERIA.priceChangePct}%.</dd>
              <dt>Funding</dt>
              <dd>
                Absolute annualised funding ≥ {SIGNAL_CRITERIA.fundingPct}%.
              </dd>
              <dt>Venue divergence</dt>
              <dd>
                On-chain and centralised prices differ by ≥{" "}
                {SIGNAL_CRITERIA.divergenceBps} bps. Requires both feeds;
                supported on-chain assets only.
              </dd>
              <dt>Strength</dt>
              <dd>
                Price and divergence observations need at least two venue
                readings for medium or high strength. Magnitude ≥ 5 without
                contradictions can be high; ≥ 2 can be medium. Readings older
                than five minutes cap strength at low. Funding dislocations are
                medium when fresh. Crowded funding above{" "}
                {SIGNAL_CRITERIA.crowdedFundingPct}% in the direction of a price
                move is a contradiction.
              </dd>
            </dl>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
