import { Linking, StyleSheet, View } from "react-native";
import { Button } from "~/components/ui/controls";
import { ElyraMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { APP_VERSION } from "~/lib/api";
import { color } from "~/theme/tokens";

/** Shown instead of the app when this build is older than the API supports. */
export function UpdateRequired({ minimum }: { minimum: string }) {
  return (
    <View style={styles.root}>
      <ElyraMark size={56} />
      <Text variant="h1" accessibilityRole="header" style={styles.center}>
        Update Elyra
      </Text>
      <Text variant="body" tone="secondary" style={styles.center}>
        This version ({APP_VERSION}) no longer works with Elyra&apos;s servers. Install version {minimum} or newer from
        the Solana dApp Store to carry on.
      </Text>
      <Button label="Open getelyra.xyz" variant="accent" onPress={() => void Linking.openURL("https://getelyra.xyz")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color["surface-base"],
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  center: { textAlign: "center" },
});
