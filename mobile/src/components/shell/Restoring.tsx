import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Skeleton } from "~/components/ui/layout";
import { ElyraMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/** How long a restore may take before the screen says so. */
const SLOW_MS = 15_000;

/**
 * While Privy restores a session. Neutral — no sign-in prompt, no account —
 * because which of the two is coming is not known yet. If Privy cannot start
 * it says why, and if it is merely slow it says that, rather than showing a
 * skeleton forever.
 */
export function Restoring({ error }: { error: string | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.root} accessibilityLabel="Restoring your session" accessibilityState={{ busy: error === null }}>
      <ElyraMark size={48} />
      {error !== null ? (
        <Text variant="body-sm" tone="negative" style={styles.text} accessibilityLiveRegion="polite">
          Sign-in could not start: {error}
        </Text>
      ) : (
        <>
          <Skeleton width={180} height={14} />
          <Skeleton width={120} height={14} />
          {slow && (
            <Text variant="body-sm" tone="secondary" style={styles.text}>
              Still restoring your session. Check your connection.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32, backgroundColor: color["surface-base"] },
  text: { textAlign: "center" },
});
