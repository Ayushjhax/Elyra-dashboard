import type { OpenAction } from "@/lib/actions/types";

/* ---------------------------------------------------------------------------
   What a prepared action prefills — the pure half of
   lib/actions/useOpenActions.ts, shared with the Android app, so the website's
   review card and the app's open the swap with the same numbers.
--------------------------------------------------------------------------- */

/**
 * The swap a prepared action describes, for the dialog's prefill.
 *
 * Structured `params` where the action carries them; otherwise read back from
 * the fields a person was shown, which every stored swap has had.
 */
export function swapPrefill(
  action: OpenAction["action"],
): { from: string; to: string; amount: string } | null {
  if (action.kind !== "swap" || action.readiness !== "ready") return null;
  const field = (label: string) => action.fields.find((entry) => entry.label === label)?.value;

  const from = action.params?.symbol ?? field("Asset");
  const to = action.params?.toSymbol ?? field("To");
  const quantity =
    action.params?.quantity ??
    Number.parseFloat((field("Amount") ?? "").replace(/,/g, "").split(" ")[0] ?? "");

  if (!from || !to || !Number.isFinite(quantity) || quantity <= 0) return null;
  /* Plain decimal, never exponent notation — the dialog's input is text. */
  const amount = quantity.toFixed(9).replace(/\.?0+$/, "");
  return { from, to, amount };
}
