import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { ArrowDown } from "lucide-react-native";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "~/components/agent/MessageBubble";
import { Button } from "~/components/ui/controls";
import { ElyraMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { useAppStore } from "~/lib/store";
import { color, popShadow, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The conversation, newest at the bottom.

   An inverted list, so the latest message is where the list starts: an
   answer being written stays in view as it grows, and someone who has
   scrolled up to read an older answer keeps their place and is offered a
   way back. Virtualised, like every long list here.

   Empty, it invites a first question — no sample exchange, because a
   conversation the person never had is a claim about their account.
--------------------------------------------------------------------------- */

/** Further than this from the latest message offers the way back. */
const AWAY_PX = 240;

function Empty({ symbol, onAsk }: { symbol: string; onAsk: (prompt: string) => void }) {
  const market = symbol || "the market";
  return (
    <View style={styles.empty}>
      <ElyraMark size={44} />
      <Text variant="h2" style={styles.center}>
        Ask Elyra about crypto
      </Text>
      <Text variant="body-sm" tone="secondary" style={[styles.center, styles.measure]}>
        Markets, tokens, protocols and on-chain mechanics, with live prices, funding, open interest and your connected accounts. It never places orders. Type / for shortcuts.
      </Text>
      <Button label={`Brief me on ${market}`} size="sm" onPress={() => onAsk(`Give me a brief on ${market} right now.`)} />
    </View>
  );
}

export function Conversation({ symbol, onAsk }: { symbol: string; onAsk: (prompt: string) => void }) {
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
      <View style={[styles.fill, styles.emptyContent]}>
        <Empty symbol={symbol} onAsk={onAsk} />
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
  emptyContent: { justifyContent: "center" },
  empty: { alignItems: "center", gap: 10, padding: 24 },
  center: { textAlign: "center" },
  measure: { maxWidth: 320 },
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
