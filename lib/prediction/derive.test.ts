import { describe, expect, it } from "vitest";
import {
  candidatesFor,
  depositWalletAddress,
  legacyDepositWalletAddress,
  safeWalletAddress,
} from "@/lib/prediction/derive";

/* ---------------------------------------------------------------------------
   Every pair below is a real Polymarket account wallet on Polygon and the
   signer that owns it, read from the chain — not computed by the code under
   test. Safe owners come from the Safe's own getOwners(); a deposit wallet's
   signer is the walletId appended to its deployed code. A derivation that
   drifts from what Polymarket actually deploys fails here, before it can
   attach a stranger's account to someone's portfolio.
--------------------------------------------------------------------------- */

const SAFES: Array<[signer: `0x${string}`, wallet: string]> = [
  ["0xb903bc50607ecf844f2082038c9519d8a06575aa", "0x03b4792ed953aff5db1c51737e7db64294dc8706"],
  ["0xf6e9ba40b4730d94c4dbfdeb81538755c53eaee8", "0x0629ad7753ba6a7bf22dc816df228e92364c501d"],
];

/** Created after the 29 June 2026 upgrade: beacon proxies. */
const DEPOSIT_WALLETS: Array<[signer: `0x${string}`, wallet: string]> = [
  ["0x999a46dc387e1ae9e5578bb86b74fbfd4fea4bdc", "0x000933254969671e0ebebed369e6c20266dcabf2"],
  ["0xa87ce4ec6ba4a55c3e20321c90888a0c948e2c01", "0x0172d9aea5b523c33955c0e9841d9a6af82d4e84"],
];

/** Created 4 May – 29 June 2026: UUPS proxies. */
const LEGACY_DEPOSIT_WALLETS: Array<[signer: `0x${string}`, wallet: string]> = [
  ["0x8b949db1f68a431290c49b483cb9365b08358988", "0x005ed998fcb786679eb8bfd0d20c15c0903d6d8e"],
  ["0x325b7ff1160f2b9b9bbb04dd5cafee979f56daca", "0x093a9cec16ae977ca3362582bf99930ee8d746d2"],
];

describe("Polymarket account wallets", () => {
  it.each(SAFES)("derives the Safe owned by %s", (signer, wallet) => {
    expect(safeWalletAddress(signer)).toBe(wallet);
  });

  it.each(DEPOSIT_WALLETS)("derives the deposit wallet of %s", (signer, wallet) => {
    expect(depositWalletAddress(signer)).toBe(wallet);
  });

  it.each(LEGACY_DEPOSIT_WALLETS)("derives the pre-upgrade deposit wallet of %s", (signer, wallet) => {
    expect(legacyDepositWalletAddress(signer)).toBe(wallet);
  });

  it("offers every kind of wallet as a candidate, the real one among them", () => {
    for (const [signer, wallet] of [...SAFES, ...DEPOSIT_WALLETS, ...LEGACY_DEPOSIT_WALLETS]) {
      const rows = candidatesFor(signer);
      expect(rows.map((row) => row.kind)).toEqual(["proxy", "safe", "deposit", "deposit", "signer"]);
      expect(rows.some((row) => row.address === wallet)).toBe(true);
    }
  });

  it("derives the same wallets however the signer is cased", () => {
    const [signer] = DEPOSIT_WALLETS[0];
    expect(candidatesFor(signer.toUpperCase().replace("0X", "0x"))).toEqual(candidatesFor(signer));
  });
});
