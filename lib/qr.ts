import encodeQR from "qr";

/* ---------------------------------------------------------------------------
   A QR code as an SVG path, for a receiving address.

   `qr` produces the module matrix; drawing it is ours, so the code takes the
   brand's tokens through `currentColor` like any other icon and stays sharp
   at every size. Medium error correction: an address is short enough that
   the larger symbol costs nothing, and a phone camera aimed at a screen
   reads it more reliably.
--------------------------------------------------------------------------- */

/** The light margin a reader needs around the symbol, in modules (ISO/IEC 18004 asks for 4). */
export const QUIET_ZONE = 4;

/** Dark modules, true where a reader should see ink, the quiet zone included. */
export function qrModules(text: string): boolean[][] {
  return encodeQR(text, "raw", { ecc: "medium", border: QUIET_ZONE });
}

/**
 * One path for every dark module, merged into horizontal runs. A 41×41
 * symbol is a few hundred segments rather than a thousand separate rects.
 */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join("");
}
