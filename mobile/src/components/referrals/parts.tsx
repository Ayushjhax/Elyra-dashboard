import { useEffect, useRef, useState } from "react";
import { Text as NativeText, Pressable, Share, StyleSheet, View, useWindowDimensions } from "react-native";
import { Check, Copy, Gift, Link2, Lock, LockOpen, QrCode as QrIcon, Share2, Users } from "lucide-react-native";
import { activationRateText, activationStep, plural, poolProgress } from "@/lib/referrals/display";
import type { ReferralListItem, ReferralStats } from "@/lib/referrals/types";
import { Chips } from "~/components/research/parts";
import { InfoTip } from "~/components/ui/InfoTip";
import { QrCode } from "~/components/ui/marks";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Notice, useCopy } from "~/components/wallet/parts";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Referrals screen's sections: the metrics, the invite, the activation
   pool, how it works, and the list. Each takes the server's figures and
   formats them (lib/referrals/display.ts); none computes a reward.
--------------------------------------------------------------------------- */

const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");

const joined = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const COPIED_MS = 2_000;

/** The system share sheet with the invite. Dismissing it is not a failure. */
function shareInvite(url: string): void {
  void Share.share({ message: `Join me on Elyra: ${url}`, url, title: "Elyra" }, { dialogTitle: "Share your invite" }).catch(() => {});
}

/** A copy that says so for a moment, cleaned up if the screen goes first. */
function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  return [
    copied,
    () => {
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    },
  ];
}

/** A serif heading inside a card. */
function CardTitle({ children, size = 30 }: { children: string; size?: number }) {
  return (
    <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={[styles.cardTitle, { fontSize: size, lineHeight: Math.round(size * 1.2) }]}>
      {children}
    </NativeText>
  );
}

function Stat({ label, value, sub, right = false, bottom = false }: { label: string; value: string; sub?: string; right?: boolean; bottom?: boolean }) {
  return (
    <View style={[styles.stat, right && styles.statRight, bottom && styles.statBottom]} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ""}`}>
      <Text variant="body" tone="secondary" style={styles.statLabel}>
        {label}
      </Text>
      <Text variant="price" style={styles.statValue}>
        {value}
      </Text>
      {sub !== undefined && (
        <Text variant="body" tone="secondary" style={styles.statSub}>
          {sub}
        </Text>
      )}
    </View>
  );
}

/** Total points, referrals, activation rate and bonus — the server's figures, two by two. */
export function ReferralMetrics({ stats }: { stats: ReferralStats }) {
  return (
    <View style={styles.metrics}>
      <View style={styles.metricsRow}>
        <Stat label="Total points" value={stats.totalPoints.toLocaleString("en-US")} />
        <Stat right label="Referrals" value={stats.totalReferrals.toLocaleString("en-US")} sub={`${stats.activatedReferrals.toLocaleString("en-US")} activated`} />
      </View>
      <View style={styles.metricsRule} />
      <View style={styles.metricsRow}>
        <Stat bottom label="Activation rate" value={activationRateText(stats.activationRate)} />
        <Stat bottom right label="Bonus earned" value={`${stats.bonusPoints.toLocaleString("en-US")} pts`} />
      </View>
    </View>
  );
}

export function InviteCard({ stats }: { stats: ReferralStats }) {
  const copy = useCopy();
  const qr = useRef<BottomSheetHandle>(null);
  const [copied, markCopied] = useCopied();
  /* Three buttons in one row need a wider phone; on a narrow one, Copy link
     takes its own row so no label is cut. */
  const { width, fontScale } = useWindowDimensions();
  const oneRow = width / Math.max(1, fontScale) >= 400;
  const url = stats.referralUrl;
  const code = stats.referralCode;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text variant="eyebrow" tone="secondary">
            Your invite
          </Text>
          <CardTitle>Share Elyra with a friend</CardTitle>
        </View>
        <Gift size={28} strokeWidth={1.5} color={color["accent-hover"]} />
      </View>
      <Text variant="body" tone="secondary" style={styles.lead}>
        Earn {stats.activationPoints.toLocaleString("en-US")} points when they activate.
      </Text>
      {url === null || code === null ? (
        <Notice tone="negative">Your referral code couldn&apos;t be created just now. Pull down to try again.</Notice>
      ) : (
        <>
          <View style={styles.link}>
            <Link2 size={22} strokeWidth={1.5} color={color["text-secondary"]} />
            <Text variant="body" numberOfLines={1} style={[styles.flex, styles.linkText]} accessibilityLabel={`Invite link ${url}`}>
              {displayUrl(url)}
            </Text>
          </View>
          <View style={[styles.actions, !oneRow && styles.actionsStacked]}>
            <Pressable
              onPress={async () => {
                await copy(url, "invite link");
                markCopied();
              }}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Copied the invite link" : "Copy link"}
              style={({ pressed }) => [styles.action, styles.actionAccent, oneRow && styles.actionWide, pressed && styles.actionAccentPressed]}
            >
              {copied ? (
                <Check size={22} strokeWidth={1.75} color={color["text-on-accent"]} />
              ) : (
                <Copy size={22} strokeWidth={1.5} color={color["text-on-accent"]} />
              )}
              <Text variant="body" tone="on-accent" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.actionText}>
                {copied ? "Copied" : "Copy link"}
              </Text>
            </Pressable>
            <View style={[styles.actions, oneRow && styles.actionWide]}>
              <Pressable
                onPress={() => shareInvite(url)}
                accessibilityRole="button"
                accessibilityLabel="Share your invite"
                style={({ pressed }) => [styles.action, styles.actionWide, pressed && styles.pressed]}
              >
                <Share2 size={22} strokeWidth={1.5} color={color["text-primary"]} />
                <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.actionText}>
                  Share
                </Text>
              </Pressable>
              <Pressable
                onPress={() => qr.current?.present()}
                accessibilityRole="button"
                accessibilityLabel="Show the QR code for your invite"
                style={({ pressed }) => [styles.action, styles.actionSquare, pressed && styles.pressed]}
              >
                <QrIcon size={24} strokeWidth={1.5} color={color["text-primary"]} />
              </Pressable>
            </View>
          </View>
          <View style={styles.code}>
            <Text variant="body" tone="secondary" style={styles.codeLabel}>
              Your referral code
            </Text>
            <Text variant="data" style={[styles.codeValue, styles.flex]} selectable>
              {code}
            </Text>
            <Pressable
              onPress={() => void copy(code, "referral code")}
              accessibilityRole="button"
              accessibilityLabel="Copy your referral code"
              style={styles.codeCopy}
            >
              <Text variant="body" tone="secondary" style={styles.codeLabel}>
                Copy
              </Text>
            </Pressable>
          </View>
          <BottomSheet ref={qr} title="Your invite" display>
            <View style={styles.qr}>
              <Text variant="body" tone="secondary" style={styles.lead}>
                Scan to open your link on another phone.
              </Text>
              {/* Drawn from the invite link itself (lib/qr.ts), so it scans to exactly what Copy link copies. */}
              <View style={styles.qrFrame}>
                <QrCode value={url} label={`QR code for ${displayUrl(url)}`} size={224} />
              </View>
              <Text variant="body" tone="secondary">
                {displayUrl(url)}
              </Text>
            </View>
          </BottomSheet>
        </>
      )}
    </View>
  );
}

/** The current pool: its filled slots of the target, what is left, and the bonus it unlocks. */
export function ActivationMilestone({ stats }: { stats: ReferralStats }) {
  const pool = stats.pool;
  const { filled, remaining } = poolProgress(pool);
  const unlocked = remaining === 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text variant="eyebrow" tone="secondary">
            Activation pool
          </Text>
          <CardTitle size={28}>Your next milestone</CardTitle>
        </View>
        <Gift size={28} strokeWidth={1.5} color={color["accent-hover"]} />
      </View>
      <View style={styles.count} accessible accessibilityLabel={`${filled} of ${pool.target} activations in this pool`}>
        <Text variant="display" style={styles.countValue}>
          {String(filled)}
        </Text>
        <Text variant="body" tone="secondary" style={styles.countOf}>
          / {pool.target} activations
        </Text>
      </View>
      {/* A marker fills only for an activation the server has counted into this pool. */}
      <View style={styles.markers} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: pool.target }, (_, index) => (
          <View key={index} style={[styles.marker, index < filled && styles.markerOn]}>
            {index < filled && <Check size={16} strokeWidth={2.5} color={color["text-on-accent"]} />}
          </View>
        ))}
      </View>
      <Text variant="body" tone="secondary" style={styles.lead}>
        {unlocked ? "This pool is complete — its bonus is on its way." : `${plural(remaining, "activation")} to your next bonus.`}
      </Text>
      <View style={styles.bonus}>
        <View style={styles.flex}>
          <Text variant="body" tone="secondary" style={styles.statLabel}>
            Next bonus
          </Text>
          <Text variant="body" style={styles.bonusValue}>
            +{pool.nextBonusPoints.toLocaleString("en-US")} pts
          </Text>
        </View>
        <InfoTip
          label={unlocked ? "Bonus unlocked" : `Unlocks at ${pool.target} activations`}
          icon={unlocked ? <LockOpen size={26} strokeWidth={1.5} color={color["accent-hover"]} /> : <Lock size={26} strokeWidth={1.5} color={color["text-secondary"]} />}
          text={unlocked ? "This pool's bonus is unlocked." : `Locked until ${plural(remaining, "more activation")}. Unlocks at ${pool.target} activations.`}
        />
      </View>
      <Text variant="body" tone="secondary" style={styles.foot}>
        Your pool restarts after each bonus.{pool.completedPools > 0 ? ` ${plural(pool.completedPools, "bonus", "bonuses")} earned so far.` : ""}
      </Text>
    </View>
  );
}

/** The four steps, numbered, with the server's own activation rule and reward. */
export function ReferralSteps({ stats }: { stats: ReferralStats }) {
  const steps = [
    { title: "Share your link", body: "Send your invite to a friend." },
    { title: "They join", body: "They create an account through your link." },
    { title: "They activate", body: activationStep(stats.activationRequirement) },
    { title: "You earn", body: `${stats.activationPoints.toLocaleString("en-US")} points per activation, plus pool bonuses.` },
  ];
  return (
    <View style={styles.section}>
      <CardTitle size={30}>How it works</CardTitle>
      <View>
        {steps.map((step, index) => (
          <View key={step.title} style={styles.step} accessible accessibilityLabel={`Step ${index + 1}: ${step.title}. ${step.body}`}>
            <View style={styles.stepRail}>
              <View style={styles.stepRing}>
                <Text variant="data" tone="accent" allowFontScaling={false} style={styles.stepNumber}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              </View>
              {index < steps.length - 1 && <View style={styles.stepLine} />}
            </View>
            <View style={styles.stepWords}>
              <Text variant="body" style={styles.stepTitle}>
                {step.title}
              </Text>
              <Text variant="body" tone="secondary" style={styles.stepBody}>
                {step.body}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text variant="body" tone="secondary" style={styles.foot}>
        Every {stats.pool.target} activations adds {stats.pool.nextBonusPoints.toLocaleString("en-US")} bonus points. The pool then repeats.
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

export function ReferralList({ referrals, url }: { referrals: ReferralListItem[]; url: string | null }) {
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
      <View style={styles.listHead}>
        <CardTitle size={28}>Your referrals</CardTitle>
        <Text variant="body" tone="secondary" style={styles.lead}>
          Follow each invite from join to activation.
        </Text>
      </View>
      {referrals.length === 0 ? (
        <View style={styles.empty}>
          <Users size={40} strokeWidth={1.25} color={color["text-secondary"]} />
          <CardTitle size={24}>Your first invite starts here</CardTitle>
          <Text variant="body" tone="secondary" style={[styles.lead, styles.center]}>
            Share your link. Elyra tracks the rest.
          </Text>
          {url !== null && (
            <Pressable
              onPress={() => shareInvite(url)}
              accessibilityRole="button"
              accessibilityLabel="Share invite"
              style={({ pressed }) => [styles.shareInvite, pressed && styles.pressed]}
            >
              <Share2 size={22} strokeWidth={1.5} color={color["accent-hover"]} />
              <Text variant="body" style={styles.shareInviteText}>
                Share invite
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <Chips<Filter> label="Show" value={filter} onChange={setFilter} options={options} />
          {shown.length === 0 ? (
            <Text variant="body" tone="secondary">
              No {options.find((option) => option.value === filter)?.label.toLowerCase()} referrals.
            </Text>
          ) : (
            <View>
              {shown.map((entry, index) => {
                const status = STATUS[entry.status];
                return (
                  <View
                    key={entry.id}
                    style={[styles.referral, index > 0 && styles.rule]}
                    accessible
                    accessibilityLabel={`${entry.name}, joined ${joined(entry.joinedAt)}, ${status.label}${entry.pointsAwarded === null ? "" : `, ${entry.pointsAwarded} points`}`}
                  >
                    <View style={styles.avatar}>
                      <Text variant="body" style={styles.initials}>
                        {entry.initials}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text variant="body" numberOfLines={1} style={styles.stepTitle}>
                        {entry.name}
                      </Text>
                      <Text variant="body-sm" tone="secondary">
                        Joined {joined(entry.joinedAt)} ·{" "}
                        <Text variant="body-sm" tone={status.tone}>
                          {status.label}
                        </Text>
                      </Text>
                    </View>
                    <Text variant="data" tone={entry.pointsAwarded === null ? "muted" : "positive"} style={styles.points}>
                      {entry.pointsAwarded === null ? "—" : `+${entry.pointsAwarded.toLocaleString("en-US")} pts`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  pressed: { backgroundColor: color["surface-hover"] },
  section: { gap: 16 },
  card: { gap: 16, padding: 20, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"] },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], letterSpacing: -0.3, marginTop: 4 },
  lead: { fontSize: 16, lineHeight: 23 },
  foot: { fontSize: 15, lineHeight: 21 },
  /* metrics */
  metrics: { borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-panel"], paddingHorizontal: 20 },
  metricsRow: { flexDirection: "row" },
  metricsRule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
  stat: { flex: 1, minWidth: 0, gap: 4, paddingTop: 18, paddingBottom: 16, paddingRight: 12 },
  statRight: { paddingLeft: 20, paddingRight: 0, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-subtle"] },
  statBottom: { paddingBottom: 18 },
  statLabel: { fontSize: 15, lineHeight: 20 },
  statValue: { fontSize: 28, lineHeight: 34 },
  statSub: { fontSize: 15, lineHeight: 20 },
  /* invite */
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  linkText: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  actions: { flexDirection: "row", gap: 10 },
  actionsStacked: { flexDirection: "column" },
  action: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
  },
  actionWide: { flex: 1, minWidth: 0 },
  actionSquare: { width: 56, paddingHorizontal: 0 },
  actionAccent: { backgroundColor: color["accent-hover"], borderColor: color["accent-hover"] },
  actionAccentPressed: { backgroundColor: color.accent },
  actionText: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, flexShrink: 1 },
  code: { flexDirection: "row", alignItems: "center", columnGap: 12 },
  codeLabel: { fontSize: 15, lineHeight: 21 },
  codeValue: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23, letterSpacing: 0.5 },
  codeCopy: { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 6 },
  qr: { alignItems: "center", gap: 16, paddingHorizontal: 20, paddingBottom: 16 },
  qrFrame: { padding: 12, borderRadius: radius.panel, backgroundColor: color["text-primary"] },
  /* pool */
  count: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  countValue: { fontSize: 56, lineHeight: 62 },
  countOf: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26 },
  markers: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  markerOn: { borderColor: color["accent-hover"], backgroundColor: color["accent-hover"] },
  bonus: { flexDirection: "row", alignItems: "center", gap: 12 },
  bonusValue: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },
  /* steps */
  step: { flexDirection: "row", gap: 18 },
  stepRail: { width: 44, alignItems: "center" },
  stepRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: color["accent-hover"], alignItems: "center", justifyContent: "center" },
  stepNumber: { fontSize: 15, lineHeight: 19 },
  stepLine: { width: 1.5, flex: 1, minHeight: 12, backgroundColor: color["border-strong"] },
  stepWords: { flex: 1, minWidth: 0, gap: 2, paddingTop: 2, paddingBottom: 20 },
  stepTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  stepBody: { fontSize: 15, lineHeight: 21 },
  /* list */
  listHead: { gap: 4 },
  empty: { alignItems: "center", gap: 8, paddingTop: 8 },
  shareInvite: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 56,
    marginTop: 12,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["accent-hover"],
  },
  shareInviteText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 22 },
  referral: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color["surface-hover"] },
  initials: { fontFamily: fontFamily("sans", 500), fontSize: 15 },
  points: { fontSize: 15, lineHeight: 21 },
});
