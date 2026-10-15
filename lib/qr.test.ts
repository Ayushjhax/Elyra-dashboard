import decodeQR from "qr/decode.js";
import { describe, expect, it } from "vitest";
import { QUIET_ZONE, qrModules, qrPath } from "@/lib/qr";

/** Paints the matrix as a reader would see it on screen: dark ink on a light ground. */
function render(modules: boolean[][], scale = 6) {
  const size = modules.length * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (y * scale + dy) * size + x * scale + dx;
          data.fill(0, px * 4, px * 4 + 3);
        }
      }
    }),
  );
  return { width: size, height: size, data };
}

describe("qr", () => {
  it("encodes an address a camera reads back exactly", () => {
    /* The USDC mint: a real 44-character address, the longest a Solana key gets. */
    const address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const modules = qrModules(address);
    expect(decodeQR(render(modules))).toBe(address);
    /* The quiet zone is part of the symbol: its outer ring is light. */
    expect(modules.slice(0, QUIET_ZONE).flat().some(Boolean)).toBe(false);
  });

  it("draws each run of dark modules once", () => {
    const path = qrPath([
      [true, true, false],
      [false, false, true],
    ]);
    expect(path).toBe("M0 0h2v1h-2zM2 1h1v1h-1z");
  });
});
