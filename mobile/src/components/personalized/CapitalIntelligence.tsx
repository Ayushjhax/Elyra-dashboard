import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text as NativeText, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { ArrowRight, BookOpen, Check, ChartColumn, ChartPie, ChevronUp, Compass, FileText, PiggyBank, type LucideIcon } from "lucide-react-native";
import { deriveInsights, suggestedPrompts } from "@/lib/personalized/insights";
import {
  CHIP_SOURCE,
  sourceStatuses,
  usable,
} from "@/lib/personalized/sources";
import { CONTEXT_SOURCES } from "@/lib/personalized/types";
import {
  totalEquityUsd,
  availableCapitalUsd,
} from "@/lib/personalized/calculations";
import { formatPriceUsd } from "@/lib/format";
import { AnswerBlocks } from "~/components/personalized/AnswerBlocks";
import { Composer } from "~/components/personalized/Composer";
import { MemorySheet } from "~/components/personalized/ContextRail";
import { HistoryDrawer } from "~/components/personalized/HistoryDrawer";
import { UnderlineTabs } from "~/components/market/parts";
import { Button } from "~/components/ui/controls";
import { Card, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import {
  memoryStore,
  resetChat,
  retryPersonalized,
  setDraft,
  toggleSource,
  usePersonalizedChat,
  type ChatTurn,
} from "~/lib/personalized/client";
import { useWalletActivity } from "~/lib/stores/activity";
import { usePortfolio } from "~/lib/stores/portfolio";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* Capital Intelligence — answers with the account as context.

   A source is SELECTED (the person included it) and separately AVAILABLE
   (there is something to read): the tile's tick is the first, its line of
   text the second, so "Positions — None yet" can be ticked and still say
   there is nothing in it. Ticking changes only what the next question
   carries; it never creates or saves memory. A starter puts its question
   in the composer to edit and send. */

const ICON: Record<string, LucideIcon> = { portfolio: ChartPie, positions: ChartColumn, activity: FileText, memory: BookOpen };
const STARTER_ICON: LucideIcon[] = [ChartPie, Compass, PiggyBank];
const LABEL = {
  portfolio: "Portfolio",
  positions: "Positions",
  activity: "Activity",
  memory: "Memory",
};
const STARTERS = [
  {
    title: "Review my portfolio",
    body: "Understand balances and allocation",
    text: "Review my portfolio: what I hold, how it's allocated, and anything that stands out.",
  },
  {
    title: "Research an asset",
    body: "Explore a market before you act",
    text: "I want to research SOL before I act — what drives it, the main risks, and what should I watch?",
  },
  {
    title: "Plan a deposit",
    body: "Think through your next funding move",
    text: "Help me plan my first deposit: how to get funds in, and what to think about before I do.",
  },
];
export function CapitalIntelligence() {
  const auth = useElyraAuth();
  // Key the local sheets too: no editor from a departed account survives.
  return <CapitalView key={auth.account?.id ?? "signed-out"} />;
}
function CapitalView() {
  const chat = usePersonalizedChat();
  /* Two tiles a row where a source's name and status both fit; one on a narrow phone or at large text. */
  const { width, fontScale } = useWindowDimensions();
  const wide = width / Math.max(1, fontScale) >= 400;
  const portfolio = usePortfolio();
  const wallet = useWalletDashboard();
  const activity = useWalletActivity(10);
  const memory = memoryStore.useFeed();
  const [sheet, setSheet] = useState<"history" | "memory" | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const list = useRef<FlatList<ChatTurn>>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    if (chat.turns.length === 0 && !chat.opening) {
      atBottom.current = true;
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [chat.turns.length, chat.opening]);
  useEffect(() => {
    if (chat.pending) {
      atBottom.current = true;
      list.current?.scrollToEnd({ animated: false });
    }
  }, [chat.pending]);
  const snapshot = portfolio.snapshot;
  const statuses = sourceStatuses({
    wallet: {
      loading: wallet.loading,
      hasAddress: wallet.address !== null,
      unconfigured: wallet.unconfigured,
      read: wallet.snapshot !== null,
      stale: wallet.stale,
      error: wallet.error,
    },
    portfolio: {
      loading: portfolio.loading,
      read: snapshot !== null,
      positions:
        snapshot === null
          ? 0
          : snapshot.perps.length +
            snapshot.defi.length +
            (snapshot.prediction?.activeMarkets ?? 0),
      positionsFailed:
        portfolio.stale ||
        (snapshot?.notes.some((note) => note.kind === "failed") ?? false),
      error: portfolio.error,
    },
    activity: {
      loading: activity.loading,
      unconfigured: activity.unconfigured,
      count: activity.items.length,
      error: activity.error,
    },
    memory: {
      loading: memory.loading,
      count: memory.data?.length ?? 0,
      error: memory.error,
    },
  });
  const insights = useMemo(
    () =>
      snapshot === null ? [] : deriveInsights(snapshot, memory.data ?? []),
    [snapshot, memory.data],
  );
  const prompts = useMemo(
    () =>
      snapshot === null ? [] : suggestedPrompts(snapshot, memory.data ?? []),
    [snapshot, memory.data],
  );
  const header = (
    <View style={styles.stack}>
      <View style={styles.contextHead}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={styles.contextTitle}>
          Account context
        </NativeText>
        <Text variant="body" tone="secondary" style={styles.note}>
          · {chat.sources.length === 0 ? "off" : `${chat.sources.length} ${chat.sources.length === 1 ? "source" : "sources"} selected`}
        </Text>
      </View>
      <View style={styles.sources}>
        {CONTEXT_SOURCES.map((source) => {
          const on = chat.sources.includes(source);
          const status = statuses[CHIP_SOURCE[source]];
          const readable = usable(status) && status.state !== "loading";
          const Icon = ICON[source] ?? FileText;
          const tone = status.state === "loading" ? "secondary" : !readable ? "caution" : status.state === "empty" ? "secondary" : "positive";
          return (
            <Pressable
              key={source}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${LABEL[source]}: ${on ? "included" : "not included"}. ${status.label}`}
              onPress={() => toggleSource(source)}
              style={({ pressed }) => [styles.source, wide && styles.sourceHalf, on && styles.selected, pressed && styles.pressed]}
            >
              <View style={[styles.box, on && styles.boxOn]}>{on && <Check size={18} strokeWidth={2.5} color={color["text-on-accent"]} />}</View>
              <Icon size={26} strokeWidth={1.5} color={color["text-primary"]} />
              <View style={styles.flex}>
                <Text variant="body" numberOfLines={1} style={styles.sourceName}>
                  {LABEL[source]}
                </Text>
                <Text variant="body-sm" tone={tone} numberOfLines={2}>
                  {status.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => setContextOpen(!contextOpen)}
        accessibilityRole="button"
        accessibilityState={{ expanded: contextOpen }}
        style={styles.viewContext}
      >
        <Text variant="body" style={styles.viewContextText}>
          {contextOpen ? "Hide account context" : "View account context"}
        </Text>
        {contextOpen ? <ChevronUp size={20} strokeWidth={1.5} color={color["text-primary"]} /> : <ArrowRight size={20} strokeWidth={1.5} color={color["text-primary"]} />}
      </Pressable>
      {contextOpen && (
        <Card style={styles.stack}>
          {portfolio.loading ? (
            <Skeleton height={48} />
          ) : (
            <>
              <Text variant="label" tone="muted">
                Tracked equity
              </Text>
              <Text variant="price">
                {snapshot ? formatPriceUsd(totalEquityUsd(snapshot)) : "—"}
              </Text>
              <Text variant="body-sm">
                Available capital:{" "}
                {snapshot ? formatPriceUsd(availableCapitalUsd(snapshot)) : "—"}
              </Text>
              {portfolio.error && (
                <Text tone="negative">{portfolio.error}</Text>
              )}
              {portfolio.stale && (
                <Text tone="caution">Earlier reading · refresh failed</Text>
              )}
              {snapshot?.notes
                .filter((note) => note.kind === "failed")
                .map((note, index) => (
                  <Text key={index} tone="caution" variant="label">
                    {note.scope}: {note.reason}
                  </Text>
                ))}
              <Button
                label="Refresh context"
                onPress={() => {
                  portfolio.refetch();
                  wallet.refetch();
                  activity.refetch();
                  memory.refetch();
                }}
              />
            </>
          )}
        </Card>
      )}
      {chat.turns.length === 0 && !chat.opening && (
        <>
          <View style={styles.rule} />
          <View style={styles.welcome}>
            <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.welcomeTitle}>
              What&apos;s your next move?
            </NativeText>
            <Text variant="body" tone="secondary" style={[styles.lead, styles.center]}>
              Your capital, positions and preferences. Ask with your account as context.
            </Text>
          </View>
          {STARTERS.map((starter, index) => {
            const Icon = STARTER_ICON[index] ?? ChartPie;
            return (
              <Pressable
                key={starter.title}
                accessibilityRole="button"
                accessibilityLabel={`${starter.title}: ${starter.body}`}
                accessibilityHint="Puts the question in the composer to edit and send"
                onPress={() => setDraft(starter.text)}
                style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
              >
                <Icon size={30} strokeWidth={1.5} color={color["accent-hover"]} />
                <View style={styles.flex}>
                  <NativeText maxFontSizeMultiplier={1.25} style={styles.starterTitle}>
                    {starter.title}
                  </NativeText>
                  <Text variant="body" tone="secondary" style={styles.note}>
                    {starter.body}
                  </Text>
                </View>
                <ArrowRight size={22} strokeWidth={1.5} color={color["text-primary"]} />
              </Pressable>
            );
          })}
          <Button
            label="Set my preferences"
            onPress={() => setSheet("memory")}
          />
          {prompts.map((prompt) => (
            <Button
              key={prompt}
              label={prompt}
              variant="quiet"
              onPress={() => setDraft(prompt)}
            />
          ))}
          {insights.map((insight) => (
            <Card key={insight.id} style={styles.insight}>
              <Text
                variant="h2"
                tone={
                  insight.tone === "positive" || insight.tone === "negative"
                    ? insight.tone
                    : "accent"
                }
              >
                {insight.title}
              </Text>
              <Text tone="secondary">{insight.detail}</Text>
              {insight.prompt && (
                <Button
                  label="Explore this"
                  onPress={() => setDraft(insight.prompt!)}
                />
              )}
            </Card>
          ))}
        </>
      )}
    </View>
  );
  return (
    <View style={styles.fill}>
      <View style={styles.top}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.pageTitle}>
          Capital intelligence
        </NativeText>
        <UnderlineTabs<"new" | "history" | "memory">
          accessibilityLabel="Capital intelligence"
          value={sheet ?? "new"}
          onChange={(next) => {
            if (next === "new") {
              resetChat();
              atBottom.current = true;
              list.current?.scrollToOffset({ offset: 0, animated: false });
            } else setSheet(next);
          }}
          tabs={[
            { value: "new", label: "New" },
            { value: "history", label: "History" },
            { value: "memory", label: "Memory" },
          ]}
        />
      </View>
      <FlatList
        ref={list}
        data={chat.turns}
        keyExtractor={(turn) => turn.id}
        contentContainerStyle={styles.transcript}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } =
            event.nativeEvent;
          atBottom.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            100;
        }}
        onContentSizeChange={() => {
          if (chat.turns.length > 0 && atBottom.current)
            list.current?.scrollToEnd({ animated: false });
        }}
        ListFooterComponent={
          <View style={styles.stack}>
            {chat.opening && <Skeleton height={48} />}
            {chat.pending && (
              <Text tone="accent" accessibilityLiveRegion="polite">
                {chat.status ?? "Thinking…"}
              </Text>
            )}
            {chat.openError && (
              <>
                <Text tone="negative">{chat.openError}</Text>
                <Button
                  label="Open from history again"
                  onPress={() => setSheet("history")}
                />
              </>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.role === "assistant" ? (
            <View style={styles.insight}>
              <AnswerBlocks
                answer={item.answer}
                content={item.content}
                onPrompt={setDraft}
              />
            </View>
          ) : (
            <Card style={styles.user}>
              <Text>{item.content}</Text>
              {item.request?.attachments.map((file, index) => (
                <Text key={index} variant="label" tone="muted">
                  {file.name}
                </Text>
              ))}
              {item.outcome && (
                <>
                  <Text
                    tone={
                      item.outcome.state === "failed" ? "negative" : "muted"
                    }
                  >
                    {item.outcome.error ?? "Stopped before an answer."}
                  </Text>
                  {item.request && (
                    <Button
                      label="Retry"
                      disabled={chat.pending}
                      onPress={() => void retryPersonalized(item.id)}
                    />
                  )}
                </>
              )}
            </Card>
          )
        }
      />
      <Composer />
      {sheet === "history" && <HistoryDrawer onClose={() => setSheet(null)} />}
      {sheet === "memory" && <MemorySheet onClose={() => setSheet(null)} />}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  stack: { gap: 14 },
  transcript: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 24 },
  top: { paddingHorizontal: 20, gap: 6 },
  pageTitle: { fontFamily: DISPLAY_SERIF, fontSize: 36, lineHeight: 44, color: color["text-primary"], letterSpacing: -0.4 },
  pressed: { backgroundColor: color["surface-hover"] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  note: { fontSize: 15, lineHeight: 21 },
  lead: { fontSize: 16, lineHeight: 23 },
  center: { textAlign: "center" },
  contextHead: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8 },
  contextTitle: { fontFamily: DISPLAY_SERIF, fontSize: 24, lineHeight: 30, color: color["text-primary"] },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  source: {
    flexGrow: 1,
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radius.sheet,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  sourceHalf: { flexBasis: "46%" },
  selected: { borderColor: color["border-strong"] },
  box: { width: 26, height: 26, borderRadius: radius.chip, borderWidth: 1.5, borderColor: color["border-strong"], alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: color["accent-hover"], borderColor: color["accent-hover"] },
  sourceName: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  viewContext: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: TOUCH_TARGET },
  viewContextText: { fontSize: 16, lineHeight: 22 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
  welcome: { alignItems: "center", gap: 8, paddingTop: 8 },
  welcomeTitle: { fontFamily: DISPLAY_SERIF, fontSize: 32, lineHeight: 40, color: color["text-primary"], textAlign: "center" },
  starterTitle: { fontFamily: DISPLAY_SERIF, fontSize: 21, lineHeight: 27, color: color["text-primary"] },
  insight: {
    borderLeftWidth: 2,
    borderLeftColor: color["agent-rail"],
    paddingLeft: 12,
    gap: 8,
  },
  user: { alignSelf: "flex-end", maxWidth: "90%", gap: 8 },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    gap: 16,
  },
});
