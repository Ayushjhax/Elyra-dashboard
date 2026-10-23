import { useRef, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Check, Copy, Gift, Link2, Lock, QrCode as QrIcon, Share2, Users } from "lucide-react-native";
import { activationRateText, activationStep, plural, poolProgress } from "@/lib/referrals/display";
import type { ReferralListItem, ReferralStats } from "@/lib/referrals/types";
import { DetailScreen } from "~/components/portfolio/parts";
import { Chips } from "~/components/research/parts";
import { Button, IconButton } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { QrCode } from "~/components/ui/marks";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Notice, useCopy } from "~/components/wallet/parts";
import { useReferrals } from "~/lib/stores/referrals";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Referrals — the website's Referrals page, for a phone.

   One read carries everything already worked out on the server: points from
   the ledger, the pool from its own table, and the programme's rules from
   lib/referrals/config.ts. The screen formats the server's numbers
   (lib/referrals/display.ts) and derives no reward of its own, so what it
   promises cannot drift from what is paid.

   The invite is the website's link (getelyra.xyz/r/CODE), shared through
   the system sheet or copied. Opened on a phone with Elyra installed, it
   opens the app; anywhere else, the website — and either way the code
   follows the person to sign-up.
--------------------------------------------------------------------------- */

const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");

const joined = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="h2">{value}</Text>
      {sub !== undefined && (
        <Text variant="label" tone="secondary">
          {sub}
        </Text>
      )}
    </View>
  );
}

function Invite({ stats }: { stats: ReferralStats }) {
  const copy = useCopy();
  const qr = useRef<BottomSheetHandle>(null);
  const [copied, setCopied] = useState(false);
  const url = stats.referralUrl;
  const code = stats.referralCode;
  return (
    <View style={styles.card}>
      <Text variant="eyebrow" tone="muted">
        Your invite
      </Text>
      <Text variant="h1">Share Elyra with a friend</Text>
      <Text variant="body-sm" tone="secondary">
        Earn {stats.activationPoints} points when they activate.
      </Text>
      {url === null || code === null ? (
        <Notice tone="negative">Your referral code couldn&apos;t be created just now. Pull down to try again.</Notice>
      ) : (
        <>
          <View style={styles.link}>
            <Link2 size={16} strokeWidth={1.5} color={color["text-muted"]} />
            <Text variant="data-sm" numberOfLines={1} style={styles.flex} accessibilityLabel={`Invite link ${url}`}>
              {displayUrl(url)}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              label={copied ? "Copied" : "Copy link"}
              variant="accent"
              icon={copied ? <Check size={16} strokeWidth={1.75} color={color["text-on-accent"]} /> : <Copy size={16} strokeWidth={1.5} color={color["text-on-accent"]} />}
              onPress={async () => {
                await copy(url, "invite link");
                setCopied(true);
                setTimeout(() => setCopied(false), 2_000);
              }}
            />
            <Button
              label="Share"
              icon={<Share2 size={16} strokeWidth={1.5} color={color["text-primary"]} />}
              onPress={() => void Share.share({ message: `Join me on Elyra: ${url}`, url, title: "Elyra" }, { dialogTitle: "Share your invite" })}
            />
            <IconButton accessibilityLabel="Show QR code" onPress={() => qr.current?.present()}>
              <QrIcon size={20} strokeWidth={1.5} color={color["text-secondary"]} />
            </IconButton>
          </View>
          <View style={styles.code}>
            <Text variant="label" tone="secondary">
              Your referral code
            </Text>
            <Text variant="data">{code}</Text>
            <Button label="Copy" size="sm" variant="ghost" accessibilityLabel="Copy your referral code" onPress={() => void copy(code, "referral code")} />
          </View>
          <BottomSheet ref={qr} title="Your invite">
            <View style={styles.qr}>
              <Text variant="body-sm" tone="secondary">
                Scan to open your link on another phone.
              </Text>
              <QrCode value={url} label={`QR code for ${displayUrl(url)}`} size={208} />
              <Text variant="data-sm" tone="secondary">
                {displayUrl(url)}
              </Text>
            </View>
          </BottomSheet>
        </>
      )}
    </View>
  );
}

function Pool({ stats }: { stats: ReferralStats }) {
  const pool = stats.pool;
  const { filled, remaining } = poolProgress(pool);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="eyebrow" tone="muted">
            Activation pool
          </Text>
          <Text variant="h2">Your next milestone</Text>
        </View>
        <Gift size={22} strokeWidth={1.5} color={color.accent} />
      </View>
      <Text variant="display">
        {filled}
        <Text variant="h2" tone="muted">
          {" "}
          / {pool.target} activations
        </Text>
      </Text>
      {/* A marker fills only for an activation the server has counted into this pool. */}
      <View style={styles.markers} accessible accessibilityLabel={`${filled} of ${pool.target} activations in this pool`}>
        {Array.from({ length: pool.target }, (_, index) => (
          <View key={index} style={[styles.marker, index < filled && styles.markerOn]}>
            {index < filled && <Check size={10} strokeWidth={2.5} color={color["text-on-accent"]} />}
          </View>
        ))}
      </View>
      <Text variant="body-sm" tone="secondary">
        {plural(remaining, "activation")} to your next bonus.
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="label" tone="muted">
            Next bonus
          </Text>
          <Text variant="data">+{pool.nextBonusPoints.toLocaleString("en-US")} pts</Text>
        </View>
        <InfoTip
          label={`Unlocks at ${pool.target} activations`}
          icon={<Lock size={18} strokeWidth={1.5} color={color["text-muted"]} />}
          text={`Locked until ${plural(remaining, "more activation")}. Unlocks at ${pool.target} activations.`}
        />
      </View>
      <Text variant="label" tone="muted">
        Your pool restarts after each bonus.{pool.completedPools > 0 ? ` ${plural(pool.completedPools, "bonus", "bonuses")} earned so far.` : ""}
      </Text>
    </View>
  );
}

function HowItWorks({ stats }: { stats: ReferralStats }) {
  const steps = [
    { title: "Share your link", body: "Send your invite to a friend." },
    { title: "They join", body: "They create an account through your link." },
    { title: "They activate", body: activationStep(stats.activationRequirement) },
    { title: "You earn", body: `${stats.activationPoints} points per activation, plus pool bonuses.` },
  ];
  return (
    <View style={styles.section}>
      <Text variant="h2">How it works</Text>
      {steps.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <Text variant="data" tone="muted" style={styles.number}>
            {String(index + 1).padStart(2, "0")}
          </Text>
          <View style={styles.flex}>
            <Text variant="body-sm">{step.title}</Text>
            <Text variant="label" tone="secondary">
              {step.body}
            </Text>
          </View>
        </View>
      ))}
      <Text variant="label" tone="muted">
        Each pool of {stats.pool.target} activations adds {stats.pool.nextBonusPoints} bonus points, and the pool repeats.
      </Text>
    </View>
  );
}

type Filter = "all" | "pending" | "activated" | "not_eligible";

const STATUS: Record<ReferralListItem["status"], { label: string; tone: "positive" | "secondary" | "muted" }> = {
  activated: { label: "Activated", tone: "positive" },
  pending: { label: "Pending", tone: "secondary" },
  not_eligible: { label: "Not eligible", tone: "muted" },
};

function List({ referrals }: { referrals: ReferralListItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? referrals : referrals.filter((entry) => entry.status === filter);
  const options: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "activated", label: "Activated" },
    /* Offered only when it exists: most accounts never see one. */
    ...(referrals.some((entry) => entry.status === "not_eligible") ? [{ value: "not_eligible" as const, label: "Not eligible" }] : []),
  ];
  return (
    <View style={styles.card}>
      <Text variant="h2">Your referrals</Text>
      <Text variant="label" tone="secondary">
        Follow each invite from join to activation.
      </Text>
      {referrals.length === 0 ? (
        <View style={styles.empty}>
          <Users size={26} strokeWidth={1.4} color={color["text-muted"]} />
          <Text variant="body-sm">Your first invite starts here</Text>
          <Text variant="label" tone="secondary">
            Share your link. Elyra takes care of the tracking.
          </Text>
        </View>
      ) : (
        <>
          <Chips<Filter> label="Show" value={filter} onChange={setFilter} options={options} />
          {shown.length === 0 ? (
            <Text variant="body-sm" tone="secondary">
              No {options.find((option) => option.value === filter)?.label.toLowerCase()} referrals.
            </Text>
          ) : (
            shown.map((entry, index) => {
              const status = STATUS[entry.status];
              return (
                <View key={entry.id} style={[styles.referral, index > 0 && styles.rule]}>
                  <View style={styles.avatar}>
                    <Text variant="label">{entry.initials}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body-sm" numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Text variant="label" tone="muted">
                      Joined {joined(entry.joinedAt)} ·{" "}
                      <Text variant="label" tone={status.tone}>
                        {status.label}
                      </Text>
                    </Text>
                  </View>
                  <Text variant="data-sm" tone={entry.pointsAwarded === null ? "muted" : "positive"}>
                    {entry.pointsAwarded === null ? "—" : `+${entry.pointsAwarded.toLocaleString("en-US")} pts`}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

export default function ReferralsScreen() {
  const feed = useReferrals();
  const data = feed.data;
  const stats = data?.stats ?? null;
  return (
    <DetailScreen title="Referrals" onRefresh={feed.refetch} refreshing={feed.refreshing}>
      <Text variant="h1">A little better, together</Text>
      {feed.loading && (
        <View style={styles.section} accessibilityLabel="Loading your referrals">
          <Skeleton height={80} />
          <Skeleton height={180} />
        </View>
      )}
      {feed.error !== null && stats === null && <Notice tone={feed.unconfigured ? "caution" : "negative"}>{feed.error}</Notice>}
      {feed.stale && feed.error !== null && stats !== null && <Notice tone="caution">The latest refresh failed, so these are the last figures read. {feed.error}</Notice>}
      {stats !== null && data !== null && (
        <>
          <View style={styles.stats}>
            <Stat label="Total points" value={stats.totalPoints.toLocaleString("en-US")} />
            <Stat label="Referrals" value={stats.totalReferrals.toLocaleString("en-US")} sub={`${stats.activatedReferrals.toLocaleString("en-US")} activated`} />
            <Stat label="Activation rate" value={activationRateText(stats.activationRate)} />
            <Stat label="Bonus earned" value={`${stats.bonusPoints.toLocaleString("en-US")} pts`} />
          </View>
          <Invite stats={stats} />
          <Pool stats={stats} />
          <HowItWorks stats={stats} />
          <List referrals={data.referrals} />
        </>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { gap: 10 },
  stats: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: 12 },
  stat: { flexBasis: "45%", flexGrow: 1, gap: 2 },
  card: { gap: 10, padding: 16, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"] },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  code: { flexDirection: "row", alignItems: "center", gap: 8 },
  qr: { alignItems: "center", gap: 12, padding: 16 },
  markers: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color["surface-panel"],
  },
  markerOn: { borderColor: color["accent-quiet"], backgroundColor: color["accent-quiet"] },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  number: { width: 28 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 16 },
  referral: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 6 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: color["surface-hover"] },
});
