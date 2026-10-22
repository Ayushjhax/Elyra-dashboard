import { useRef, useState } from "react";
import { Linking, Modal, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScanLine, X } from "lucide-react-native";
import { addressFromScan } from "@/lib/wallet/flows";
import { Button, IconButton } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { outcomeHaptic } from "~/components/wallet/parts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Scanning a recipient's QR code.

   The camera permission is asked for only here, when Scan is pressed — never
   at launch — and a refusal says how to change it rather than failing
   silently. The camera reads QR codes and nothing else; no frame is kept.

   Only an address comes out: a bare one, or the recipient of a Solana Pay
   URI. Anything else is refused on screen, and the field is never filled
   with something that is not an address.
--------------------------------------------------------------------------- */

export function ScanButton({ onAddress }: { onAddress: (address: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const start = async () => {
    setRefused(null);
    const status = permission?.granted ? permission : await requestPermission();
    if (status.granted) {
      setOpen(true);
      return;
    }
    setRefused(
      status.canAskAgain
        ? "Elyra needs the camera to scan an address. Paste it instead, or allow the camera and try again."
        : "Camera access is off for Elyra. Turn it on in Settings, or paste the address instead.",
    );
  };

  return (
    <>
      <Button
        label="Scan"
        size="sm"
        icon={<ScanLine size={16} strokeWidth={1.5} color={color["text-primary"]} />}
        accessibilityLabel="Scan a QR code"
        onPress={() => void start()}
      />
      {refused !== null && (
        <View style={styles.refused}>
          <Text variant="label" tone="secondary" style={styles.flex}>
            {refused}
          </Text>
          {permission?.canAskAgain === false && (
            <Button label="Open Settings" size="sm" variant="ghost" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      )}
      {open && (
        <ScanModal
          onClose={() => setOpen(false)}
          onAddress={(address) => {
            setOpen(false);
            onAddress(address);
          }}
        />
      )}
    </>
  );
}

function ScanModal({ onClose, onAddress }: { onClose: () => void; onAddress: (address: string) => void }) {
  const insets = useSafeAreaInsets();
  const [notAddress, setNotAddress] = useState(false);
  /* The scanner fires for every frame a code is in view; one answer is enough. */
  const done = useRef(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modal}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const address = addressFromScan(data);
            if (address === null) {
              setNotAddress(true);
              return;
            }
            done.current = true;
            outcomeHaptic("success");
            onAddress(address);
          }}
        />
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Text variant="h2" style={styles.flex}>
            Scan an address
          </Text>
          <IconButton accessibilityLabel="Close the scanner" onPress={onClose}>
            <X size={22} strokeWidth={1.5} color={color["text-primary"]} />
          </IconButton>
        </View>
        <View pointerEvents="none" style={styles.frame} />
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <Text variant="body-sm" tone={notAddress ? "negative" : "secondary"} accessibilityLiveRegion="polite">
            {notAddress
              ? "That code isn't a Solana address. Point the camera at the recipient's address code."
              : "Point the camera at a Solana address or a Solana Pay code."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  refused: { flexDirection: "row", alignItems: "center", gap: 8 },
  modal: { flex: 1, backgroundColor: color["surface-base"] },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 4,
    paddingBottom: 8,
    backgroundColor: color["surface-base"],
  },
  frame: {
    alignSelf: "center",
    marginTop: "auto",
    marginBottom: "auto",
    width: 240,
    height: 240,
    borderRadius: radius.panel,
    borderWidth: 2,
    borderColor: color.accent,
  },
  bottom: { paddingHorizontal: 20, paddingTop: 16, backgroundColor: color["surface-base"] },
});
