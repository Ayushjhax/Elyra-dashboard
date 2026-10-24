import { useState } from "react";
import { FlatList } from "react-native";
import type { PersonalizedMemory } from "@/lib/personalized/types";
import { Button } from "~/components/ui/controls";
import { EmptyState, Card, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Sheet } from "~/components/personalized/Sheet";
import { PreferenceEditor } from "~/components/personalized/PreferenceEditor";
import { memoryStore } from "~/lib/personalized/client";
export function MemorySheet({ onClose }: { onClose: () => void }) {
  const feed = memoryStore.useFeed();
  const [editor, setEditor] = useState<PersonalizedMemory | "new" | null>(null);
  return (
    <>
      <Sheet title="Saved preferences" onClose={onClose}>
        <Text variant="body-sm" tone="secondary">
          Standing instructions Elyra keeps across conversations.
        </Text>
        <Button label="Add preference" onPress={() => setEditor("new")} />
        {feed.error && (
          <>
            <Text tone="negative">{feed.error}</Text>
            <Button label="Try again" onPress={feed.refetch} />
          </>
        )}
        {feed.loading ? (
          <Skeleton height={48} />
        ) : (
          <FlatList
            data={feed.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
            ListEmptyComponent={
              !feed.error ? (
                <EmptyState
                  title="No saved preferences"
                  body="Set a concentration limit or tell Elyra what to keep in mind."
                />
              ) : undefined
            }
            renderItem={({ item }) => (
              <Card style={{ gap: 8 }}>
                <Text>{item.label}</Text>
                <Text variant="label" tone="muted">
                  {item.source === "explicit"
                    ? "You asked to save this"
                    : "Suggested by Elyra"}
                </Text>
                <Button
                  label="Edit preference"
                  onPress={() => setEditor(item)}
                />
              </Card>
            )}
          />
        )}
      </Sheet>
      {editor !== null && (
        <PreferenceEditor
          memory={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
