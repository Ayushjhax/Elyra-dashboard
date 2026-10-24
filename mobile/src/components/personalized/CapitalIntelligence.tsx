import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
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
import { Button } from "~/components/ui/controls";
import { Card, EmptyState, Skeleton } from "~/components/ui/layout";
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
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";
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
      <Text variant="label" tone="muted">
        Account context ·{" "}
        {chat.sources.length === 0
          ? "off"
          : `${chat.sources.length} sources selected`}
      </Text>
      <View style={styles.sources}>
        {CONTEXT_SOURCES.map((source) => {
          const on = chat.sources.includes(source);
          const status = statuses[CHIP_SOURCE[source]];
          const readable = usable(status) && status.state !== "loading";
          return (
            <Pressable
              key={source}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${LABEL[source]}: ${on ? (readable ? "Included" : status.label) : "Excluded"}`}
              onPress={() => toggleSource(source)}
              style={[styles.source, on && styles.selected]}
            >
              <Text variant="label">{LABEL[source]}</Text>
              <Text
                variant="label"
                tone={
                  on && !readable && status.state !== "loading"
                    ? "caution"
                    : "muted"
                }
              >
                {on
                  ? readable
                    ? `Included · ${status.label}`
                    : status.label
                  : "Excluded"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={contextOpen ? "Hide account context" : "View account context"}
        variant="ghost"
        onPress={() => setContextOpen(!contextOpen)}
      />
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
          <EmptyState
            title="What's your next move?"
            body="Your capital, positions and preferences. Ask with your account as context."
          />
          {STARTERS.map((starter) => (
            <Pressable
              key={starter.title}
              accessibilityRole="button"
              accessibilityLabel={starter.title}
              onPress={() => setDraft(starter.text)}
              style={styles.starter}
            >
              <Text variant="h2">{starter.title}</Text>
              <Text variant="body-sm" tone="secondary">
                {starter.body}
              </Text>
            </Pressable>
          ))}
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
      <Text
        variant="h2"
        accessibilityRole="header"
        style={{ paddingHorizontal: 16 }}
      >
        Capital Intelligence
      </Text>
      <View style={styles.toolbar}>
        <Button
          label="New"
          variant="ghost"
          onPress={() => {
            resetChat();
            atBottom.current = true;
            list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
        />
        <Button
          label="History"
          variant="ghost"
          onPress={() => setSheet("history")}
        />
        <Button
          label="Memory"
          variant="ghost"
          onPress={() => setSheet("memory")}
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
  stack: { gap: 12 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  transcript: { padding: 16, gap: 24 },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  source: {
    width: "48%",
    minHeight: TOUCH_TARGET,
    padding: 8,
    borderWidth: 1,
    borderRadius: radius.control,
    borderColor: color["border-subtle"],
    gap: 4,
  },
  selected: {
    borderColor: color["accent-quiet"],
    backgroundColor: color["surface-raised"],
  },
  insight: {
    borderLeftWidth: 2,
    borderLeftColor: color["agent-rail"],
    paddingLeft: 12,
    gap: 8,
  },
  user: { alignSelf: "flex-end", maxWidth: "90%", gap: 8 },
  starter: {
    minHeight: TOUCH_TARGET,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    gap: 4,
  },
});
