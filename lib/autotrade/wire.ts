import { concat, hexToBytes, keccak256, toHex } from "viem";
import { msgpack, type Packable } from "@/lib/autotrade/msgpack";

/* ---------------------------------------------------------------------------
   Hyperliquid's wire format, as pure functions: how a price and a size are
   written, how an order and its TP/SL are shaped, how an action is hashed,
   and the typed data a person signs to approve Elyra's trading key.

   Ported from the official Python SDK (hyperliquid/utils/signing.py) and held
   to its own test vectors in lib/autotrade/hyperliquid.test.ts. Key order in
   every object below is the SDK's: the hash covers it.
--------------------------------------------------------------------------- */

export type Network = "mainnet" | "testnet";

export const API_URL: Record<Network, string> = {
  mainnet: "https://api.hyperliquid.xyz",
  testnet: "https://api.hyperliquid-testnet.xyz",
};

/**
 * A number as Hyperliquid writes it: at most eight decimals, no trailing
 * zeros, never exponent notation. Like the SDK, it refuses a value that would
 * be changed by being written — an unrounded price must be rounded first, on
 * purpose, not silently on the way out.
 */
export function toWire(value: number | string): string {
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(number)) throw new RangeError(`Not a number: ${value}`);
  const fixed = number.toFixed(8);
  if (Math.abs(Number(fixed) - number) >= 1e-12) throw new RangeError(`Writing ${value} would round it.`);
  let normalised = fixed.replace(/\.?0+$/, "");
  if (normalised === "-0" || normalised === "") normalised = "0";
  return normalised;
}

/**
 * A perp price Hyperliquid accepts: five significant figures, and no more
 * than `6 - szDecimals` decimals. Integer prices are always valid.
 */
export function roundPerpPrice(price: number, szDecimals: number): string {
  if (!(price > 0)) throw new RangeError("A price must be positive.");
  const significant = Number(price.toPrecision(5));
  const decimals = Math.max(0, 6 - szDecimals);
  return toWire(Number(significant.toFixed(decimals)));
}

/** A size floored to the coin's size decimals — never rounded up past what was sized. */
export function floorSize(size: number, szDecimals: number): string | null {
  const factor = 10 ** szDecimals;
  const floored = Math.floor(size * factor + 1e-9) / factor;
  return floored > 0 ? toWire(Number(floored.toFixed(szDecimals))) : null;
}

export type Tif = "Gtc" | "Ioc" | "Alo";

export interface OrderWire {
  [key: string]: Packable | undefined;
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: Tif } } | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
  c?: string;
}

export function limitOrder(input: {
  asset: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly: boolean;
  tif: Tif;
  cloid?: string;
}): OrderWire {
  const wire: OrderWire = {
    a: input.asset,
    b: input.isBuy,
    p: toWire(input.price),
    s: toWire(input.size),
    r: input.reduceOnly,
    t: { limit: { tif: input.tif } },
  };
  if (input.cloid !== undefined) wire.c = input.cloid;
  return wire;
}

/** A take-profit or stop-loss: a reduce-only market trigger. */
export function triggerOrder(input: {
  asset: number;
  isBuy: boolean;
  triggerPrice: string;
  limitPrice: string;
  size: string;
  tpsl: "tp" | "sl";
  cloid?: string;
}): OrderWire {
  const wire: OrderWire = {
    a: input.asset,
    b: input.isBuy,
    p: toWire(input.limitPrice),
    s: toWire(input.size),
    r: true,
    t: { trigger: { isMarket: true, triggerPx: toWire(input.triggerPrice), tpsl: input.tpsl } },
  };
  if (input.cloid !== undefined) wire.c = input.cloid;
  return wire;
}

export type Grouping = "na" | "normalTpsl" | "positionTpsl";

export function orderAction(orders: OrderWire[], grouping: Grouping = "na"): Packable {
  return { type: "order", orders, grouping };
}

export function cancelByCloidAction(cancels: { asset: number; cloid: string }[]): Packable {
  return { type: "cancelByCloid", cancels: cancels.map((cancel) => ({ asset: cancel.asset, cloid: cancel.cloid })) };
}

export function updateLeverageAction(asset: number, leverage: number, isCross: boolean): Packable {
  return { type: "updateLeverage", asset, isCross, leverage };
}

/** keccak256(msgpack(action) ‖ nonce (u64 BE) ‖ vault flag [‖ vault] [‖ 0x00 ‖ expiresAfter]). */
export function actionHash(action: Packable, nonce: number, vault: string | null = null, expiresAfter: number | null = null): `0x${string}` {
  const parts: Uint8Array[] = [msgpack(action)];
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce));
  parts.push(nonceBytes);
  if (vault === null) parts.push(Uint8Array.of(0));
  else {
    parts.push(Uint8Array.of(1));
    parts.push(hexToBytes(vault as `0x${string}`));
  }
  if (expiresAfter !== null) {
    const expires = new Uint8Array(8);
    new DataView(expires.buffer).setBigUint64(0, BigInt(expiresAfter));
    parts.push(Uint8Array.of(0), expires);
  }
  return keccak256(concat(parts.map((part) => toHex(part))));
}

/** The EIP-712 message an agent signs for an L1 action. */
export function l1TypedData(hash: `0x${string}`, network: Network) {
  return {
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000" as const,
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent" as const,
    message: { source: network === "mainnet" ? "a" : "b", connectionId: hash },
  };
}

/* ---- approving Elyra's trading key: signed by the person, in their wallet ---- */

/** Arbitrum Sepolia: the signature chain the SDK uses; `hyperliquidChain` picks the network. */
export const SIGNATURE_CHAIN_ID = "0x66eee";

export const APPROVE_AGENT_TYPES = [
  { name: "hyperliquidChain", type: "string" },
  { name: "agentAddress", type: "address" },
  { name: "agentName", type: "string" },
  { name: "nonce", type: "uint64" },
] as const;

/** The name Hyperliquid shows for Elyra's key in the person's API wallet list. */
export const AGENT_NAME = "Elyra";

export interface ApproveAgentAction {
  [key: string]: Packable | undefined;
  type: "approveAgent";
  signatureChainId: string;
  hyperliquidChain: "Mainnet" | "Testnet";
  agentAddress: string;
  agentName: string;
  nonce: number;
}

export function approveAgentAction(agentAddress: string, nonce: number, network: Network): ApproveAgentAction {
  return {
    type: "approveAgent",
    signatureChainId: SIGNATURE_CHAIN_ID,
    hyperliquidChain: network === "mainnet" ? "Mainnet" : "Testnet",
    agentAddress,
    agentName: AGENT_NAME,
    nonce,
  };
}

/** What the person's wallet is asked to sign — shown by their wallet before they sign it. */
export function approveAgentTypedData(action: ApproveAgentAction) {
  return {
    domain: {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: Number.parseInt(action.signatureChainId, 16),
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      "HyperliquidTransaction:ApproveAgent": [...APPROVE_AGENT_TYPES],
    },
    primaryType: "HyperliquidTransaction:ApproveAgent",
    message: {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName,
      nonce: action.nonce,
    },
  };
}

/** A 65-byte signature as Hyperliquid's /exchange takes it. */
export function splitSignature(signature: string): { r: string; s: string; v: number } {
  const hex = signature.replace(/^0x/, "");
  if (hex.length !== 130) throw new RangeError("A signature is 65 bytes.");
  const v = Number.parseInt(hex.slice(128, 130), 16);
  return { r: `0x${hex.slice(0, 64)}`, s: `0x${hex.slice(64, 128)}`, v: v < 27 ? v + 27 : v };
}

/** A fresh 16-byte client order id, so a retried order is recognised as the same one. */
export function cloidFrom(seed: string): string {
  return keccak256(toHex(seed)).slice(0, 34);
}
