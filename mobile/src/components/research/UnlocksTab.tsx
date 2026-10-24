import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarDays, ChartNoAxesColumnIncreasing, ExternalLink, FileSearch, LockKeyhole, Users, type LucideIcon } from "lucide-react-native";
import type { UnlocksResponse } from "@/lib/research/types";
import { Card, Empty, Loading, Problem, Timestamp, dollars, percentage, styles as shared, useResearch } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Unlocks — the website's UnlocksTab and the chat's /unlocks: scheduled
   token releases over the next seven days.

   Whether a schedule source is connected is part of the answer, not an
   outage: unconnected, the tab says so and points to Reports. Connected,
   each release shows its date (and whether that date is estimated), the
   amount, its value, its share of circulating supply — the figure that
   matters — and who receives it. A release says nothing about whether
   recipients will sell.
--------------------------------------------------------------------------- */

const EXPLAIN: [LucideIcon, string, string][] = [
  [CalendarDays, "Date & token", "Upcoming releases"],
  [ChartNoAxesColumnIncreasing, "Supply impact", "Tokens entering circulation"],
  [Users, "Allocation", "Who receives the release"],
];

export function UnlocksTab({ active, onReports }: { active: boolean; onReports: () => void }) {
  const about = useRef<BottomSheetHandle>(null);
  const feed = useResearch<UnlocksResponse>(active ? "/api/research/unlocks?hours=168" : null);
  const data = feed.data;

  return (
    <View style={styles.tab}>
      {feed.loading && <Loading>Checking unlock schedules…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}

      {data?.configured === false && (
        <Card>
          <View style={shared.row}>
            <View style={styles.dot} />
            <Text variant="label" tone="secondary">
              Data source not connected
            </Text>
          </View>
          <View style={styles.lock}>
            <LockKeyhole size={32} strokeWidth={1.25} color={color["text-muted"]} />
          </View>
          <Empty
            title="Unlock data is unavailable"
            body={data.reason ?? "Schedules will appear once a data source is connected."}
            action={
              <View style={shared.row}>
                <Button label="Explore reports" size="sm" icon={<FileSearch size={14} strokeWidth={1.5} color={color["text-primary"]} />} onPress={onReports} />
                <Button label="About unlocks" size="sm" variant="ghost" onPress={() => about.current?.present()} />
              </View>
            }
          />
        </Card>
      )}

      {data?.configured === true &&
        (data.error ? (
          <Problem retry={feed.reload}>Unlock schedules could not be read. The connected source is unavailable.</Problem>
        ) : data.unlocks.length === 0 ? (
          <Empty title="No upcoming unlocks" body="No releases were found in the next seven days." />
        ) : (
          <>
            <Text variant="h2">Upcoming unlocks · 7 days</Text>
            {data.unlocks.map((unlock, index) => (
              <Card key={`${unlock.token}-${unlock.unlockAt}-${index}`}>
                <View style={shared.row}>
                  <Text variant="data" style={shared.flex}>
                    {unlock.token}
                  </Text>
                  <Text variant="data" tone={unlock.percentOfCirculating !== null && unlock.percentOfCirculating >= 1 ? "caution" : "primary"}>
                    {percentage(unlock.percentOfCirculating)}
                    <Text variant="label" tone="muted">
                      {" "}
                      of circulating
                    </Text>
                  </Text>
                </View>
                <Text variant="label" tone="secondary">
                  {new Date(unlock.unlockAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} UTC
                  {unlock.estimated ? " · estimated date" : ""} · {unlock.eventType}
                </Text>
                <Text variant="label" tone="secondary">
                  {unlock.tokenAmount?.toLocaleString("en-US") ?? "—"} tokens · {dollars(unlock.valueUsd)} · {unlock.allocation ?? "Allocation undisclosed"}
                </Text>
                <View style={shared.row}>
                  <View style={shared.flex}>
                    <Timestamp at={unlock.asOf} label={`${unlock.provider} ·`} />
                  </View>
                  {unlock.sourceUrl !== null && (
                    <Button
                      label="Source"
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={`Open ${unlock.provider}'s schedule for ${unlock.token}`}
                      icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
                      onPress={() => openExternal(unlock.sourceUrl as string)}
                    />
                  )}
                </View>
              </Card>
            ))}
          </>
        ))}

      <Card>
        {EXPLAIN.map(([Icon, title, text], index) => (
          <View key={title} style={[styles.explain, index > 0 && styles.rule]}>
            <Icon size={20} strokeWidth={1.5} color={color["text-muted"]} />
            <View style={shared.flex}>
              <Text variant="body-sm">{title}</Text>
              <Text variant="label" tone="muted">
                {text}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <BottomSheet ref={about} title="About token unlocks">
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
  tab: { gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color["text-muted"] },
  explain: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  sheet: { gap: 12, padding: 16 },
  lock: { alignItems: "center", paddingTop: 12 },
});
