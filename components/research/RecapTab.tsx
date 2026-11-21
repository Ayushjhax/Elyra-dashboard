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
import { useT } from "@/lib/i18n/client";

export function RecapTab({ active }: { active: boolean }) {
  const t = useT();
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
          label={t("Recap scope")}
          value={scope}
          options={[
            { value: "crypto", label: t("Crypto") },
            { value: "equities", label: t("Equities") },
          ]}
          onChange={setScope}
        />
        <button
          type="button"
          className="r-button"
          onClick={feed.reload}
          disabled={feed.loading || !auth.authenticated}
        >
          {t("Refresh")}
        </button>
      </div>
      {!auth.authenticated ? (
        <SignIn />
      ) : (
        <>
          {feed.loading && !feed.data && <Loading>{t("Reading markets…")}</Loading>}
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
                            <small>{t("Cached reading · may be stale")}</small>
                          )}
                          {move ? (
                            <Timestamp at={move.asOf} />
                          ) : (
                            <small>{t("Price unavailable")}</small>
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
                <h2>{t("Perpetual funding")}</h2>
                {funding?.stale && (
                  <p className="r-note">
                    {t("Cached funding reading · may be stale.")}
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
                            <th scope="col">{t("Asset")}</th>
                            <th scope="col" className="r-number">
                              {t("Annualised")}
                            </th>
                            <th scope="col">{t("Direction")}</th>
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
                                  ? t("Longs pay shorts")
                                  : row.annualisedPct < 0
                                    ? t("Shorts pay longs")
                                    : t("No payment")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Timestamp at={funding.asOf} label={t("Hyperliquid ·")} />
                  </>
                ) : (
                  <Problem retry={feed.reload}>
                    {t("Funding details are unavailable.")}
                  </Problem>
                )}
              </section>
              <section>
                <h2>{t("Prediction markets")}</h2>
                {prediction?.stale && (
                  <p className="r-note">{t("Cached market prices · may be stale.")}</p>
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
                              {market.outcome ?? t("Unlabelled outcome")} ·{" "}
                              {market.price === null
                                ? "—"
                                : percentage(market.price * 100, 0)}
                            </span>
                          </div>
                          <small>
                            {market.status === "open"
                              ? t("Active · implied market probability")
                              : t("{status} · last market price", { status: market.status })}
                          </small>
                        </article>
                      ))}
                    </div>
                    <Timestamp at={prediction.asOf} label={t("Polymarket ·")} />
                  </>
                ) : (
                  <Problem retry={feed.reload}>
                    {t("Prediction-market details are unavailable.")}
                  </Problem>
                )}
              </section>
            </div>
          )}
          {feed.data && (
            <p className="r-footnote">
              <Timestamp at={feed.data.generatedAt} label={t("Recap assembled")} />{" "}{t("· Market prices, not predictions.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
