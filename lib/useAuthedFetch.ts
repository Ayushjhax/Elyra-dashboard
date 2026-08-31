"use client";

import { useCallback } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";

/**
 * `fetch` with the Privy access token attached.
 *
 * The token goes on the Authorization header rather than relying on Privy's
 * cookie, so it works regardless of how cookies are configured for the app.
 * Every authenticated call from the client goes through here so that choice
 * lives in one place.
 */
export function useAuthedFetch() {
  const auth = useElyraAuth();

  return useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const token = await auth.getAccessToken();
      return fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
    },
    [auth],
  );
}
