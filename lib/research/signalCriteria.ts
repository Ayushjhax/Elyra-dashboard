/** Shared with the existing engine; these are observation thresholds, not forecasts. */
export const SIGNAL_CRITERIA = {
  priceChangePct: 2,
  fundingPct: 25,
  crowdedFundingPct: 10,
  divergenceBps: 30,
  staleMs: 5 * 60_000,
} as const;
