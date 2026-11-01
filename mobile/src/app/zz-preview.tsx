// TEMPORARY — development screenshot harness for the unlocks/SEC/Ask redesign. Delete before commit.
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import ResearchScreen from "~/app/(tabs)/research";
import { Composer } from "~/components/agent/Composer";
import { Conversation } from "~/components/agent/Conversation";
import { api } from "~/lib/api";
import { color } from "~/theme/tokens";

let unlockReads = 0;
const real = api.get;
(api as { get: typeof api.get }).get = (<T,>(path: string, options?: Parameters<typeof api.get>[1]) => {
  if (path.startsWith("/api/research/unlocks")) {
    unlockReads += 1;
    const body =
      unlockReads === 1
        ? { configured: true, unlocks: [], error: "Fixture: source down" }
        : { configured: true, error: null, unlocks: [{ token: "FIXTURE", unlockAt: "2026-11-05T00:00:00Z", estimated: false, eventType: "cliff", tokenAmount: 12_500_000, valueUsd: 3_400_000, percentOfCirculating: 1.8, allocation: "Investors (fixture)", provider: "Fixture provider", sourceUrl: null, asOf: "2026-11-01T10:32:00Z" }] };
    return new Promise<T>((resolve) => setTimeout(() => resolve(body as T), 1500));
  }
  return real<T>(path, options);
}) as typeof api.get;

export default function Preview() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  if (v === "ask") {
    return (
      <View style={{ flex: 1, backgroundColor: color["surface-base"], paddingTop: 40 }}>
        <Conversation symbol="PYTH" logo={null} onAsk={() => {}} />
        <Composer cryptoSymbol="PYTH" onAsk={() => {}} suggestions={false} />
      </View>
    );
  }
  return <ResearchScreen />;
}
