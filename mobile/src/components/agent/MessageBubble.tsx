import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Copy, FileText, RotateCcw, Sparkles } from "lucide-react-native";
import { workingLine } from "@/lib/agent/reply";
import { formatClock } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";
import { InlineAction } from "~/components/agent/InlineAction";
import { ReportCard } from "~/components/agent/ReportCard";
import { IconButton } from "~/components/ui/controls";
import { Markdown } from "~/components/ui/Markdown";
import { Text } from "~/components/ui/Text";
import { useCopy } from "~/components/wallet/parts";
import { canRetry, retryReply } from "~/lib/agentChat";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One message. What Elyra wrote carries the agent rail and renders its
   Markdown natively (components/ui/Markdown.tsx); what the person wrote is
   plain text on the right.

   Under an answer: the sources its figures came from — read from the tool
   results by the server, never from the model's text — its time, copy, and
   retry when it failed. A prepared action's review card and a started
   report sit inside the answer they belong to.
--------------------------------------------------------------------------- */

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  thinking,
  pending,
}: {
  message: ChatMessage;
  streaming: boolean;
  /** The request is in flight and this empty bubble is where it will land. */
  thinking: boolean;
  /** Some request is in flight: a retry waits for it. */
  pending: boolean;
}) {
  const copy = useCopy();
  const agent = message.role === "agent";
  const done = !thinking && !streaming;

  return (
    <View style={[styles.row, agent ? styles.left : styles.right]}>
      <View style={[styles.bubble, agent ? styles.agent : styles.user]}>
        {message.attachments !== undefined && message.attachments.length > 0 && (
          <View style={styles.attachments} accessibilityLabel="Attached files">
            {message.attachments.map((file, index) =>
              file.previewUrl ? (
                <Image
                  key={`${file.name}-${index}`}
                  source={{ uri: file.previewUrl }}
                  accessibilityLabel={file.name}
                  contentFit="cover"
                  style={styles.thumb}
                />
              ) : (
                <View key={`${file.name}-${index}`} style={styles.fileChip}>
                  <FileText size={13} strokeWidth={1.5} color={color["text-muted"]} />
                  <Text variant="label" tone="secondary" numberOfLines={1} style={styles.shrink}>
                    {file.name}
                  </Text>
                </View>
              ),
            )}
          </View>
        )}

        {thinking ? (
          <View style={styles.working} accessibilityLiveRegion="polite">
            <Sparkles size={14} strokeWidth={1.5} color={color["agent-accent"]} />
            <Text variant="body-sm" tone="secondary" style={styles.shrink}>
              {workingLine(message.activity)}
            </Text>
          </View>
        ) : agent ? (
          message.failed ? (
            <Text variant="body-sm" tone="negative" selectable>
              {message.text}
            </Text>
          ) : (
            <Markdown source={message.text} />
          )
        ) : message.text.length > 0 ? (
          <Text variant="body-sm" selectable>
            {message.text}
          </Text>
        ) : null}

        {done && message.preparedAction !== undefined && (
          <InlineAction action={message.preparedAction} id={message.preparedActionId ?? null} />
        )}
        {message.report !== undefined && <ReportCard id={message.report.id} query={message.report.query} />}

        {done && agent && message.sources !== undefined && message.sources.length > 0 && (
          <View style={styles.sources} accessibilityLabel={`Sources: ${message.sources.join(", ")}`}>
            <Text variant="label" tone="secondary">
              Sources
            </Text>
            {message.sources.map((source) => (
              <View key={source} style={styles.source}>
                <Text variant="label" tone="muted">
                  {source}
                </Text>
              </View>
            ))}
          </View>
        )}

        {done && (
          <View style={[styles.footer, agent ? null : styles.footerRight]}>
            <Text variant="data-sm" tone="muted">
              {formatClock(message.at)} UTC
            </Text>
            {message.text.length > 0 && (
              <IconButton accessibilityLabel={agent ? "Copy Elyra's answer" : "Copy your question"} onPress={() => void copy(message.text, agent ? "answer" : "question")}>
                <Copy size={14} strokeWidth={1.5} color={color["text-muted"]} />
              </IconButton>
            )}
            {agent && message.failed === true && canRetry(message.id) && (
              <IconButton accessibilityLabel="Ask again" disabled={pending} onPress={() => void retryReply(message.id)}>
                <RotateCcw size={14} strokeWidth={1.5} color={color["text-secondary"]} />
              </IconButton>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 6 },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: { minWidth: 0, gap: 8, borderRadius: radius.card, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  agent: {
    flex: 1,
    backgroundColor: color["surface-raised"],
    borderLeftWidth: 3,
    borderLeftColor: color["agent-rail"],
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  user: { maxWidth: "85%", backgroundColor: color["surface-hover"] },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  thumb: { width: 128, height: 96, borderRadius: radius.control, borderWidth: 1, borderColor: color["border-subtle"] },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  shrink: { flexShrink: 1 },
  working: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 8 },
  sources: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  source: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: color["border-subtle"],
  },
  footer: { flexDirection: "row", alignItems: "center", gap: 0, marginLeft: -2 },
  footerRight: { justifyContent: "flex-end" },
});
