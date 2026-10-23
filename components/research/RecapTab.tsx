"use client";

import { useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { CoinMark } from "@/components/ui/CoinMark";
import type { MarketRecap } from "@/lib/research/recap";
import {
  Choices,
  dollars,
  Loading,
  percentage,
  Problem,
  SignIn,
  Timestamp,
  useResearchResource,
} from "./shared";

export function RecapTab({ active }: { active: boolean }) {
  const auth = useElyraAuth();
  const [scope, setScope] = useState<"crypto" | "equities">("crypto");
  const feed = useResearchResource<MarketRecap>(
    `/api/research/recap?scope=${scope}`,
    active && auth.authenticated,
  );
  const overview = feed.data?.sections.find(
    (section) => section.title === (scope === "crypto" ? "Crypto" : "Equities"),
  );
  const funding = feed.data?.sections.find(
    (section) => section.title === "Perpetual funding",
  );
  const prediction = feed.data?.sections.find(
    (section) => section.title === "Prediction markets",
  );
  return (
    <div>
      <div className="r-toolbar">
        <Choices
          label="Recap scope"
          value={scope}
          options={[
            { value: "crypto", label: "Crypto" },
            { value: "equities", label: "Equities" },
          ]}
          onChange={setScope}
        />
        <button
          type="button"
          className="r-button"
          onClick={feed.reload}
          disabled={feed.loading || !auth.authenticated}
        >
          Refresh
        </button>
      </div>
      {!auth.authenticated ? (
        <SignIn />
      ) : (
        <>
          {feed.loading && !feed.data && <Loading>Reading markets…</Loading>}
          {feed.error && <Problem retry={feed.reload}>{feed.error}</Problem>}
          {overview &&
            (overview.unavailable ? (
              <Problem retry={feed.reload}>{overview.unavailable}</Problem>
            ) : (
              <>
                <div className="r-recap-assets">
                  {["SOL", "ETH", "BTC"].map((symbol) => {
                    const move = overview.moves?.find(
                      (item) => item.symbol === symbol,
                    );
                    return (
                      <article key={symbol} className="r-asset">
                        <CoinMark symbol={symbol} size={30} />
                        <div>
                          <p className="r-note">{symbol}</p>
                          <div className="r-asset-price">
                            <strong>{move ? dollars(move.price) : "—"}</strong>
                            {move && (
                              <span
                                className={
                                  move.changePct >= 0
                                    ? "r-positive"
                                    : "r-negative"
                                }
                              >
                                {move.changePct >= 0 ? "+" : ""}
                                {percentage(move.changePct, 1)}{" "}
                                <small>24h</small>
                              </span>
                            )}
                          </div>
                          {move?.stale && (
                            <small>Cached reading · may be stale</small>
                          )}
                          {move ? (
                            <Timestamp at={move.asOf} />
                          ) : (
                            <small>Price unavailable</small>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {overview.lines
                  .filter((line) => line.startsWith("No move"))
                  .map((line) => (
                    <p key={line} className="r-note">
                      {line.replace("over the window", "over 24h")}
                    </p>
                  ))}
              </>
            ))}
          {scope === "crypto" && feed.data && (
            <div className="r-split r-recap-sections">
              <section>
                <h2>Perpetual funding</h2>
                {funding?.stale && (
                  <p className="r-note">
                    Cached funding reading · may be stale.
                  </p>
                )}
                {funding?.unavailable ? (
                  <Problem retry={feed.reload}>{funding.unavailable}</Problem>
                ) : funding?.funding ? (
                  <>
                    <div className="r-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Asset</th>
                            <th scope="col" className="r-number">
                              Annualised
                            </th>
                            <th scope="col">Direction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {funding.funding.map((row) => (
                            <tr key={row.symbol}>
                              <td>{row.symbol}</td>
                              <td className="r-number">
                                {percentage(row.annualisedPct, 1)}
                              </td>
                              <td>
                                {row.annualisedPct > 0
                                  ? "Longs pay shorts"
                                  : row.annualisedPct < 0
                                    ? "Shorts pay longs"
                                    : "No payment"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Timestamp at={funding.asOf} label="Hyperliquid ·" />
                  </>
                ) : (
                  <Problem retry={feed.reload}>
                    Funding details are unavailable.
                  </Problem>
                )}
              </section>
              <section>
                <h2>Prediction markets</h2>
                {prediction?.stale && (
                  <p className="r-note">Cached market prices · may be stale.</p>
                )}
                {prediction?.unavailable ? (
                  <Problem retry={feed.reload}>
                    {prediction.unavailable}
                  </Problem>
                ) : prediction?.markets ? (
                  <>
                    <div className="r-prediction-recap">
                      {prediction.markets.map((market) => (
                        <article key={market.id}>
                          <div className="r-section-heading">
                            <p>
                              {market.url ? (
                                <a
                                  href={market.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {market.question} ↗
                                </a>
                              ) : (
                                market.question
                              )}
                            </p>
                            <span className="r-probability">
                              {market.outcome ?? "Unlabelled outcome"} ·{" "}
                              {market.price === null
                                ? "—"
                                : percentage(market.price * 100, 0)}
                            </span>
                          </div>
                          <small>
                            {market.status === "open"
                              ? "Active · implied market probability"
                              : `${market.status} · last market price`}
                          </small>
                        </article>
                      ))}
                    </div>
                    <Timestamp at={prediction.asOf} label="Polymarket ·" />
                  </>
                ) : (
                  <Problem retry={feed.reload}>
                    Prediction-market details are unavailable.
                  </Problem>
                )}
              </section>
            </div>
          )}
          {feed.data && (
            <p className="r-footnote">
              <Timestamp at={feed.data.generatedAt} label="Recap assembled" /> ·
              Market prices, not predictions.
            </p>
          )}
        </>
      )}
    </div>
  );
}
