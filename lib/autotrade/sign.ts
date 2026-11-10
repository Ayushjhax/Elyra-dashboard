import { privateKeyToAccount } from "viem/accounts";
import type { Packable } from "@/lib/autotrade/msgpack";
import { actionHash, l1TypedData, splitSignature, type Network } from "@/lib/autotrade/wire";

/* ---------------------------------------------------------------------------
   Signing an L1 action with Elyra's trading key for one person.

   The key is a Hyperliquid API wallet ("agent") the person approved from
   their own wallet. Hyperliquid lets an agent place and cancel orders for
   the account and NOTHING else — it cannot withdraw, transfer or approve
   another agent — which is the whole reason execution is built on it. The
   person can revoke it from Hyperliquid at any time, without Elyra.
--------------------------------------------------------------------------- */

export async function signL1Action(
  privateKey: `0x${string}`,
  action: Packable,
  nonce: number,
  network: Network,
): Promise<{ r: string; s: string; v: number }> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData(l1TypedData(actionHash(action, nonce), network));
  return splitSignature(signature);
}
