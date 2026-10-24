import * as Sentry from "@sentry/react-native";
import { scrubBreadcrumb, scrubEvent } from "~/lib/crash/scrub";

/* ---------------------------------------------------------------------------
   Crash reporting (Sentry), off unless EXPO_PUBLIC_SENTRY_DSN is set.

   A DSN is public by design — it can only send events, never read them —
   so it may sit in the bundle with the other EXPO_PUBLIC_ values.

   What is sent: the error, its stack, the app version, the phone model and
   Android version, and the last few breadcrumbs (screens, taps, requests) —
   every string scrubbed of addresses, signatures, tokens, user ids and
   emails first (scrub.ts). What is not: who the person is (no user, no
   IP — `sendDefaultPii` is off), screenshots, the view tree, request
   bodies, performance traces, sessions. Development builds send nothing.

   The privacy policy names Sentry as a processor (docs/legal). Its
   project must also have "Prevent storing of IP addresses" and server-side
   data scrubbing on (docs/RELEASE.md).
--------------------------------------------------------------------------- */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export const crashReportingEnabled = DSN !== "" && !__DEV__;

export function initCrashReporting(release: string): void {
  if (!crashReportingEnabled) return;
  Sentry.init({
    dsn: DSN,
    release,
    environment: "production",
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

/** The root component, with Sentry's error boundary when reporting is on. */
export function withCrashReporting(component: React.ComponentType<Record<string, unknown>>): React.ComponentType<Record<string, unknown>> {
  return crashReportingEnabled ? Sentry.wrap(component) : component;
}
