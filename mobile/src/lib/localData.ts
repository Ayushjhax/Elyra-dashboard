import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { forgetReferral } from "~/lib/referral";
import { useAppStore } from "~/lib/store";

/* ---------------------------------------------------------------------------
   What this phone keeps, and wiping it.

   On the device, outside Privy's own session store:
     - preferences (AsyncStorage, lib/store.ts): the selected market, chart
       settings, starred markets, recent searches, hidden balances, the
       signing setting, when the inbox was last seen;
     - in secure storage: a held referral code, the Mobile Wallet Adapter
       authorization, and whether notifications were already asked for;
     - in the cache: report and backtest PDFs that were opened or shared.

   Signing out clears the cached PDFs (one account's reports must not sit
   on the phone for the next). Deleting the account clears all of it, so the
   app is as it was installed, apart from Android's own notification
   permission, which only the system settings can take back.
--------------------------------------------------------------------------- */

const SECURE_KEYS = [
  "elyra.referral",
  "elyra.mwa.authToken",
  "elyra.mwa.address",
  "elyra.notifications-permission-requested",
  "elyra.notification-alert-prompts",
] as const;

function emptyDirectory(directory: Directory): void {
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    try {
      entry.delete();
    } catch {
      /* In use or already gone; the system clears the cache in time anyway. */
    }
  }
}

/** The account's PDFs (lib/pdf.ts), on sign-out. Never throws. */
export function clearCachedReports(): void {
  try {
    emptyDirectory(new Directory(Paths.cache, "research"));
  } catch {
    /* Nothing cached. */
  }
}

/** Everything the app stores on this phone. Never throws. */
export async function clearLocalData(): Promise<void> {
  try {
    emptyDirectory(new Directory(Paths.cache));
  } catch {
    /* Nothing cached. */
  }
  await forgetReferral();
  await Promise.all(SECURE_KEYS.map((key) => SecureStore.deleteItemAsync(key).catch(() => {})));
  useAppStore.setState(useAppStore.getInitialState(), true);
  await Promise.resolve(useAppStore.persist.clearStorage()).catch(() => {});
  await AsyncStorage.clear().catch(() => {});
}
