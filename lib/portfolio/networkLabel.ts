import { EVM_CHAINS } from "@/lib/evm/chains";

/* ---------------------------------------------------------------------------
   A ledger's name for a person: "Base", "Polymarket". Pure, so the server's
   flow reader and the page's export name a network the same way.
--------------------------------------------------------------------------- */

const NETWORK_NAMES: Record<string, string> = {
  solana: "Solana",
  sui: "Sui",
  polymarket: "Polymarket",
  ...Object.fromEntries(Object.entries(EVM_CHAINS).map(([key, chain]) => [key, chain.name])),
};

export function networkLabel(network: string): string {
  return NETWORK_NAMES[network] ?? network;
}
