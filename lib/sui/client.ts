import "server-only";

import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { optional } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Reading and writing Sui mainnet, server-side.

   Through GraphQL: Sui's public full nodes no longer answer JSON-RPC
   ("deprecated … migrate to gRPC or GraphQL"), and the SDK's GraphQL client
   carries the same API as its gRPC one. The public endpoint is rate-limited
   and documented as for development; set SUI_GRAPHQL_URL to a provider's
   endpoint for production. Server-only, like every RPC here, so a paid
   endpoint's key never reaches the browser.
--------------------------------------------------------------------------- */

const PUBLIC_URL = "https://graphql.mainnet.sui.io/graphql";
const TIMEOUT_MS = 12_000;

export function suiGraphqlUrl(): string {
  return optional("SUI_GRAPHQL_URL") ?? PUBLIC_URL;
}

let client: { url: string; instance: SuiGraphQLClient } | null = null;

export function suiClient(): SuiGraphQLClient {
  const url = suiGraphqlUrl();
  if (client === null || client.url !== url) {
    client = { url, instance: new SuiGraphQLClient({ url, network: "mainnet" }) };
  }
  return client.instance;
}

/** A raw GraphQL read, for the queries the SDK's typed API does not cover. */
export async function suiQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(suiGraphqlUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!response.ok || body === null || body.data === undefined) {
    throw new Error(body?.errors?.[0]?.message ?? `Sui GraphQL returned ${response.status}`);
  }
  return body.data;
}
