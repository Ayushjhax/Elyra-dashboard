import { isWellFormedCode } from "@/lib/referrals/config";

/* ---------------------------------------------------------------------------
   Which links the app opens, and where — decided here, before the router
   sees them (src/app/+native-intent.tsx).

   An allowlist. A link is validated part by part and mapped to a route the
   app has; anything else lands on the home screen and is otherwise
   ignored, so a crafted link can never reach a screen or a parameter the
   app did not mean to expose.

     https://getelyra.xyz/r/CODE        a referral: the code, kept for sign-up
     elyra://asset/SOL                  a market
     elyra://wallet                     the wallet sheet
     elyra://notifications              the inbox
     elyra://research/report/<uuid>     a research report

   Pure: no React Native, so every rule is tested directly. A development
   build's own launcher links pass through untouched; a release build has
   no such exception.
--------------------------------------------------------------------------- */

export const SCHEME = "elyra";
export const WEBSITE_HOSTS = new Set(["getelyra.xyz", "www.getelyra.xyz"]);

const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9.-]{0,23}$/;

/* The development client's launcher links (elyra://expo-development-client/…)
   and Expo's own (exp://, exp+elyra://) — matched from the START of the link,
   so a link that merely mentions one is still checked like any other. */
const DEVELOPMENT_CLIENT = /^(?:[a-z][a-z0-9+.-]*:\/\/expo-development-client(?:[/?#]|$)|exp(?:\+[a-z0-9-]+)?:\/\/)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkTarget =
  /** A route in the app. */
  | { kind: "route"; path: string }
  /** A referral code to keep, then the home screen. */
  | { kind: "referral"; code: string }
  /** Not ours: handed to the router exactly as it arrived. */
  | { kind: "passthrough" }
  /** Ours, but nothing the app opens: the home screen. */
  | { kind: "ignored" };

/**
 * A link the app may hand to the phone's browser: http(s) with a host, or
 * null. Links that leave the app come from data — a filing, a report's
 * source, a market, an explorer — and a `solana:` payment request, an
 * `intent:` or another app's scheme in that data must not open the wallet
 * or another app in its place.
 */
export function webUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return /^https?:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/i.test(text) ? text : null;
}

function parse(raw: string): URL | null {
  try {
    return new URL(raw, `${SCHEME}://`);
  } catch {
    return null;
  }
}

/** The link's own path segments — for elyra://asset/SOL the host is the first. */
function segmentsOf(url: URL): string[] {
  const path = url.pathname.split("/").filter((part) => part.length > 0).map((part) => decodeURIComponent(part));
  return url.protocol === `${SCHEME}:` && url.host.length > 0 ? [url.host, ...path] : path;
}

/**
 * `development` opens elyra://dev, the development build's tool screen, so
 * end-to-end flows can reach it, and lets the development client's own
 * links through; a release build never passes it, so in a release build
 * every link is checked against the allowlist below.
 */
export function resolveLink(raw: string, { development = false }: { development?: boolean } = {}): LinkTarget {
  if (development && DEVELOPMENT_CLIENT.test(raw.trim())) return { kind: "passthrough" };
  const url = parse(raw.trim());
  if (url === null) return { kind: "ignored" };

  if (url.protocol === "https:" || url.protocol === "http:") {
    if (!WEBSITE_HOSTS.has(url.host.toLowerCase())) return { kind: "ignored" };
    const [first, code] = segmentsOf(url);
    if (first === "r" && code !== undefined) {
      const normalised = code.trim().toUpperCase();
      return isWellFormedCode(normalised) ? { kind: "referral", code: normalised } : { kind: "ignored" };
    }
    return { kind: "ignored" };
  }

  if (url.protocol !== `${SCHEME}:`) return { kind: "ignored" };
  const parts = segmentsOf(url);
  const [first, second, third] = parts;
  switch (first) {
    case "asset":
      return parts.length === 2 && second !== undefined && SYMBOL.test(second) ? { kind: "route", path: `/asset/${second.toUpperCase()}` } : { kind: "ignored" };
    case "wallet":
      return parts.length === 1 ? { kind: "route", path: "/wallet" } : { kind: "ignored" };
    case "notifications":
      return parts.length === 1 ? { kind: "route", path: "/notifications" } : { kind: "ignored" };
    case "research":
      return parts.length === 3 && second === "report" && third !== undefined && UUID.test(third)
        ? { kind: "route", path: `/report/${third.toLowerCase()}` }
        : parts.length === 1
          ? { kind: "route", path: "/research" }
          : { kind: "ignored" };
    case "dev":
      return development && parts.length === 1 ? { kind: "route", path: "/dev" } : { kind: "ignored" };
    case undefined:
      /* The bare scheme, elyra:// — open the app. */
      return { kind: "route", path: "/" };
    default:
      return { kind: "ignored" };
  }
}
