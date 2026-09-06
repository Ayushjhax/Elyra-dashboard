import { z } from "zod";

const participantSchema = z.object({
  wallet: z.string().min(1), side: z.string().min(1), score: z.number(), archetype: z.string().min(1),
  magnitudeUsd: z.string(), quantityDelta: z.string(), vwapEntryUsd: z.string().nullable(),
  performance: z.object({ realizedPnlUsd: z.string(), roiPct: z.string(), winRatePct: z.string(), tradeCount: z.number(), archetype: z.string(), score: z.number(), historyStatus: z.string(), basisIncomplete: z.boolean() }).passthrough(),
});

export const trackerSignalSchema = z.object({
  id: z.string().min(1), source: z.string().min(1), marketId: z.string().min(1), symbol: z.string().min(1), side: z.string().min(1),
  window: z.string().min(1), walletCount: z.number().int().nonnegative(), weightedScore: z.number(), archetypeCount: z.number().int().nonnegative(),
  vwapEntryUsd: z.string().nullable(), currentPxUsd: z.string().nullable(), participants: z.array(participantSchema),
  qualifies: z.boolean(), rejectionReasons: z.array(z.string()), createdAt: z.string(), status: z.string(), supersededBy: z.string().nullable(), confirmation: z.unknown().nullable(),
}).passthrough();
export type TrackerSignal = z.infer<typeof trackerSignalSchema>;
export const trackerSignalListSchema = z.object({ signals: z.array(trackerSignalSchema), count: z.number(), disclaimer: z.string(), generatedAt: z.string() }).passthrough();
export type TrackerSignalList = z.infer<typeof trackerSignalListSchema>;

export function parseTrackerSignalList(value: unknown): TrackerSignalList {
  return trackerSignalListSchema.parse(value);
}
