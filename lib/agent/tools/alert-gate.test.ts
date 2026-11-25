import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The agent's only write tools — creating and deleting a prediction alert —
   run only on the operator's own words. A market description or a token
   name can make the model CALL the tool; it cannot make the tool act.
--------------------------------------------------------------------------- */

const writes = vi.hoisted(() => ({ created: 0, deleted: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prediction/alerts", () => ({
  createPredictionAlert: async () => {
    writes.created += 1;
    return "alert-1";
  },
  deletePredictionAlert: async () => {
    writes.deleted += 1;
    return true;
  },
  listPredictionAlerts: async () => [],
  parsePredictionAlert: () => ({ kind: "price_above", threshold: 0.65 }),
}));
vi.mock("@/lib/prediction/signals", () => ({
  resolveMarket: async () => ({ market: { id: "m1", question: "Will it rain?" }, tokens: [{ tokenId: "t1", label: "Yes" }] }),
  buildSignal: vi.fn(),
  liveMarket: vi.fn(),
}));

const { predictionCreateAlert, predictionDeleteAlert } = await import("@/lib/agent/tools/prediction-signals");

const context = (operatorMessage: string | undefined) => ({
  userId: "user-1",
  sessionWallet: null,
  solanaAddress: null,
  polymarketAddress: null,
  operatorMessage,
});

beforeEach(() => {
  writes.created = 0;
  writes.deleted = 0;
});

describe("the alert tools", () => {
  it("create an alert when the operator asked for one", async () => {
    const result = await predictionCreateAlert.execute({ market: "rain", condition: "above 65" }, context("Alert me if rain goes above 65"));
    expect(result).toMatchObject({ alertId: "alert-1" });
    expect(writes.created).toBe(1);
  });

  it("create nothing when the request came from a tool result rather than the operator", async () => {
    /* The operator asked a question; an injected market description told the
       model to set an alert. */
    const result = await predictionCreateAlert.execute({ market: "rain", condition: "above 65" }, context("What is the rain market at?"));
    expect(result).toMatchObject({ error: expect.stringMatching(/did not ask/) });
    expect(writes.created).toBe(0);
  });

  it("delete nothing unless the operator asked to remove an alert, and nothing for an outside agent", async () => {
    expect(await predictionDeleteAlert.execute({ alertId: "a1" }, context("Summarise my alerts"))).toMatchObject({ error: expect.stringMatching(/did not ask/) });
    expect(await predictionDeleteAlert.execute({ alertId: "a1" }, context(undefined))).toMatchObject({ error: expect.stringMatching(/did not ask/) });
    expect(writes.deleted).toBe(0);
    expect(await predictionDeleteAlert.execute({ alertId: "a1" }, context("delete the rain alert"))).toMatchObject({ deleted: true });
    expect(writes.deleted).toBe(1);
  });
});
