import { useState } from "react";
import { FlatList, View } from "react-native";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "~/components/ui/controls";
import { Card, EmptyState, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Sheet } from "~/components/personalized/Sheet";
import {
  deleteConversation,
  historyStore,
  openConversation,
  usePersonalizedChat,
} from "~/lib/personalized/client";
import { useMinute } from "~/lib/useClock";
export function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const feed = historyStore.useFeed();
  const activeId = usePersonalizedChat((state) => state.conversationId);
  const now = useMinute();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await deleteConversation(id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not delete that conversation.",
      );
    } finally {
      setBusy(null);
    }
  };
  const shown = (feed.data ?? []).filter((conversation) =>
    conversation.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Sheet title="Conversations" onClose={onClose}>
      <TextField
        label="Search conversations"
        value={query}
        onChangeText={setQuery}
      />
      {(error ?? feed.error) && (
        <Text tone="negative" accessibilityLiveRegion="polite">
          {error ?? feed.error}
        </Text>
      )}
      {feed.error && <Button label="Try again" onPress={feed.refetch} />}
      {feed.loading ? (
        <Skeleton height={48} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          ListEmptyComponent={
            feed.error ? undefined : (
              <EmptyState
                title={
                  query ? "No matching conversations" : "No conversations yet"
                }
                body="Your Capital Intelligence conversations appear here."
              />
            )
          }
          renderItem={({ item }) => (
            <Card style={{ gap: 8 }}>
              <Text variant="h2">{item.title}</Text>
              <Text variant="label" tone="muted">
                {item.id === activeId ? "Current · " : ""}
                {formatRelativeTime(item.updatedAt, now)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  label="Open conversation"
                  disabled={busy !== null}
                  onPress={() => {
                    void openConversation(item);
                    onClose();
                  }}
                />
                <Button
                  label="Delete"
                  variant="danger"
                  loading={busy === item.id}
                  disabled={busy !== null}
                  onPress={() => void remove(item.id)}
                />
              </View>
            </Card>
          )}
        />
      )}
    </Sheet>
  );
}
