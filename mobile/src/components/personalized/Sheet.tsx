import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { color, radius } from "~/theme/tokens";

// A bounded sheet leaves the list in charge of scrolling and virtualisation.
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="height"
        style={[styles.scrim, { paddingTop: insets.top + 24 }]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.header}>
            <Text variant="h2" accessibilityRole="header" style={styles.flex}>
              {title}
            </Text>
            <Button label="Close" variant="ghost" onPress={onClose} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: color["surface-base"] + "cc",
  },
  sheet: {
    height: "90%",
    backgroundColor: color["surface-panel"],
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 16,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1 },
});
