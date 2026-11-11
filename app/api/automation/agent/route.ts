import { NextResponse } from "next/server";
import { recoverTypedDataAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { submitAgentApproval } from "@/lib/autotrade/hyperliquid";
import { automationUser } from "@/lib/autotrade/session";
import { num, tablesMissing, tradingNetwork } from "@/lib/autotrade/store";
import { approveAgentAction, approveAgentTypedData, splitSignature } from "@/lib/autotrade/wire";
import { encryptSecret } from "@/lib/crypto/credentials";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Elyra's trading key on Hyperliquid, in two steps.

   prepare — makes a fresh key, stores it encrypted and unapproved, and
             returns the approval for the person's wallet to sign. The wallet
             shows exactly what it approves: an API wallet named "Elyra".
   approve — takes the signature, checks it was made by the person's own
             account over THIS key and nonce (rebuilt here, never read from
             the body), and submits it to Hyperliquid.

   An API wallet can trade the account and cannot withdraw from it. The
   person can remove it on Hyperliquid at any time; Elyra then simply fails
   to trade, and says so.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { userId, evmAddress } = resolved;
  if (evmAddress === null) {
    return NextResponse.json({ error: "This account has no EVM wallet to hold a Hyperliquid account." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const network = tradingNetwork();
  const db = serviceClient();

  if (body.step === "prepare") {
    const key = generatePrivateKey();
    const agentAddress = privateKeyToAccount(key).address;
    const nonce = Date.now();
    const { error } = await db.from("trading_agents").upsert({
      user_id: userId,
      network,
      account_address: evmAddress,
      agent_address: agentAddress,
      agent_key: encryptSecret(key, "api_secret"),
      approval_nonce: nonce,
      approved_at: null,
    });
    if (error !== null) {
      return NextResponse.json(
        { error: tablesMissing(error) ? "Automation needs database migration 0018, which has not been applied." : "The key could not be saved." },
        { status: 503 },
      );
    }
    const action = approveAgentAction(agentAddress, nonce, network);
    return NextResponse.json({ network, accountAddress: evmAddress, agentAddress, typedData: approveAgentTypedData(action) });
  }

  if (body.step === "approve") {
    const signature = typeof body.signature === "string" ? body.signature : "";
    const { data: agent } = await db.from("trading_agents").select("*").eq("user_id", userId).maybeSingle();
    if (agent === null || agent === undefined) return NextResponse.json({ error: "Start again: there is no key waiting for approval." }, { status: 400 });

    const action = approveAgentAction(agent.agent_address, num(agent.approval_nonce), agent.network);
    const typed = approveAgentTypedData(action);
    let signer: string;
    try {
      signer = await recoverTypedDataAddress({
        domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as `0x${string}` },
        types: { "HyperliquidTransaction:ApproveAgent": typed.types["HyperliquidTransaction:ApproveAgent"] },
        primaryType: "HyperliquidTransaction:ApproveAgent",
        message: { ...typed.message, agentAddress: typed.message.agentAddress as `0x${string}`, nonce: BigInt(typed.message.nonce) },
        signature: signature as `0x${string}`,
      });
    } catch {
      return NextResponse.json({ error: "That is not a valid signature." }, { status: 400 });
    }
    if (signer.toLowerCase() !== agent.account_address.toLowerCase()) {
      return NextResponse.json({ error: "That approval was signed by a different wallet than this account's." }, { status: 400 });
    }

    const refused = await submitAgentApproval(agent.network, action, splitSignature(signature)).catch((error: unknown) =>
      error instanceof Error ? error.message : "Hyperliquid could not be reached.",
    );
    if (refused !== null) {
      const hint = /does not exist|deposit/i.test(refused) ? " Hyperliquid only accepts this from an account that has deposited." : "";
      return NextResponse.json({ error: `Hyperliquid refused the approval: ${refused}${hint}` }, { status: 502 });
    }
    await db.from("trading_agents").update({ approved_at: new Date().toISOString() }).eq("user_id", userId);
    return NextResponse.json({ approved: true, network: agent.network, agentAddress: agent.agent_address });
  }

  return NextResponse.json({ error: "Expected step: prepare or approve." }, { status: 400 });
}
