import { useMemo, useRef, useState } from "react";
import { FlatList, Text as NativeText, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, ChartPie, Flame, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react-native";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "~/components/agent/MessageBubble";
import { WideButton } from "~/components/shell/flow";
import { Emblem, Glow } from "~/components/ui/brand";
import { Text } from "~/components/ui/Text";
import { ASK_STARTERS, MARKET_BRIEF } from "~/lib/askPrompts";
import { useAppStore } from "~/lib/store";
import { DISPLAY_SERIF } from "~/theme/fonts";
import { color, popShadow, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The conversation, newest at the bottom.

   An inverted list, so the latest message is where the list starts: an
   answer being written stays in view as it grows, and someone who has
   scrolled up to read an older answer keeps their place and is offered a
   way back. Virtualised, like every long list here.

   Empty, it invites a first question — no sample exchange, because a
   conversation the person never had is a claim about their account. The
   welcome is about crypto in general, not the market last opened
   elsewhere: a brief on the market and a few starters (lib/askPrompts.ts);
   each is sent once, through the
   same path as the composer, and the welcome gives way to the
   conversation as soon as it starts.
--------------------------------------------------------------------------- */

/** Further than this from the latest message offers the way back. */
const AWAY_PX = 240;

function Starter({ icon: Icon, label, disabled, onPress }: { icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Ask: ${label}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.starter, pressed && styles.pressed, disabled && styles.dim]}
    >
      <Icon size={24} strokeWidth={1.5} color={color["text-primary"]} />
      <Text variant="body" style={[styles.flex, styles.starterText]}>
        {label}
      </Text>
      <ArrowUpRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
  );
}

/** The emblem's box; the halo is centred on it. */
const MARK = 140;

const STARTER_ICONS: LucideIcon[] = [TrendingUp, ChartPie, Flame, BookOpen];

function Empty({ onAsk }: { onAsk: (prompt: string) => void }) {
  const pending = useAppStore((state) => state.agentPending);
  const { width } = useWindowDimensions();
  const halo = Math.round(Math.min(width, 420) * 0.9);
  return (
    <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Glow size={halo} strength={1} style={{ top: (MARK - halo) / 2, left: (MARK - halo) / 2 }} />
          <Emblem size={112} />
        </View>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>
          Ask about crypto.
        </NativeText>
        <Text variant="body" tone="secondary" style={[styles.center, styles.lead]}>
          Explore prices, funding, open interest and your connected accounts.
        </Text>
        <View style={styles.scope}>
          <ShieldCheck size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          <Text variant="body" tone="secondary" style={styles.lead}>
            Elyra never places orders.
          </Text>
        </View>
      </View>
      <WideButton
        label="Brief me on the market"
        variant="accent"
        trailing={ArrowRight}
        disabled={pending}
        onPress={() => onAsk(MARKET_BRIEF)}
      />
      <View style={styles.starters}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={styles.heading}>
          Start a conversation
        </NativeText>
        {ASK_STARTERS.map((prompt, index) => (
          <Starter key={prompt} icon={STARTER_ICONS[index] ?? TrendingUp} label={prompt} disabled={pending} onPress={() => onAsk(prompt)} />
        ))}
      </View>
    </ScrollView>
  );
}

export function Conversation({ onAsk }: { onAsk: (prompt: string) => void }) {
  const messages = useAppStore((state) => state.messages);
  const pending = useAppStore((state) => state.agentPending);
  const streamingId = useAppStore((state) => state.streamingId);
  const list = useRef<FlatList<ChatMessage>>(null);
  const [away, setAway] = useState(false);

  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > AWAY_PX;
    if (next !== away) setAway(next);
  };

  /* Shown in place of the list: an inverted list's empty view is
     transformed with it, differently on each platform. */
  if (messages.length === 0) {
    return (
      <View style={styles.fill}>
        <Empty onAsk={onAsk} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlatList
        ref={list}
        inverted
        data={newestFirst}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            streaming={item.id === streamingId}
            /* The reply is appended empty and filled as it arrives, so the
               empty one is the one being waited on. */
            thinking={pending && item.role === "agent" && item.text.length === 0 && item.report === undefined}
            pending={pending}
          />
        )}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={100}
        accessibilityLabel="Conversation"
      />
      {away && (
        <Pressable
          onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
          accessibilityRole="button"
          accessibilityLabel="Jump to the latest message"
          hitSlop={4}
          style={styles.jump}
        >
          <ArrowDown size={14} strokeWidth={1.5} color={color["text-primary"]} />
          <Text variant="label">Latest</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingVertical: 12 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: color["surface-hover"] },
  dim: { opacity: 0.5 },
  empty: { gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  hero: { alignItems: "center", gap: 12 },
  mark: { width: MARK, height: MARK, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: DISPLAY_SERIF, fontSize: 40, lineHeight: 48, color: color["text-primary"], textAlign: "center", letterSpacing: -0.4 },
  center: { textAlign: "center" },
  lead: { fontSize: 16, lineHeight: 23 },
  scope: { flexDirection: "row", alignItems: "center", gap: 8 },
  starters: { gap: 12 },
  heading: { fontFamily: DISPLAY_SERIF, fontSize: 28, lineHeight: 34, color: color["text-primary"] },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  starterText: { fontSize: 16, lineHeight: 22 },
  jump: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    ...popShadow,
  },
});
