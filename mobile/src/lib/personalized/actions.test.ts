import type { PreparedAction } from "@/lib/personalized/types";
import { postForOutcome } from "~/lib/api";
import {
  matchingSwapInputs,
  revalidateSwap,
  sameReview,
} from "~/lib/personalized/actions";
jest.mock("~/lib/api", () => ({ postForOutcome: jest.fn() }));
const post = postForOutcome as jest.Mock;
const action: PreparedAction = {
  id: "a1",
  kind: "swap",
  summary: "Swap 1 SOL to USDC",
  fields: [{ label: "Amount", value: "1 SOL", derived: true }],
  warnings: [],
  reason: null,
  readiness: "ready",
  preparedAt: "2026-10-23T00:00:00Z",
  params: { symbol: "SOL", toSymbol: "USDC", quantity: 1 },
};
it("blocks a quote for inputs the fresh snapshot clamped or changed", () => {
  expect(matchingSwapInputs(action, "SOL", "USDC", "1000000")).toBe(false);
  expect(matchingSwapInputs(action, "SOL", "USDC", "1.000")).toBe(true);
  expect(matchingSwapInputs(action, "SOL", "BTC", "1")).toBe(false);
  expect(
    matchingSwapInputs(
      { ...action, readiness: "rejected" },
      "SOL",
      "USDC",
      "1",
    ),
  ).toBe(false);
});
it("calls the fresh-snapshot confirmation boundary with the actual edited inputs", async () => {
  post.mockResolvedValueOnce({
    ok: true,
    body: { action, signingRequired: true },
  });
  await revalidateSwap("SOL", "USDC", "1");
  expect(post).toHaveBeenCalledWith("/api/personalized/actions/confirm", {
    kind: "swap",
    symbol: "SOL",
    toSymbol: "USDC",
    quantity: 1,
  });
});
it("keeps a rejected action and reason from HTTP 409 available to the review screen", async () => {
  post.mockResolvedValueOnce({
    ok: false,
    status: 409,
    body: {
      action: {
        ...action,
        readiness: "rejected",
        reason: "Insufficient balance",
      },
      error: "Balance changed",
    },
  });
  expect((await revalidateSwap("SOL", "USDC", "1")).action?.readiness).toBe(
    "rejected",
  );
});
it("fails closed when account state cannot be read", async () => {
  post.mockResolvedValueOnce({
    ok: false,
    status: 503,
    body: { error: "Account unavailable" },
  });
  await expect(revalidateSwap("SOL", "USDC", "1")).rejects.toThrow(
    "Account unavailable",
  );
});
it("requires new review for changed fields, warnings, readiness or amounts, while ignoring timestamps", () => {
  expect(
    sameReview(action, { ...action, id: "new", preparedAt: "later" }),
  ).toBe(true);
  expect(
    sameReview(action, {
      ...action,
      fields: [{ label: "Amount", value: "0.5 SOL", derived: true }],
    }),
  ).toBe(false);
  expect(
    sameReview(action, { ...action, warnings: ["Above concentration limit"] }),
  ).toBe(false);
  expect(sameReview(action, { ...action, readiness: "rejected" })).toBe(false);
  expect(
    sameReview(action, {
      ...action,
      params: { ...action.params, quantity: 2 },
    }),
  ).toBe(false);
});
