/* ---------------------------------------------------------------------------
   Display precision.

   The old mock carried a `pricePrecision` per asset because it knew all eight
   of them. Pyth carries about 1,700, spanning eight orders of magnitude —
   BONK trades near $0.00001 and BRK.A near $700,000 — so precision is derived
   from the number rather than stored against the asset.

   Chosen so a price keeps roughly five significant figures without a wall of
   zeroes: the point is that a move is visible, and two decimals on a $0.00001
   token shows no move at all.
--------------------------------------------------------------------------- */

/** Decimal places to render a price at. */
export function priceDecimals(price: number | null | undefined): number {
  if (price === null || price === undefined || !Number.isFinite(price)) return 2;

  const magnitude = Math.abs(price);
  if (magnitude === 0) return 2;
  if (magnitude >= 1_000) return 2;
  if (magnitude >= 1) return 4;
  if (magnitude >= 0.01) return 5;
  if (magnitude >= 0.0001) return 6;
  /* Below a hundredth of a cent the decimals follow the first significant
     digit, so three always show: PEPE near $0.0000042 renders 0.00000421,
     and a smaller token gets more places rather than rounding to zero.
     `toLocaleString` never switches to exponent notation, so a price can
     never surface as 4.21e-6 either. */
  const leadingZeros = Math.floor(-Math.log10(magnitude));
  return Math.min(Math.max(8, leadingZeros + 3), 14);
}
