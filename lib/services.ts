/* ---------------------------------------------------------------------------
   Where a sibling service lives — the signal engine (ELYRA_ENGINE_URL) and
   the smart-money tracker (SMART_MONEY_TRACKER_URL).

   Its env value, or on a development machine the port it runs on locally.
   In production an unset URL is null: the route answers "not configured" at
   once instead of spending its timeout calling localhost on a server where
   nothing listens.
--------------------------------------------------------------------------- */

export function serviceUrl(
  value: string | undefined,
  localDefault: string,
  environment: string | undefined = process.env.NODE_ENV,
): string | null {
  const configured = value?.trim() ?? "";
  if (configured !== "") return configured;
  return environment === "production" ? null : localDefault;
}
