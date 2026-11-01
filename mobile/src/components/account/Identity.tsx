import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Camera, Check, Copy } from "lucide-react-native";
import { signInLabel } from "@/lib/account";
import { truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { walletIdentity, walletStatus, type WalletReadState, type WalletTone } from "@/lib/wallet/status";
import { Button, IconButton } from "~/components/ui/controls";
import { CoinMark, Identicon } from "~/components/ui/marks";
import { useToast } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { pickAvatar } from "~/lib/avatar";
import { useAppStore } from "~/lib/store";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Who is signed in: their photo or the wallet's identicon, how they signed
   in, the network
   and whether the wallet read is healthy, and the address with copy. The
   account sheet and the Account tab both show it, from the same stores, so
   the two cannot describe different wallets.

   The address is shown shortened and copied whole. Copying says so twice —
   a toast, and the button's tick for a moment — so it is not missed.

   The photo is this phone's (lib/avatar.ts). Pressing the avatar picks
   one; without one, the identicon stands in, as it does on the website.
--------------------------------------------------------------------------- */

const DOT: Record<WalletTone, string> = {
  positive: color.positive,
  caution: color.caution,
  negative: color.negative,
  muted: color["text-muted"],
};

const SOL_LOGO = hyperliquidIcon("SOL");
const COPIED_MS = 1600;

/** The account's photo when one is set on this phone, the wallet's identicon otherwise. */
export function AccountAvatar({
  mark,
  size,
  active = false,
}: {
  mark: { network: string; address: string } | null;
  size: number;
  active?: boolean;
}) {
  const avatar = useAppStore((state) => state.avatar);
  if (avatar === null) return <Identicon identity={mark} size={size} active={active} />;
  return (
    <Image
      source={{ uri: avatar }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  );
}

/** Choosing and removing the photo; failures are said in a toast. */
function useAvatarPicker() {
  const toast = useToast();
  const avatar = useAppStore((state) => state.avatar);
  const setAvatar = useAppStore((state) => state.setAvatar);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickAvatar();
      if (picked !== null) {
        setAvatar(picked);
        toast("Photo updated", "positive");
      }
    } catch {
      toast("That photo could not be used. Try another.", "negative");
    } finally {
      setBusy(false);
    }
  };

  return { avatar, busy, choose, remove: () => setAvatar(null) };
}

/** The wallet read's state as a dot and a word — the word, so it is not told by colour alone. */
export function ConnectionStatusBadge({ wallet }: { wallet: WalletReadState }) {
  const status = walletStatus(wallet);
  return (
    <View style={styles.status} accessible accessibilityLabel={`Wallet ${status.label.toLowerCase()}`}>
      <View style={[styles.dot, { backgroundColor: DOT[status.tone] }]} />
      <Text variant="body" tone={status.tone === "negative" ? "negative" : "secondary"} numberOfLines={1} style={styles.statusText}>
        {status.label}
      </Text>
    </View>
  );
}

/** The address in an inset box, shortened to fit, with a copy button that copies all of it. */
export function WalletAddressRow({ address }: { address: string }) {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    await copy(address, "wallet address");
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <View style={styles.address}>
      <Text
        variant="body"
        numberOfLines={1}
        ellipsizeMode="middle"
        accessibilityLabel={`Wallet address ${address}`}
        style={[styles.flex, styles.addressText]}
      >
        {truncateMiddle(address, 6, 6)}
      </Text>
      <IconButton accessibilityLabel={copied ? "Copied the wallet address" : "Copy the wallet address"} onPress={() => void onCopy()}>
        {copied ? (
          <Check size={22} strokeWidth={1.75} color={color.positive} />
        ) : (
          <Copy size={22} strokeWidth={1.5} color={color["text-secondary"]} />
        )}
      </IconButton>
    </View>
  );
}

/**
 * The identity block: avatar, account and sign-in method, network and
 * status, address. It reads the shared wallet store unless handed a reading.
 */
export function AccountIdentityCard({ wallet: given }: { wallet?: WalletReadState } = {}) {
  const auth = useElyraAuth();
  const store = useWalletDashboard();
  const wallet = given ?? store;
  const identity = walletIdentity(wallet);
  const method = signInLabel(auth.account?.loginMethod ?? null);
  const photo = useAvatarPicker();

  return (
    <View style={styles.body}>
      <View style={styles.identity}>
        <Pressable
          onPress={() => void photo.choose()}
          disabled={photo.busy}
          accessibilityRole="button"
          accessibilityLabel={photo.avatar === null ? "Add a profile photo" : "Change your profile photo"}
          accessibilityHint="Opens your photos. The photo stays on this phone."
          accessibilityState={{ busy: photo.busy }}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <AccountAvatar mark={identity?.mark ?? null} size={60} active />
          <View style={styles.camera}>
            <Camera size={16} strokeWidth={1.75} color={color["text-primary"]} />
          </View>
        </Pressable>
        <View style={styles.flex}>
          <Text variant="body" numberOfLines={1} style={styles.name}>
            Your account
          </Text>
          {method !== null && (
            <Text variant="body" tone="secondary" numberOfLines={1} style={styles.method}>
              {method}
            </Text>
          )}
          {photo.avatar !== null && (
            <View style={styles.photoActions}>
              <Button label="Remove photo" size="sm" onPress={photo.remove} />
            </View>
          )}
        </View>
      </View>

      <View style={styles.network}>
        <CoinMark symbol="SOL" logo={SOL_LOGO} size={30} />
        <Text variant="body" numberOfLines={1} style={[styles.flex, styles.networkText]}>
          {identity?.networkLabel ?? "Solana"}
        </Text>
        <ConnectionStatusBadge wallet={wallet} />
      </View>

      {identity === null ? (
        <Text variant="body" tone="secondary">
          {wallet.isLoading ? "Reading your wallet…" : "This account has no Solana wallet yet."}
        </Text>
      ) : (
        <WalletAddressRow address={identity.address} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { gap: 16 },
  identity: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  camera: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-panel"],
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: { flexDirection: "row", marginTop: 4, marginLeft: -12 },
  name: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  method: { fontSize: 16, lineHeight: 22 },
  network: { flexDirection: "row", alignItems: "center", gap: 12 },
  networkText: { fontSize: 16, lineHeight: 22 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  statusText: { fontSize: 15, lineHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  address: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  addressText: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
});
