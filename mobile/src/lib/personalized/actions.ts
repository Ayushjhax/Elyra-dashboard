import type { PreparedAction } from "@/lib/personalized/types";
import { swapPrefill } from "@/lib/actions/prefill";
import { postForOutcome } from "~/lib/api";
export interface Revalidation {
  action?: PreparedAction;
  signingRequired?: boolean;
  error?: string;
}
export function matchingSwapInputs(
  action: PreparedAction,
  from: string,
  to: string,
  amount: string,
) {
  const resolved = swapPrefill(action);
  return (
    resolved !== null &&
    resolved.from === from &&
    resolved.to === to &&
    Number(resolved.amount) === Number(amount)
  );
}
export async function revalidateSwap(
  from: string,
  to: string,
  amount: string,
): Promise<Revalidation> {
  const quantity = Number(amount);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("Enter a positive swap amount.");
  const result = await postForOutcome<Revalidation>(
    "/api/personalized/actions/confirm",
    { kind: "swap", symbol: from, toSymbol: to, quantity },
  );
  if (!result.body.action)
    throw new Error(
      result.body.error ?? "Your account could not be re-validated.",
    );
  return result.body;
}
// Ignore generated ids and timestamps; compare everything the person reviewed.
export function sameReview(a: PreparedAction, b: PreparedAction) {
  return (
    JSON.stringify([
      a.kind,
      a.readiness,
      a.reason,
      a.summary,
      a.fields,
      a.warnings,
      a.params,
    ]) ===
    JSON.stringify([
      b.kind,
      b.readiness,
      b.reason,
      b.summary,
      b.fields,
      b.warnings,
      b.params,
    ])
  );
}
