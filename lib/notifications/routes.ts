/** Route data is untrusted. Only supported app destinations may be opened. */
export function notificationRoute(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("\\") ||
    value.startsWith("//")
  )
    return "/notifications";
  const path = value.split("?")[0];
  if (/^\/asset\/[A-Za-z0-9.-]{1,24}$/.test(path)) return path;
  const aliases: Record<string, string> = {
    "/": "/",
    "/portfolio": "/portfolio",
    "/portfolio/risk": "/risk",
    "/portfolio/defi": "/defi",
    "/portfolio/orders": "/orders",
    "/portfolio/activity": "/activity",
    "/portfolio/holdings": "/holdings",
    "/assets": "/capital",
    "/agent": "/elyra",
    "/personalized": "/elyra",
    "/research": "/research",
    "/wallet": "/wallet",
    "/risk": "/risk",
    "/defi": "/defi",
    "/orders": "/orders",
    "/fills": "/fills",
    "/activity": "/activity",
    "/holdings": "/holdings",
    "/capital": "/capital",
    "/elyra": "/elyra",
    "/notifications": "/notifications",
    "/notification-settings": "/notification-settings",
    "/alerts": "/automation",
    "/automation": "/automation",
  };
  if (aliases[path]) return aliases[path];
  const prediction = /^\/prediction\/(signal\/)?([A-Za-z0-9_-]{1,160})$/.exec(
    path,
  );
  /* A market opens itself; a signal has no screen of its own in the app, so
     it opens the prediction tab, where the signal shows on its market. */
  if (prediction)
    return prediction[1]
      ? "/research?tab=prediction"
      : `/research?marketId=${encodeURIComponent(prediction[2])}`;
  return "/notifications";
}
