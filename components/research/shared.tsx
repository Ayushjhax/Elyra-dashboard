"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

export function useResearchResource<T>(url: string, enabled = true) {
  const request = useAuthedFetch();
  const auth = useElyraAuth();
  const resourceKey = `${auth.account?.id ?? "public"}:${url}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    url: string;
    data: T | null;
    error: string | null;
    loading: boolean;
  } | null>(null);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState((current) => ({
        url: resourceKey,
        data: current?.url === resourceKey ? current.data : null,
        error: null,
        loading: true,
      }));
      try {
        const response = await requestRef.current(url, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in to read this research."
              : "This data could not be loaded. Try again.",
          );
        const data = (await response.json()) as T;
        if (!controller.signal.aborted)
          setState({ url: resourceKey, data, error: null, loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            url: resourceKey,
            data: current?.url === resourceKey ? current.data : null,
            error:
              error instanceof Error
                ? error.message
                : "This data could not be loaded.",
            loading: false,
          }));
      }
    });
    return () => controller.abort();
  }, [url, resourceKey, enabled, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: state?.url === resourceKey ? state.data : null,
    error: state?.url === resourceKey ? state.error : null,
    loading: enabled && (state?.url !== resourceKey || state.loading),
    reload,
  };
}

export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="r-loading">
      <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden />
      {children}
    </div>
  );
}
export function Problem({
  children,
  retry,
}: {
  children: React.ReactNode;
  retry?: () => void;
}) {
  return (
    <div role="status" className="r-problem">
      <span>{children}</span>
      {retry && (
        <button type="button" className="r-button" onClick={retry}>
          <RefreshCw size={14} aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}
export function SignIn({
  children = "Sign in to read this research.",
}: {
  children?: React.ReactNode;
}) {
  const auth = useElyraAuth();
  return (
    <div className="r-problem">
      <span>{children}</span>
      <button
        type="button"
        className="r-button"
        onClick={auth.login}
        disabled={!auth.available}
      >
        Connect wallet
      </button>
    </div>
  );
}
export function Choices<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="r-choices" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="r-choice"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export const percentage = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : "—";
export const dollars = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: Math.abs(value) >= 1e6 ? "compact" : "standard",
        maximumFractionDigits: Math.abs(value) >= 1e6 ? 1 : 2,
      }).format(value)
    : "—";
export function Timestamp({
  at,
  label = "Source updated",
}: {
  at?: string | null;
  label?: string;
}) {
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  return (
    <span className="r-timestamp">
      {label}{" "}
      <time dateTime={at}>
        {new Date(at).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })}{" "}
        UTC
      </time>
    </span>
  );
}
