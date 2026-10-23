import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { color, popShadow, radius, space, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Layers that float: the bottom sheet (every web drawer becomes one on a
   phone), the dialog, and the toast.

   A floating layer is a flat panel with the one pop shadow — no glass, no
   blur (CLAUDE.md). Each has a title a screen reader announces and a way
   out that is not only a gesture.
--------------------------------------------------------------------------- */

export interface BottomSheetHandle {
  present: () => void;
  dismiss: () => void;
}

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

/** A sheet sized to its content, up to most of the screen, with a close button. */
export const BottomSheet = forwardRef<
  BottomSheetHandle,
  { title: string; children: ReactNode; onDismiss?: () => void }
>(function BottomSheet({ title, children, onDismiss }, ref) {
  const modal = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  useImperativeHandle(ref, () => ({
    present: () => modal.current?.present(),
    dismiss: () => modal.current?.dismiss(),
  }));
  return (
    <BottomSheetModal
      ref={modal}
      enableDynamicSizing
      topInset={insets.top + 24}
      backdropComponent={Backdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      accessible={false}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        <View style={styles.sheetHead}>
          <Text variant="h2" accessibilityRole="header" style={styles.flex}>
            {title}
          </Text>
          {/* A plain Pressable rather than IconButton: controls.tsx imports this
              file, so importing it back would be a cycle. Same 48dp target. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()}`}
            onPress={() => modal.current?.dismiss()}
            style={styles.close}
          >
            <X size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          </Pressable>
        </View>
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

/** A centred dialog for a decision that interrupts: a confirm, a warning. */
export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        {/* Taps inside the panel stay inside it. */}
        <Pressable style={styles.dialog} onPress={() => {}} accessible={false}>
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---- Toasts ---- */

type ToastTone = "neutral" | "positive" | "negative";

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

/** Shows a short message at the bottom of the screen. Announced to screen readers too. */
export function useToast() {
  return useContext(ToastContext);
}

const TOAST_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const insets = useSafeAreaInsets();
  const counter = useRef(0);

  const show = useCallback((text: string, tone: ToastTone = "neutral") => {
    counter.current += 1;
    setToast({ id: counter.current, text, tone });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast !== null && (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 72 }]}>
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Text
              variant="body-sm"
              tone={toast.tone === "positive" ? "positive" : toast.tone === "negative" ? "negative" : "primary"}
            >
              {toast.text}
            </Text>
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    backgroundColor: color["surface-panel"],
    borderColor: color["border-subtle"],
    borderWidth: 1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  handle: { backgroundColor: color["border-strong"], width: 36 },
  close: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space["pad-panel"],
    paddingRight: 4,
    paddingBottom: 4,
  },
  scrim: { flex: 1, backgroundColor: color["surface-base"] + "cc", justifyContent: "center", padding: 24 },
  dialog: {
    backgroundColor: color["surface-panel"],
    borderColor: color["border-subtle"],
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: 20,
    gap: 12,
    ...popShadow,
  },
  toastWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: {
    backgroundColor: color["surface-raised"],
    borderColor: color["border-strong"],
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 480,
    ...popShadow,
  },
});
