import { View } from "react-native";
import type { PersonalizedAnswer } from "@/lib/personalized/types";
import { InlineAction } from "~/components/agent/InlineAction";
import { Button } from "~/components/ui/controls";
import { Card } from "~/components/ui/layout";
import { Markdown } from "~/components/ui/Markdown";
import { Text } from "~/components/ui/Text";
import { formatAnswerText } from "~/lib/personalized/format";
export function AnswerBlocks({
  answer,
  content,
  onPrompt,
}: {
  answer: PersonalizedAnswer | null;
  content: string;
  onPrompt: (text: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {answer?.headline && (
        <Text variant="h2">{formatAnswerText(answer.headline)}</Text>
      )}
      <Markdown source={formatAnswerText(answer?.message ?? content)} />
      {answer?.metrics?.map((metric, index) => (
        <Card key={index} style={{ gap: 4 }}>
          <Text variant="label" tone="muted">
            {metric.label}
          </Text>
          <Text variant="data">{formatAnswerText(metric.value)}</Text>
          {metric.delta && (
            <Text
              variant="data-sm"
              tone={
                metric.tone === "positive" || metric.tone === "negative"
                  ? metric.tone
                  : "secondary"
              }
            >
              {formatAnswerText(metric.delta)}
            </Text>
          )}
        </Card>
      ))}
      {answer?.insights?.map((insight, index) => (
        <Card key={index} style={{ gap: 4 }}>
          <Text
            variant="h2"
            tone={
              insight.type === "positive" || insight.type === "negative"
                ? insight.type
                : insight.type === "risk"
                  ? "accent"
                  : "primary"
            }
          >
            {formatAnswerText(insight.title)}
          </Text>
          <Text tone="secondary">{formatAnswerText(insight.detail)}</Text>
        </Card>
      ))}
      {answer?.preparedAction && (
        <InlineAction
          action={answer.preparedAction}
          id={answer.preparedActionId ?? null}
        />
      )}
      {answer?.contextUsed && answer.contextUsed.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text variant="label" tone="muted">
            Grounded in
          </Text>
          {answer.contextUsed.map((source) => (
            <Text key={source} variant="label" tone="secondary">
              {source}
            </Text>
          ))}
        </View>
      )}
      {answer?.suggestedPrompts?.map((prompt) => (
        <Button
          key={prompt}
          label={prompt}
          variant="quiet"
          onPress={() => onPrompt(prompt)}
        />
      ))}
    </View>
  );
}
