import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { ChevronRight, LogOut, type LucideIcon } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account menu's rows — the Account tab and the account sheet draw the
   same ones: an outlined icon, the destination and what is there, an
   optional badge, a chevron. Signing out is apart, in muted coral, and is
   the app's one logout (useElyraAuth().logout), wherever it is pressed.
--------------------------------------------------------------------------- */

/** Signs out through the app's session, with its progress and failure in words. */
export function useSignOut(onDone?: () => void) {
  const auth = useElyraAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
      onDone?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Signing out failed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, signOut };
}

/** A bordered group of rows. `bare` drops the border, for rows inside a sheet. */
export function AccountMenuGroup({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  return <View style={bare ? undefined : styles.group}>{children}</View>;
}

export function AccountMenuRow({
  icon: Icon,
  label,
  note,
  badge,
  onPress,
  first = false,
  tone = "primary",
  busy = false,
}: {
  icon: LucideIcon;
  label: string;
  note?: string;
  badge?: ReactNode;
  onPress: () => void;
  first?: boolean;
  tone?: "primary" | "negative";
  busy?: boolean;
}) {
  const ink = tone === "negative" ? color.negative : color["text-primary"];
  /* A badge beside the chevron leaves a 360dp phone too little room for
     "Connections"; under that width, or at a large font size, it sits under
     the description instead. */
  const { width, fontScale } = useWindowDimensions();
  const trailing = width / Math.max(1, fontScale) >= 400;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={note === undefined ? label : `${label}, ${note}`}
      accessibilityState={{ busy, disabled: busy }}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.row, note !== undefined && styles.rowTall, !first && styles.ruled, pressed && styles.pressed]}
    >
      <Icon size={26} strokeWidth={1.5} color={ink} />
      <View style={styles.flex}>
        <Text variant="body" tone={tone} numberOfLines={2} style={styles.label}>
          {label}
        </Text>
        {note !== undefined && (
          <Text variant="body" tone="secondary" numberOfLines={2} style={styles.note}>
            {note}
          </Text>
        )}
        {badge !== undefined && !trailing && <View style={styles.badgeBelow}>{badge}</View>}
      </View>
      {trailing && badge}
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <ChevronRight size={22} strokeWidth={1.5} color={tone === "negative" ? color.negative : color["text-secondary"]} />
      )}
    </Pressable>
  );
}

/** Sign out, in muted coral, with its failure said under it. */
export function SignOutRow({ framed = true, onDone }: { framed?: boolean; onDone?: () => void }) {
  const { busy, error, signOut } = useSignOut(onDone);
  return (
    <View style={styles.signOut}>
      <AccountMenuGroup bare={!framed}>
        <AccountMenuRow icon={LogOut} label={busy ? "Signing out…" : "Sign out"} tone="negative" busy={busy} first onPress={() => void signOut()} />
      </AccountMenuGroup>
      {error !== null && (
        <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite" style={!framed && styles.errorBare}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  group: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: TOUCH_TARGET + 16,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: 12,
  },
  rowTall: { minHeight: 80 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  pressed: { backgroundColor: color["surface-hover"] },
  label: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24 },
  note: { fontSize: 15, lineHeight: 20 },
  badgeBelow: { flexDirection: "row", marginTop: 6 },
  signOut: { gap: 8 },
  errorBare: { paddingHorizontal: 20, paddingBottom: 8 },
});
