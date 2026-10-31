import { StyleSheet, View } from "react-native";
import { ActivationMilestone, InviteCard, ReferralList, ReferralMetrics, ReferralSteps } from "~/components/referrals/parts";
import { WideButton } from "~/components/shell/flow";
import { SettingsPage } from "~/components/shell/settings";
import { Skeleton } from "~/components/ui/layout";
import { Notice } from "~/components/wallet/parts";
import { useReferrals } from "~/lib/stores/referrals";
import { radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Referrals — the website's Referrals page, for a phone.

   One read carries everything already worked out on the server: points from
   the ledger, the pool from its own table, and the programme's rules from
   lib/referrals/config.ts. The screen formats the server's numbers
   (lib/referrals/display.ts) and derives no reward of its own, so what it
   promises cannot drift from what is paid — the points per activation, the
   pool's size and bonus, and what activating takes are all the server's.
   The pool shows the CURRENT pool's slots, never lifetime activations.

   The invite is the website's link (getelyra.xyz/r/CODE), shared through
   the system sheet, copied, or shown as a QR code drawn from the link
   itself. Opened on a phone with Elyra installed, it opens the app;
   anywhere else, the website — and either way the code follows the person
   to sign-up.
--------------------------------------------------------------------------- */

export default function ReferralsScreen() {
  const feed = useReferrals();
  const data = feed.data;
  const stats = data?.stats ?? null;
  return (
    <SettingsPage title="Referrals" subtitle="A little better, together." onRefresh={feed.refetch} refreshing={feed.refreshing}>
      {feed.loading && (
        <View style={styles.section} accessibilityLabel="Loading your referrals">
          <Skeleton height={150} rounded={radius.sheet} />
          <Skeleton height={260} rounded={radius.sheet} />
        </View>
      )}
      {feed.error !== null && stats === null && !feed.loading && (
        <View style={styles.section}>
          <Notice tone={feed.unconfigured ? "caution" : "negative"}>{feed.error}</Notice>
          {!feed.unconfigured && <WideButton label="Try again" variant="outline" busy={feed.refreshing} onPress={feed.refetch} />}
        </View>
      )}
      {feed.stale && feed.error !== null && stats !== null && <Notice tone="caution">The latest refresh failed, so these are the last figures read. {feed.error}</Notice>}
      {stats !== null && data !== null && (
        <>
          <ReferralMetrics stats={stats} />
          <InviteCard stats={stats} />
          <ActivationMilestone stats={stats} />
          <ReferralSteps stats={stats} />
          <ReferralList referrals={data.referrals} url={stats.referralUrl} />
        </>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
});
