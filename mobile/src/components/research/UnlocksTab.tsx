import { useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarDays, CalendarX2, ChartNoAxesColumnIncreasing, CircleAlert, ExternalLink, FileSearch, LockKeyhole, RefreshCw, Users, type LucideIcon } from "lucide-react-native";
import type { UnlocksResponse } from "@/lib/research/types";
import { Loading, SerifHeading, TabIntro, dollars, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { utcTime } from "~/components/research/report";
import { WideButton } from "~/components/shell/flow";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Notice, openExternal } from "~/components/wallet/parts";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Unlocks — the website's UnlocksTab and the chat's /unlocks: scheduled
   token releases over the next seven days.

   Whether a schedule source is connected is part of the answer, not an
   outage: unconnected, the tab says so and points to Reports. Connected,
   each release shows its date (and whether that date is estimated), the
   amount, its value, its share of circulating supply — the figure that
   matters — and who receives it. A release says nothing about whether
   recipients will sell.

   Five states are kept apart: loading; the request failing; the source
   being unavailable; a read that found no releases; and releases. A
   failure is never shown as "no upcoming unlocks", and schedules already
   read stay on screen, marked, when a refresh fails. Try again is the
   tab's own read again, and cannot be sent twice.
--------------------------------------------------------------------------- */

const EXPLAIN: [LucideIcon, string, string][] = [
  [CalendarDays, "Date & token", "Upcoming releases"],
  [ChartNoAxesColumnIncreasing, "Supply impact", "Tokens entering circulation"],
  [Users, "Allocation", "Who receives the release"],
];

/** A failure with the way back: what happened, in words, and Try again. */
function RecoveryCard({ icon: Icon, status, title, body, retrying, onRetry, extra }: { icon: LucideIcon; status: string; title: string; body: string; retrying: boolean; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <SurfaceCard>
      <View style={styles.recoveryHead}>
        <Icon size={40} strokeWidth={1.25} color={color["text-secondary"]} />
        <View style={styles.status}>
          <CircleAlert size={18} strokeWidth={1.75} color={color.caution} />
          <Text variant="body-sm" tone="caution" style={styles.statusText}>
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.recoveryWords} accessibilityLiveRegion="polite">
        <SerifHeading size={28}>{title}</SerifHeading>
        <Text variant="body" tone="secondary" style={styles.lead}>
          {retrying ? "Trying again…" : body}
        </Text>
      </View>
      {onRetry !== undefined && <WideButton label={retrying ? "Trying again…" : "Try again"} variant="accent" leading={RefreshCw} busy={retrying} onPress={onRetry} />}
      {extra}
    </SurfaceCard>
  );
}

export function UnlocksTab({ active, onReports }: { active: boolean; onReports: () => void }) {
  const about = useRef<BottomSheetHandle>(null);
  const feed = useResearch<UnlocksResponse>(active ? "/api/research/unlocks?hours=168" : null);
  const data = feed.data;
  const retrying = feed.loading || feed.refreshing;
  /* A guard on top of the busy button: one read at a time. */
  const retry = () => {
    if (!retrying) feed.reload();
  };

  return (
    <View style={styles.tab}>
      <TabIntro title="Token unlocks" lead="Understand upcoming supply releases." />
      {feed.loading && data === null && feed.error === null && <Loading>Checking unlock schedules…</Loading>}

      {feed.error !== null && data === null && (
        <RecoveryCard icon={CalendarX2} status="Couldn't load" title="Schedules couldn't be loaded" body={feed.error} retrying={retrying} onRetry={retry} />
      )}

      {data?.configured === false && (
        <RecoveryCard
          icon={LockKeyhole}
          status="Data source not connected"
          title="Unlock data is unavailable"
          body={data.reason ?? "Schedules will appear once a data source is connected."}
          retrying={false}
          extra={
            <View style={styles.buttons}>
              <Button label="Explore reports" icon={<FileSearch size={16} strokeWidth={1.5} color={color["text-primary"]} />} onPress={onReports} />
              <Button label="About unlocks" variant="ghost" onPress={() => about.current?.present()} />
            </View>
          }
        />
      )}

      {data?.configured === true &&
        (data.error ? (
          <RecoveryCard
            icon={CalendarX2}
            status="Source unavailable"
            title="Schedules are unavailable"
            body="Unlock schedules could not be read. The connected source is unavailable."
            retrying={retrying}
            onRetry={retry}
          />
        ) : data.unlocks.length === 0 ? (
          <SurfaceCard>
            <SerifHeading size={26}>No upcoming unlocks</SerifHeading>
            <Text variant="body" tone="secondary" style={styles.lead}>
              The source was read and lists no releases in the next seven days.
            </Text>
          </SurfaceCard>
        ) : (
          <>
            {feed.error !== null && <Notice tone="caution">These are the last schedules read — the latest refresh failed. {feed.error}</Notice>}
            <SerifHeading size={28} right={<Text variant="body-sm" tone="secondary">Next 7 days</Text>}>
              Upcoming unlocks
            </SerifHeading>
            {data.unlocks.map((unlock, index) => {
              const large = unlock.percentOfCirculating !== null && unlock.percentOfCirculating >= 1;
              return (
                <SurfaceCard key={`${unlock.token}-${unlock.unlockAt}-${index}`} style={styles.unlock}>
                  <View style={styles.unlockHead}>
                    <Text variant="body" style={[shared.flex, styles.token]}>
                      {unlock.token}
                    </Text>
                    <Text variant="data" tone={large ? "caution" : "primary"} style={styles.figure}>
                      {percentage(unlock.percentOfCirculating)}
                    </Text>
                  </View>
                  <Text variant="body-sm" tone="secondary" style={styles.right}>
                    of circulating supply
                  </Text>
                  <Rule />
                  <Text variant="body" style={styles.line}>
                    {new Date(unlock.unlockAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} UTC
                    {unlock.estimated ? " · estimated date" : ""} · {unlock.eventType}
                  </Text>
                  <Text variant="body" tone="secondary" style={styles.line}>
                    {unlock.tokenAmount?.toLocaleString("en-US") ?? "—"} tokens · {dollars(unlock.valueUsd)} · {unlock.allocation ?? "Allocation undisclosed"}
                  </Text>
                  <View style={styles.sourceRow}>
                    <Text variant="body-sm" tone="secondary" style={shared.flex}>
                      {unlock.provider}
                      {utcTime(unlock.asOf) !== null ? ` · source updated ${utcTime(unlock.asOf)}` : ""}
                    </Text>
                    {unlock.sourceUrl !== null && (
                      <Button
                        label="Source"
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={`Open ${unlock.provider}'s schedule for ${unlock.token}`}
                        icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
                        onPress={() => openExternal(unlock.sourceUrl as string)}
                      />
                    )}
                  </View>
                </SurfaceCard>
              );
            })}
          </>
        ))}

      <SerifHeading size={28}>What unlock data shows</SerifHeading>
      <SurfaceCard style={styles.explainCard}>
        {EXPLAIN.map(([Icon, title, text], index) => (
          <View key={title} style={[styles.explain, index > 0 && styles.ruled]} accessible accessibilityLabel={`${title}: ${text}`}>
            <Icon size={28} strokeWidth={1.5} color={color["text-primary"]} />
            <View style={shared.flex}>
              <Text variant="body" style={styles.explainTitle}>
                {title}
              </Text>
              <Text variant="body" tone="secondary" style={styles.lead}>
                {text}
              </Text>
            </View>
          </View>
        ))}
      </SurfaceCard>

      <BottomSheet ref={about} title="About token unlocks" display>
        <View style={styles.sheet}>
          <Text variant="body-sm" tone="secondary">
            Unlocks describe scheduled supply releases, not future prices. A schedule shows when tokens become transferable, how much may enter circulation, and which allocation receives them. Estimated dates and missing values are marked when the source provides them.
          </Text>
          <Text variant="body-sm" tone="secondary">
            A release does not tell us whether recipients will sell. Schedules depend on a connected data source.
          </Text>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 16 },
  lead: { fontSize: 16, lineHeight: 23 },
  recoveryHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: color.caution },
  statusText: { fontSize: 15, lineHeight: 20 },
  recoveryWords: { gap: 6 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  unlock: { gap: 8 },
  unlockHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  token: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  figure: { fontSize: 20, lineHeight: 26 },
  right: { textAlign: "right", marginTop: -6 },
  line: { fontSize: 15, lineHeight: 21 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET },
  explainCard: { gap: 0, paddingVertical: 4 },
  explain: { flexDirection: "row", alignItems: "center", gap: 18, minHeight: 76, paddingVertical: 12 },
  explainTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  sheet: { gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
});
