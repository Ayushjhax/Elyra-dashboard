import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { APP_VERSION } from "~/lib/api";

/* ---------------------------------------------------------------------------
   The app's legal pages, its disclosures, and the support address — from
   CLAUDE.md ("The Android dApp"). The policy and terms are the website's,
   because the account is the same on both.
--------------------------------------------------------------------------- */

export const PRIVACY_URL = "https://getelyra.xyz/privacy";
export const TERMS_URL = "https://getelyra.xyz/terms";
export const SUPPORT_EMAIL = "ayushkmrjha@gmail.com";

/** What a person should know before relying on Elyra, in the brand's voice. */
export const DISCLOSURES: readonly { title: string; body: string }[] = [
  {
    title: "Not financial advice",
    body: "Elyra shows you data and analysis. What you do with it is your decision, and markets can move against any view.",
  },
  {
    title: "AI answers can be wrong",
    body: "Ask Elyra writes from live tools, but a model can misread them or miss something. Check the sources shown under each answer.",
  },
  {
    title: "Elyra never holds your keys",
    body: "Your embedded wallet's key is secured by Privy and only you can use it. An external wallet's key stays in its own app.",
  },
  {
    title: "Venue connections are read-only",
    body: "Elyra reads balances and positions. It can't place, change or cancel a trade, or move funds on any venue.",
  },
  {
    title: "Swaps and prices",
    body: "Swaps are routed through Jupiter and signed by you. Prices come from Pyth.",
  },
  {
    title: "Third-party names",
    body: "Names and logos of other companies belong to their owners. Showing them doesn't mean they endorse Elyra.",
  },
];

/** "1.0.0 (12)" — the version and the build number. */
export function versionLabel(): string {
  const build = Application.nativeBuildVersion;
  return build === null || build === "" ? APP_VERSION : `${APP_VERSION} (${build})`;
}

/**
 * A mailto to support with what helps diagnose a problem — the app version
 * and the phone — and nothing about the account: no email, address or id.
 */
export function supportMailto(device: { model: string | null; os: string } = deviceInfo()): string {
  const subject = `Elyra ${versionLabel()} support`;
  const body = [
    "Describe what happened:",
    "",
    "",
    "—",
    `App: Elyra ${versionLabel()}`,
    `Device: ${device.model ?? "Unknown"}`,
    `System: ${device.os}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function deviceInfo(): { model: string | null; os: string } {
  const os = Platform.OS === "android" ? `Android ${Device.osVersion ?? ""}`.trim() : `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`.trim();
  return { model: [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || null, os };
}
