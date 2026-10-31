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
  type ComponentRef,
  type ReactNode,
} from "react";
import { AccessibilityInfo, BackHandler, Modal, Text as NativeText, Pressable, StyleSheet, View, findNodeHandle } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { DISPLAY_SERIF } from "~/theme/fonts";
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
  /** Scrolls the sheet's content — to bring a focused field into view above the keyboard. */
  scrollTo?: (y: number) => void;
}

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

/** The upper corners of a `display` sheet — rounder than a panel, as the redesigned flows draw them. */
const DISPLAY_SHEET_RADIUS = 24;

/**
 * A sheet sized to its content, up to most of the screen, with a close button.
 *
 * Android's back closes it before it leaves the screen beneath, and a
 * screen reader lands on its title when it opens. `display` sets the title
 * in the serif of the redesigned flows (README, "Deliberate deviations").
 * `footer` is pinned under the scrolling content and rides above the
 * keyboard — where a form's one action goes, so it is never covered. A
 * field inside a `keyboard` sheet is a BottomSheetTextInput, which is what
 * tells the sheet to move with the keyboard.
 */
export const BottomSheet = forwardRef<
  BottomSheetHandle,
  {
    title: string;
    children: ReactNode;
    onDismiss?: () => void;
    display?: boolean;
    footer?: ReactNode;
    keyboard?: boolean;
    /** Android's back, before it closes the sheet: true when the sheet handled it (a step back inside). */
    onBack?: () => boolean;
  }
>(function BottomSheet({ title, children, onDismiss, display = false, footer, keyboard = false, onBack }, ref) {
  const modal = useRef<BottomSheetModal>(null);
  const scroller = useRef<ComponentRef<typeof BottomSheetScrollView>>(null);
  const heading = useRef<ComponentRef<typeof View>>(null);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const back = useRef(onBack);
  useEffect(() => {
    back.current = onBack;
  });
  useImperativeHandle(ref, () => ({
    present: () => modal.current?.present(),
    dismiss: () => modal.current?.dismiss(),
    scrollTo: (y: number) => scroller.current?.scrollTo({ y: Math.max(0, y), animated: true }),
  }));

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (back.current?.() === true) return true;
      modal.current?.dismiss();
      return true;
    });
    /* After the slide-in, so the reader is not moved mid-animation. */
    const focus = setTimeout(() => {
      const node = heading.current === null ? null : findNodeHandle(heading.current);
      if (node !== null && node !== undefined) AccessibilityInfo.setAccessibilityFocus(node);
    }, 350);
    return () => {
      subscription.remove();
      clearTimeout(focus);
    };
  }, [open]);

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
        >
          {footer}
        </View>
      </BottomSheetFooter>
    ),
    [footer, insets.bottom],
  );

  return (
    <BottomSheetModal
      ref={modal}
      enableDynamicSizing
      topInset={insets.top + 24}
      backdropComponent={Backdrop}
      onChange={(index) => setOpen(index >= 0)}
      onDismiss={() => {
        setOpen(false);
        onDismiss?.();
      }}
      backgroundStyle={[styles.sheet, display && styles.sheetDisplay]}
      handleIndicatorStyle={styles.handle}
      footerComponent={footer === undefined ? undefined : renderFooter}
      keyboardBehavior={keyboard ? "interactive" : undefined}
      keyboardBlurBehavior={keyboard ? "restore" : undefined}
      /* android_keyboardInputMode stays at its default: "adjustResize" leaves
         the lift to the window resizing, which edge-to-edge Android never
         does, and the sheet stayed under the keyboard. */
      accessible={false}
    >
      <BottomSheetScrollView
        ref={scroller}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: footer === undefined ? insets.bottom + 16 : footerHeight + 8 }}
      >
        <View style={[styles.sheetHead, display && styles.sheetHeadDisplay]}>
          <View ref={heading} accessible accessibilityRole="header" accessibilityLabel={title} style={styles.flex}>
            {display ? (
              <NativeText maxFontSizeMultiplier={1.2} style={styles.displayTitle}>
                {title}
              </NativeText>
            ) : (
              <Text variant="h2">{title}</Text>
            )}
          </View>
          {/* A plain Pressable rather than IconButton: controls.tsx imports this
              file, so importing it back would be a cycle. Same 48dp target. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()}`}
            onPress={() => modal.current?.dismiss()}
            style={styles.close}
          >
            <X size={display ? 24 : 18} strokeWidth={1.5} color={display ? color["text-primary"] : color["text-secondary"]} />
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
  sheetDisplay: { borderTopLeftRadius: DISPLAY_SHEET_RADIUS, borderTopRightRadius: DISPLAY_SHEET_RADIUS },
  handle: { backgroundColor: color["border-strong"], width: 40 },
  sheetHeadDisplay: { paddingLeft: 20, paddingRight: 8, paddingTop: 4, paddingBottom: 8 },
  displayTitle: { fontFamily: DISPLAY_SERIF, fontSize: 32, lineHeight: 38, color: color["text-primary"], letterSpacing: -0.3 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: color["surface-panel"],
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
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
