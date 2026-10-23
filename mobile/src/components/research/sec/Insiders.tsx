import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { formatCompactUsd, formatPriceUsd } from "@/lib/format";
import type { CompanyInsiders, InsidersResponse } from "@/lib/research/sec/types";
import { AskButton, Card, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { shortDate } from "~/components/research/sec/parts";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   What a company's insiders did with their own shares — the website's
   InsiderActivity. From the company's recent Form 4s: who bought and who
   sold on the open market, how much, and whether a sale was scheduled in
   advance; a bar weighs the money in against the money out. Grants,
   exercises and tax withholding are pay, not decisions, and are left out.

   EDGAR is read a few filings at a time, so this asks again every few
   seconds while some are still pending, then stops.
--------------------------------------------------------------------------- */

const RETRY_MS = 4_000;
const MAX_TRIES = 8;

function Balance({ data }: { data: CompanyInsiders }) {
  const { buyValue, sellValue, buys, sells, buyers, sellers } = data.summary;
  const total = buyValue + sellValue;
  const share = total > 0 ? (buyValue / total) * 100 : 0;
  return (
    <View style={styles.balance}>
      <Text variant="label" tone="secondary">
        {buys === 0 ? "Nothing bought on the open market" : `${formatCompactUsd(buyValue)} bought · ${buys} ${buys === 1 ? "trade" : "trades"} by ${buyers} ${buyers === 1 ? "insider" : "insiders"}`}
      </Text>
      <Text variant="label" tone="secondary">
        {sells === 0 ? "Nothing sold on the open market" : `${formatCompactUsd(sellValue)} sold · ${sells} ${sells === 1 ? "trade" : "trades"} by ${sellers} ${sellers === 1 ? "insider" : "insiders"}`}
      </Text>
      <View accessible accessibilityRole="image" accessibilityLabel={`${share.toFixed(0)}% of insider money moved was buying`} style={styles.bar}>
        {buyValue > 0 && <View style={[styles.buy, { width: `${Math.max(share, 2)}%` }]} />}
        {sellValue > 0 && <View style={styles.sell} />}
      </View>
    </View>
  );
}

export function Insiders({ query }: { query: string }) {
  const now = useMinute();
  /* Reads so far for this company, so a feed stuck "pending" stops asking. */
  const tries = useRef(0);
  const feed = useResearch<InsidersResponse>(`/api/sec/insiders?q=${encodeURIComponent(query)}`, {
    timeoutMs: 45_000,
    pollMs: (data) => {
      tries.current += 1;
      if (data?.insiders && data.insiders.pending > 0 && tries.current < MAX_TRIES) return RETRY_MS;
      return null;
    },
  });
  const data = feed.data?.insiders ?? null;

  return (
    <Card>
      <View style={shared.row}>
        <Text variant="eyebrow" tone="muted" style={shared.flex}>
          Insider activity
        </Text>
        {data !== null && (
          <Text variant="label" tone="secondary">
            {data.pending > 0 ? `Reading ${data.pending} more…` : `${data.filings} Form 4s · since ${shortDate(data.since, now) ?? "—"}`}
          </Text>
        )}
      </View>
      {feed.loading ? (
        <Loading>Reading insider filings…</Loading>
      ) : feed.error !== null && feed.data === null ? (
        <Problem retry={feed.reload}>{feed.error}</Problem>
      ) : data === null ? (
        <Text variant="body-sm" tone="secondary">
          {feed.data?.error ?? "No insider filings found."}
        </Text>
      ) : data.moves.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          {data.pending > 0
            ? "Reading its recent Form 4s…"
            : `No open-market buying or selling in its last ${data.filings} insider filings — only grants, exercises and tax withholding, if anything.`}
        </Text>
      ) : (
        <>
          <Balance data={data} />
          {data.moves.slice(0, 8).map((move, index) => {
            const buy = move.kind === "buy";
            const traded = shortDate(move.tradeDate, now);
            return (
              <Pressable
                key={`${move.accession}-${move.kind}`}
                onPress={() => openExternal(move.url)}
                accessibilityRole="link"
                accessibilityHint="Opens the Form 4 on sec.gov"
                style={[styles.move, index > 0 && styles.rule]}
              >
                <View style={[styles.dot, { backgroundColor: buy ? color.positive : color["text-muted"] }]} />
                <View style={shared.flex}>
                  <Text variant="body-sm">
                    {move.insider}{" "}
                    <Text variant="body-sm" tone="secondary">
                      · {move.role}
                    </Text>
                  </Text>
                  <Text variant="label" tone="muted">
                    {buy ? "Bought" : "Sold"} {move.shares.toLocaleString("en-US")} sh
                    {move.avgPrice !== null ? ` at ~${formatPriceUsd(move.avgPrice)}` : ""}
                    {traded !== null ? ` · ${traded}` : ""}
                    {!buy && move.planned ? " · scheduled 10b5-1" : ""}
                    {!buy && move.soldAll ? " · sold everything" : ""}
                  </Text>
                </View>
                <Text variant="data" tone={buy ? "positive" : "primary"}>
                  {move.value === null ? "—" : `${buy ? "+" : "−"}${formatCompactUsd(move.value)}`}
                </Text>
                <ExternalLink size={11} strokeWidth={1.5} color={color["text-muted"]} />
              </Pressable>
            );
          })}
          <AskButton
            label="Ask Elyra what this pattern says"
            prompt={`Over its last ${data.filings} Form 4s, insiders at ${data.company ?? query} (${data.ticker ?? query}) bought ${formatCompactUsd(data.summary.buyValue)} in ${data.summary.buys} trades and sold ${formatCompactUsd(data.summary.sellValue)} in ${data.summary.sells} trades. What does this pattern suggest, and what would change that reading?`}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  balance: { gap: 2 },
  bar: { flexDirection: "row", height: 8, marginTop: 6, borderRadius: radius.pill, overflow: "hidden", backgroundColor: color["surface-hover"] },
  buy: { height: "100%", backgroundColor: color.positive },
  sell: { flex: 1, height: "100%", backgroundColor: color["surface-active"] },
  move: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingVertical: 6 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
