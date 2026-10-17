import "server-only";

import { getProxyWalletAddress } from "@polymarket/sdk";
import { concat, encodeAbiParameters, getCreate2Address, keccak256, pad, size, toHex, type Hex } from "viem";

/* ---------------------------------------------------------------------------
   Finding a user's prediction-market account from the wallet they signed in
   with, so nobody has to paste an address.

   ── Why this is a search rather than a calculation ─────────────────────

   Polymarket holds positions in a contract wallet, and which KIND depends on
   how and when the account was made:

     Proxy wallet    email / Google login, via the Polymarket Proxy Factory
     Safe wallet     an external signer such as MetaMask, via the Safe factory
     Deposit wallet  every account from 4 May 2026: a UUPS proxy until the
                     29 June 2026 upgrade, a beacon proxy after it
     the EOA itself  for someone who never used the app's own onboarding

   Each derives differently from the same signer. So this produces every
   CANDIDATE and the caller checks each against live data. An address that
   reports real positions is the account; one that reports nothing is
   discarded.

   ── Why a wrong guess must never be stored silently ────────────────────

   Every candidate below is a real, valid address. If the wrong one were
   linked, the product would not error — it would attach a stranger's
   positions to this user's portfolio and report them as theirs. That is why
   derivation feeds a verification step instead of writing straight through.

   ── Where each constant comes from ─────────────────────────────────────

   Factory and beacon addresses are from Polymarket's published contract list
   (docs.polymarket.com/resources/contracts), and the deposit-wallet algorithm
   from their wallet docs (/trading/wallets-auth, "Derive a Deposit Wallet
   Address"). The two values the docs do not print — the Safe init-code hash
   and the implementation the pre-upgrade deposit wallets were created with —
   were read from live Polygon wallets. Every formula here was checked against
   real wallets before it was written down (19 Safes, 24 UUPS and 64 beacon
   deposit wallets, all matching), and derive.test.ts pins a pair of each.
--------------------------------------------------------------------------- */

/** Polymarket Proxy Factory — accounts created through email or Google login. */
const PROXY_FACTORY = "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052";

/** Polymarket's Gnosis Safe factory — accounts created with a browser wallet. */
const SAFE_FACTORY = "0xaacfeea03eb1561c4e67d661e40682bd20e3541b";

/** keccak256 of the Safe proxy's creation code, as the Safe factory deploys it. */
const SAFE_INIT_CODE_HASH = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";

/** The Deposit Wallet factory and beacon. */
const DEPOSIT_FACTORY = "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07";
const DEPOSIT_BEACON = "0x7A18EDfe055488A3128f01F563e5B479D92ffc3a";

/**
 * The implementation every pre-upgrade (UUPS) deposit wallet was created
 * with. It is part of the creation code, so it is part of the address.
 */
const DEPOSIT_UUPS_IMPLEMENTATION = "0x58ca52ebe0dadfdf531cde7062e76746de4db1eb";

export type CandidateKind = "proxy" | "safe" | "deposit" | "signer";

export interface AddressCandidate {
  address: string;
  kind: CandidateKind;
  /** Shown to the operator so an auto-detected link is explicable. */
  label: string;
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/** A Safe wallet: CREATE2 from the Safe factory, salted with the owner. */
export function safeWalletAddress(signer: Hex): string {
  return getCreate2Address({
    from: SAFE_FACTORY,
    salt: keccak256(encodeAbiParameters([{ type: "address" }], [signer])),
    bytecodeHash: SAFE_INIT_CODE_HASH,
  }).toLowerCase();
}

/**
 * The immutable args every deposit wallet is created with, and salted by:
 * `abi.encode(factory, walletId)`, where walletId is the signer left-padded
 * to 32 bytes.
 */
function depositArgs(signer: Hex): Hex {
  return encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [DEPOSIT_FACTORY, pad(signer, { size: 32 })]);
}

/* The creation code of Solady's LibClone proxies, laid out exactly as
   `initCodeERC1967BeaconProxy(beacon, args)` and `initCodeERC1967(
   implementation, args)` build it: a constructor, the runtime, then the
   args. The leading PUSH2 carries the runtime's length, args included. */

function beaconProxyInitCode(beacon: Hex, args: Hex): Hex {
  return concat([
    "0x61",
    toHex(0x52 + size(args), { size: 2 }),
    "0x3d8160233d3973",
    beacon,
    "0x60195155f3363d3d373d3d363d602036600436635c60da",
    "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c",
    "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3",
    args,
  ]);
}

function erc1967ProxyInitCode(implementation: Hex, args: Hex): Hex {
  return concat([
    "0x61",
    toHex(0x3d + size(args), { size: 2 }),
    "0x3d8160233d3973",
    implementation,
    "0x6009",
    "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076",
    "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3",
    args,
  ]);
}

/** A deposit wallet created after the 29 June 2026 upgrade: a beacon proxy. */
export function depositWalletAddress(signer: Hex): string {
  const args = depositArgs(signer);
  return getCreate2Address({
    from: DEPOSIT_FACTORY,
    salt: keccak256(args),
    bytecodeHash: keccak256(beaconProxyInitCode(DEPOSIT_BEACON, args)),
  }).toLowerCase();
}

/** A deposit wallet created 4 May – 29 June 2026: a UUPS proxy. */
export function legacyDepositWalletAddress(signer: Hex): string {
  const args = depositArgs(signer);
  return getCreate2Address({
    from: DEPOSIT_FACTORY,
    salt: keccak256(args),
    bytecodeHash: keccak256(erc1967ProxyInitCode(DEPOSIT_UUPS_IMPLEMENTATION, args)),
  }).toLowerCase();
}

/**
 * Addresses worth checking for a given signer.
 *
 * Every kind of account wallet Polymarket has made, then the signer itself,
 * because a wallet that traded directly holds its positions at its own
 * address. All of them are checked; the order is only the order they are
 * listed in when more than one turns out to hold something.
 */
export function candidatesFor(signer: string): AddressCandidate[] {
  /* Lower-cased before anything else. The derivation library validates the
     EIP-55 checksum and THROWS on a mixed-case address that does not match —
     so a checksummed address from one source and a pasted lower-case one from
     another would silently produce different candidate sets for the same
     wallet. An all-lower-case address carries no checksum to fail, which
     makes the derivation stable however the address arrived. */
  const eoa = signer.trim().toLowerCase();
  if (!isEvmAddress(eoa)) return [];

  const candidates: AddressCandidate[] = [];
  const signerHex = eoa as Hex;

  /* Each derivation stands alone: one that throws must not take the others,
     or the signer candidate and the paste path, with it. */
  const derive = (kind: CandidateKind, label: string, run: () => string) => {
    try {
      const address = run();
      if (isEvmAddress(address)) candidates.push({ address: address.toLowerCase(), kind, label });
    } catch {
      /* Not fatal — see above. */
    }
  };

  derive("proxy", "Polymarket proxy wallet, for an email or Google sign-in", () =>
    String(getProxyWalletAddress(PROXY_FACTORY, signerHex)),
  );
  derive("safe", "Polymarket Safe wallet, for a browser-wallet sign-in", () => safeWalletAddress(signerHex));
  derive("deposit", "Polymarket deposit wallet, for an account made after 29 June 2026", () =>
    depositWalletAddress(signerHex),
  );
  derive("deposit", "Polymarket deposit wallet, for an account made 4 May – 29 June 2026", () =>
    legacyDepositWalletAddress(signerHex),
  );

  candidates.push({
    address: eoa.toLowerCase(),
    kind: "signer",
    label: "Your connected wallet, if you traded from it directly",
  });

  /* Deduplicated: a signer that IS its own proxy would otherwise be checked
     twice and reported as two findings. */
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.address)) return false;
    seen.add(candidate.address);
    return true;
  });
}

export { DEPOSIT_FACTORY, PROXY_FACTORY, SAFE_FACTORY };
