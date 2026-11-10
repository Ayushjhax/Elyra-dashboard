import "server-only";

import { liveEnabled, readAgent, tradingNetwork } from "@/lib/autotrade/store";
import { decryptSecret } from "@/lib/crypto/credentials";
import { serviceClient } from "@/lib/supabase/server";

/** Null when a rule may be set to live for this account; otherwise why not, in words. */
export async function liveRefusal(userId: string): Promise<string | null> {
  if (!liveEnabled()) return "Live trading is switched off on this server. Keep the rule on paper.";
  const agent = await readAgent(userId);
  const network = tradingNetwork();
  if (agent === null || !agent.approved) return "Approve Elyra's trading key on Hyperliquid first.";
  if (agent.network !== network) return `Elyra's trading key is approved on ${agent.network}, but this server trades on ${network}. Approve it again.`;
  return null;
}

/**
 * The person's approved trading key on the network this server trades on,
 * decrypted for one signing, with their Hyperliquid account. Null otherwise.
 * Never returned to a client.
 */
export async function agentKeyFor(userId: string): Promise<{ key: `0x${string}`; account: string } | null> {
  const { data } = await serviceClient().from("trading_agents").select("*").eq("user_id", userId).maybeSingle();
  if (data === null || data === undefined || data.approved_at === null || data.network !== tradingNetwork()) return null;
  try {
    return { key: decryptSecret(data.agent_key, "api_secret") as `0x${string}`, account: data.account_address };
  } catch {
    return null;
  }
}
