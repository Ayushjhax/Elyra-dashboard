import { useEffect, useState } from "react";
import { mustUpdate } from "@/lib/appVersion";
import { api, APP_VERSION } from "~/lib/api";

/* ---------------------------------------------------------------------------
   Whether this build may run against the API it talks to.

   Read once at launch from /api/app/config, before sign-in. Below
   `minSupportedVersion` the app shows a blocking "Update Elyra" screen. A
   failed read never blocks: an outage or a missing API URL is not a reason
   to lock someone out of an app that may work perfectly well.
--------------------------------------------------------------------------- */

export interface AppConfig {
  minSupportedVersion: string;
  latestVersion: string | null;
  features: Record<string, boolean>;
}

export type GateState = { status: "checking" } | { status: "ok"; config: AppConfig | null } | { status: "blocked"; config: AppConfig };

export function useVersionGate(): GateState {
  const [state, setState] = useState<GateState>({ status: "checking" });
  useEffect(() => {
    let cancelled = false;
    api
      .get<AppConfig>("/api/app/config", { auth: false, timeoutMs: 8_000 })
      .then((config) => {
        if (cancelled) return;
        setState(mustUpdate(APP_VERSION, config.minSupportedVersion) ? { status: "blocked", config } : { status: "ok", config });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "ok", config: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
