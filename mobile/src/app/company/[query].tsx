import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ExternalLink, Landmark } from "lucide-react-native";
import { formatCompactUsd } from "@/lib/format";
import { inCategory, type EdgarCategory } from "@/lib/research/sec/forms";
import type { CompanyFiling, CompanyResponse, Fundamental } from "@/lib/research/sec/types";
import { DetailScreen } from "~/components/portfolio/parts";
import { AskButton, Card, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { Insiders } from "~/components/research/sec/Insiders";
import { CategoryChips, ItemTags } from "~/components/research/sec/parts";
import { Button } from "~/components/ui/controls";
import { CompanyMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Delta } from "~/components/ui/values";
import { openExternal } from "~/components/wallet/parts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One SEC registrant — the website's CompanyView.

   Its record (tickers, exchanges, industry, filer category, fiscal year),
   the latest quarter's figures from XBRL against the same quarter a year
   earlier, what its insiders bought and sold, and its own filings by kind.
   A figure EDGAR could not resolve is absent, not estimated; each filing
   opens on sec.gov.
--------------------------------------------------------------------------- */

function value(entry: Fundamental): string {
  if (entry.unit === "USD/shares") return `${entry.value < 0 ? "-" : ""}$${Math.abs(entry.value).toFixed(2)}`;
  if (entry.unit === "shares") return formatCompactUsd(entry.value).replace("$", "");
  return formatCompactUsd(entry.value);
}

function dateLabel(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : iso;
}

function FilingRow({ filing }: { filing: CompanyFiling }) {
  return (
    <Pressable onPress={() => openExternal(filing.url)} accessibilityRole="link" accessibilityHint="Opens the filing on sec.gov" style={styles.filing}>
      <Text variant="data-sm" tone="muted" style={styles.form}>
        {filing.form}
      </Text>
      <View style={shared.flex}>
        <Text variant="body-sm">{filing.label}</Text>
        {filing.periodEnd !== null && (
          <Text variant="label" tone="muted">
            Period {dateLabel(filing.periodEnd)}
          </Text>
        )}
        <ItemTags items={filing.items} />
      </View>
      <View style={styles.when}>
        <Text variant="data-sm" tone="muted">
          {dateLabel(filing.filedAt)}
        </Text>
        <ExternalLink size={12} strokeWidth={1.5} color={color["text-muted"]} />
      </View>
    </Pressable>
  );
}

export default function CompanyScreen() {
  const { query = "" } = useLocalSearchParams<{ query: string }>();
  const feed = useResearch<CompanyResponse>(`/api/sec/company?q=${encodeURIComponent(query)}`, { timeoutMs: 45_000 });
  const [category, setCategory] = useState<EdgarCategory>("all");
  const company = feed.data?.company ?? null;
  const filings = (company?.filings ?? []).filter((filing) => inCategory(filing.form, category));
  const quarter = company?.fundamentals.find((entry) => entry.yoyPct !== null || entry.id === "revenue")?.period ?? null;

  return (
    <DetailScreen title={company?.ticker ?? query.toUpperCase()} onRefresh={feed.reload} refreshing={feed.refreshing}>
      {feed.loading && <Loading>Reading EDGAR…</Loading>}
      {/* A 404 is an answer: EDGAR has no registrant by that name. */}
      {feed.error !== null && feed.data === null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {feed.data !== null && company === null && <Problem>{feed.data.error ?? `EDGAR has no registrant matching "${query}".`}</Problem>}
      {company !== null && (
        <View style={styles.page}>
          <View style={styles.head}>
            <CompanyMark ticker={company.ticker} size={44} />
            <View style={shared.flex}>
              <Text variant="h1">{company.name}</Text>
              <Text variant="data-sm" tone="secondary">
                {company.tickers.join(" · ")}
                {company.exchanges.length > 0 ? ` · ${company.exchanges.join(", ")}` : ""} · CIK {Number(company.cik)}
              </Text>
              <Text variant="label" tone="muted">
                {[
                  company.industry,
                  company.category,
                  company.state ? `Inc. ${company.state}` : null,
                  company.fiscalYearEnd ? `FY ends ${company.fiscalYearEnd.slice(2)}/${company.fiscalYearEnd.slice(0, 2)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
          <View style={shared.row}>
            <Button
              label="Open on EDGAR"
              size="sm"
              icon={<Landmark size={13} strokeWidth={1.5} color={color["text-primary"]} />}
              onPress={() => openExternal(company.edgarUrl)}
            />
            <AskButton
              label={`Ask Elyra about ${company.ticker}`}
              prompt={`Summarise ${company.name} (${company.ticker}) from its SEC filings: the latest quarter, what changed against a year ago, and anything material it filed recently.`}
            />
          </View>

          <Card>
            <View style={shared.row}>
              <Text variant="eyebrow" tone="muted" style={shared.flex}>
                Reported figures
              </Text>
              {quarter !== null && (
                <Text variant="label" tone="secondary">
                  {quarter} · XBRL
                </Text>
              )}
            </View>
            {company.fundamentals.length === 0 ? (
              <Text variant="body-sm" tone="secondary">
                {company.fundamentalsNote}
              </Text>
            ) : (
              <View style={styles.figures}>
                {company.fundamentals.map((entry) => (
                  <View key={entry.id} style={styles.figure}>
                    <Text variant="label" tone="muted">
                      {entry.label}
                    </Text>
                    <View style={styles.inline}>
                      <Text variant="data">{value(entry)}</Text>
                      {entry.yoyPct !== null && <Delta pct={entry.yoyPct} />}
                    </View>
                    <Text variant="label" tone="muted">
                      {entry.yoyPct !== null ? "vs a year earlier" : entry.period}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Insiders query={company.ticker} />

          <Text variant="eyebrow" tone="muted">
            Filings · {company.filings.length} most recent
          </Text>
          <CategoryChips value={category} onChange={setCategory} />
          {filings.length === 0 ? (
            <Text variant="body-sm" tone="secondary">
              None of this kind among its recent filings.
            </Text>
          ) : (
            <Card style={styles.list}>
              {filings.slice(0, 40).map((filing, index) => (
                <View key={filing.accession} style={index > 0 ? styles.rule : undefined}>
                  <FilingRow filing={filing} />
                </View>
              ))}
            </Card>
          )}
          <Text variant="label" tone="muted">
            Straight from SEC EDGAR: the filings as filed, and figures as tagged in XBRL. Not advice.
          </Text>
        </View>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  head: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 12 },
  figure: { flexBasis: "45%", flexGrow: 1, gap: 2 },
  inline: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  list: { gap: 0 },
  filing: { flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 56, paddingVertical: 10 },
  form: { width: 56 },
  when: { flexDirection: "row", alignItems: "center", gap: 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
});
