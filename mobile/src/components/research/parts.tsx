import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Text as NativeText, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { formatCompactUsd, formatUsd } from "@/lib/format";
import type { File } from "expo-file-system";
import { FileDown, RefreshCw, Share2, Sparkles } from "lucide-react-native";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { outcomeHaptic } from "~/components/wallet/parts";
import { sendToAgent } from "~/lib/agentChat";
import { api, ApiError } from "~/lib/api";
import { openPdf, sharePdf } from "~/lib/pdf";
import { currentAccount, onAccountChange } from "~/lib/session";
import { useAppStore } from "~/lib/store";
import { DISPLAY_SERIF } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   What every Research tab shares — the website's components/research/
   shared.tsx, for a phone.

   `useResearch` reads one route while its tab is on screen and the app is
   in front, keeps the last good answer while a refresh runs, and forgets it
   when the account changes, so one person's reports never show under the
   next person's name. A failure keeps the server's own sentence — the
   per-user rate limit says "Wait a moment" in its own words.
--------------------------------------------------------------------------- */

export interface Resource<T> {
  data: T | null;
  error: string | null;
  /** No answer for this path yet. */
  loading: boolean;
  /** A read is running over an answer already shown. */
  refreshing: boolean;
  reload: () => void;
}

function useForeground(): boolean {
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);
  return foreground;
}

function useAccount(): string | null {
  const [account, setAccount] = useState(currentAccount());
  useEffect(() => onAccountChange(setAccount), []);
  return account;
}

/**
 * One route's answer. `path` null reads nothing (a tab not yet opened).
 * `pollMs` reads again on that interval while shown; a function decides
 * from the last answer (fast while a report runs, then not at all).
 */
export function useResearch<T>(
  path: string | null,
  options: { pollMs?: number | ((data: T | null) => number | null); timeoutMs?: number } = {},
): Resource<T> {
  const foreground = useForeground();
  const account = useAccount();
  const key = path === null ? null : `${account ?? "public"}:${path}`;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; busy: boolean }>({
    key: null,
    data: null,
    error: null,
    busy: false,
  });
  const [revision, setRevision] = useState(0);
  const poll = useRef(options.pollMs);
  useEffect(() => {
    poll.current = options.pollMs;
  }, [options.pollMs]);
  const timeoutMs = options.timeoutMs ?? 30_000;

  useEffect(() => {
    if (path === null || key === null || !foreground) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      setState((current) => ({ key, data: current.key === key ? current.data : null, error: null, busy: true }));
      api
        .get<T>(path, { signal: controller.signal, timeoutMs })
        .then((data) => {
          if (controller.signal.aborted) return;
          setState({ key, data, error: null, busy: false });
          const every = typeof poll.current === "function" ? poll.current(data) : (poll.current ?? null);
          if (every !== null) timer = setTimeout(read, every);
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          setState((current) => ({
            key,
            data: current.key === key ? current.data : null,
            error: failure instanceof ApiError ? failure.message : "This could not be loaded. Try again.",
            busy: false,
          }));
        });
    };
    read();
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [path, key, foreground, revision, timeoutMs]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const mine = state.key === key;
  return {
    data: mine ? state.data : null,
    error: mine ? state.error : null,
    loading: path !== null && (!mine || (state.data === null && state.error === null)),
    refreshing: mine && state.busy && state.data !== null,
    reload,
  };
}

/** Asks Elyra, from anywhere in Research, and goes to the answer. */
export function askElyra(prompt: string): void {
  useAppStore.getState().setAgentTab("ask");
  void sendToAgent(prompt);
  router.navigate("/elyra");
}

/* ---- states ---- */

export function Loading({ children }: { children: ReactNode }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={color["text-muted"]} />
      <Text variant="body-sm" tone="secondary" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

export function Problem({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return (
    <View style={[styles.state, styles.problem]} accessibilityLiveRegion="polite">
      <Text variant="body-sm" tone="secondary" style={styles.flex}>
        {children}
      </Text>
      {retry !== undefined && <Button label="Try again" size="sm" icon={<RefreshCw size={14} strokeWidth={1.5} color={color["text-primary"]} />} onPress={retry} />}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text variant="h2" style={styles.center}>
        {title}
      </Text>
      {body !== undefined && (
        <Text variant="body-sm" tone="secondary" style={styles.center}>
          {body}
        </Text>
      )}
      {action}
    </View>
  );
}

/* ---- pieces ---- */

/** A row of choices, as pills; scrolls sideways when they do not fit. */
export function Chips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  wrap = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Flow onto further lines instead of scrolling sideways — for a short set in a card. */
  wrap?: boolean;
}) {
  const pills = options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            hitSlop={6}
            style={[styles.chip, selected && styles.chipOn]}
          >
            <Text
              key={selected ? "on" : "off"}
              variant="body"
              tone={selected ? "on-accent" : "primary"}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={styles.chipLabel}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      });
  if (wrap) {
    return (
      <View style={[styles.chips, styles.chipsWrap]} accessibilityLabel={label} accessibilityRole="radiogroup">
        {pills}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={label} accessibilityRole="radiogroup">
      {pills}
    </ScrollView>
  );
}

/** A tab's serif headline and the line under it, directly below the tab strip. */
export function TabIntro({ title, lead }: { title: string; lead: string }) {
  return (
    <View style={styles.intro}>
      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.introTitle}>
        {title}
      </NativeText>
      <Text variant="body" tone="secondary" style={styles.introLead}>
        {lead}
      </Text>
    </View>
  );
}

/** A serif heading inside a card or over a list. */
export function SerifHeading({ children, size = 28, right }: { children: string; size?: number; right?: ReactNode }) {
  return (
    <View style={styles.serifRow}>
      <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={[styles.serif, { fontSize: size, lineHeight: Math.round(size * 1.22) }]}>
        {children}
      </NativeText>
      {right}
    </View>
  );
}

/** "—— or build your own ——" */
export function OrDivider({ children }: { children: string }) {
  return (
    <View style={styles.or} accessibilityRole="text">
      <View style={styles.orLine} />
      <Text variant="body" tone="secondary" style={styles.orText}>
        {children}
      </Text>
      <View style={styles.orLine} />
    </View>
  );
}

/** "Source updated 23 Oct 2026, 08:40 UTC". Nothing for a missing time. */
export function Timestamp({ at, label = "Source updated" }: { at?: string | null; label?: string }) {
  if (!at || !Number.isFinite(Date.parse(at))) return null;
  const when = new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return (
    <Text variant="label" tone="muted">
      {label} {when} UTC
    </Text>
  );
}

/** A section heading in the brand's eyebrow role, with an optional note. */
export function Heading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <View style={styles.heading}>
      <Text variant="eyebrow" tone="muted" style={styles.flex}>
        {children}
      </Text>
      {note}
    </View>
  );
}

export function AskButton({ prompt, label = "Ask Elyra" }: { prompt: string; label?: string }) {
  return (
    <Button
      label={label}
      size="sm"
      variant="ghost"
      icon={<Sparkles size={12} strokeWidth={1.5} color={color["agent-accent"]} />}
      onPress={() => askElyra(prompt)}
    />
  );
}

/**
 * Open and share for one PDF. Downloaded once on first use and reused for
 * this screen; each failure says why.
 */
export function PdfButtons({ load, title }: { load: () => Promise<File>; title: string }) {
  const [busy, setBusy] = useState<"open" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<File | null>(null);
  const run = async (how: "open" | "share") => {
    setBusy(how);
    setError(null);
    try {
      if (file.current === null || !file.current.exists) file.current = await load();
      if (how === "open") await openPdf(file.current, title);
      else await sharePdf(file.current, title);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "The PDF could not be opened.");
      outcomeHaptic("error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.pdf}>
      <View style={styles.row}>
        <Button
          label={busy === "open" ? "Downloading…" : "Open PDF"}
          size="sm"
          loading={busy === "open"}
          disabled={busy !== null}
          icon={<FileDown size={14} strokeWidth={1.5} color={color["text-primary"]} />}
          onPress={() => void run("open")}
        />
        <Button
          label="Share"
          size="sm"
          variant="ghost"
          loading={busy === "share"}
          disabled={busy !== null}
          icon={<Share2 size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
          onPress={() => void run("share")}
        />
      </View>
      {error !== null && (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

/** A flat card: the panel surface on a hairline. */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* ---- figures ---- */

export const percentage = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";

export const dollars = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? /* Hermes ignores Intl's compact notation, so millions use the shared
         formatter: $53.1M, not $53,084,444.6. */
      Math.abs(value) >= 1e6
      ? formatCompactUsd(value)
      : formatUsd(value)
    : "—";

export const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  state: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  problem: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    flexWrap: "wrap",
  },
  empty: { alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 16 },
  chips: { gap: 8, paddingVertical: 2 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  intro: { gap: 4 },
  introTitle: { fontFamily: DISPLAY_SERIF, fontSize: 38, lineHeight: 46, color: color["text-primary"], letterSpacing: -0.4 },
  introLead: { fontSize: 17, lineHeight: 24 },
  serifRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  serif: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], flexShrink: 1 },
  or: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-strong"] },
  orText: { fontSize: 16, lineHeight: 22 },
  /* 44 tall plus the 6dp hit slop: a 48dp target. */
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
  },
  chipOn: { borderColor: color["accent-hover"], backgroundColor: color["accent-hover"] },
  chipLabel: { fontSize: 15, lineHeight: 20 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  pdf: { gap: 4 },
  card: {
    gap: 6,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
});
