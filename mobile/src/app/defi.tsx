import { StyleSheet, View } from "react-native";
import { formatPct } from "@/lib/format";
import { Block, DetailScreen, ReadState, ShareBar } from "~/components/portfolio/parts";
import { EmptyState } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Money } from "~/components/ui/values";
import { Notice } from "~/components/wallet/parts";
import { useAppView } from "~/lib/stores/portfolioViews";
import { usePortfolio } from "~/lib/stores/portfolio";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   DeFi — lending, leveraged loops and vaults on Solana, by the assistant's
   own definitions (the defi_positions tool, which the chat's /defi and the
   Mini App's DeFi showed): net, supplied and borrowed value, the current
   and the protocol's liquidation LTV, leverage, and how far each position
   is from liquidation.

   Distance to liquidation is shown ONLY where the protocol publishes a
   threshold. Where it does not, the screen says so: silence would read as
   safety, and an estimate from leverage would read as fact. A protocol the
   provider has not indexed is a warning, never "no positions".

   Under it, the portfolio's own DeFi rows — rate, earnings, health factor.
--------------------------------------------------------------------------- */

const CATEGORY: Record<string, string> = { lend: "Lending", borrow: "Borrowing", lp: "Liquidity", stake: "Staking", vault: "Vault", other: "Other" };

export default function DefiScreen() {
  const defi = useAppView("defi");
  const portfolio = usePortfolio();
  const data = defi.data;
  const rows = portfolio.snapshot?.defi ?? [];

  return (
    <DetailScreen
      title="DeFi"
      refreshing={defi.refreshing}
      onRefresh={() => {
        defi.refetch();
        portfolio.refetch();
      }}
    >
      <ReadState loading={defi.loading} error={defi.error} stale={defi.stale} hasData={data !== null} onRetry={defi.refetch} refreshing={defi.refreshing} />

      {data !== null && (
        <>
          {data.warnings.map((warning) => (
            <Notice key={warning} tone="caution">
              {warning}
            </Notice>
          ))}
          {data.positions.length === 0 ? (
            <Block>
              <EmptyState
                title={data.warnings.length > 0 ? "No positions found where Elyra could look" : "No DeFi positions"}
                body="Lending, borrowing, leveraged loops and vaults from this wallet appear here with their distance to liquidation."
              />
            </Block>
          ) : (
            data.positions.map((position, index) => {
              const borrowing = position.borrowedUsd !== null && position.borrowedUsd > 0;
              return (
                <Block key={`${position.protocol}-${position.label}-${index}`} label={position.label}>
                  <View style={styles.between}>
                    <View style={styles.flex}>
                      <Text variant="body">{position.label}</Text>
                      <Text variant="label" tone="muted">
                        {position.protocol} · {position.kind}
                        {position.leverage !== null ? ` · ${position.leverage.toFixed(2)}x` : ""}
                      </Text>
                    </View>
                    <Money value={position.netUsd} reason="The protocol reported no value." variant="h2" />
                  </View>
                  <View style={styles.facts}>
                    <Fact label="Supplied">
                      <Money value={position.suppliedUsd} reason="Not reported." />
                    </Fact>
                    <Fact label="Borrowed">
                      <Money value={position.borrowedUsd} reason="Not reported." />
                    </Fact>
                    <Fact label="LTV / liq. LTV">
                      <Text variant="data">
                        {position.ltv === null ? "—" : `${(position.ltv * 100).toFixed(1)}%`} /{" "}
                        {position.liquidationLtv === null ? "—" : `${(position.liquidationLtv * 100).toFixed(1)}%`}
                      </Text>
                    </Fact>
                  </View>
                  {borrowing &&
                    (position.pctFromLiquidation === null ? (
                      <Text variant="label" tone="caution">
                        Distance to liquidation not published by the protocol.
                      </Text>
                    ) : (
                      <View style={styles.headroom}>
                        <View style={styles.between}>
                          <Text variant="label" tone="secondary">
                            Liquidation headroom
                          </Text>
                          <Text variant="data" tone={position.pctFromLiquidation < 10 ? "negative" : position.pctFromLiquidation < 25 ? "caution" : "positive"}>
                            {position.pctFromLiquidation}% from liquidation
                          </Text>
                        </View>
                        <ShareBar pct={position.pctFromLiquidation} />
                      </View>
                    ))}
                </Block>
              );
            })
          )}
          <Text variant="label" tone="muted">
            {data.source ? `Read from ${data.source}. ` : ""}
            Headroom is how far the loan-to-value can rise before the protocol&apos;s own liquidation threshold, as a share of that threshold.
            {data.incomplete ? " Some sections could not be read." : ""}
          </Text>
        </>
      )}

      {rows.length > 0 && (
        <Block label="Yield">
          <Text variant="h2" accessibilityRole="header">
            Yield
          </Text>
          {rows.map((row) => (
            <View key={row.id} style={styles.yieldRow}>
              <View style={styles.flex}>
                <Text variant="body-sm" numberOfLines={1}>
                  {row.label}
                </Text>
                <Text variant="label" tone="muted">
                  {row.protocol} · {CATEGORY[row.category] ?? row.category}
                  {row.apyPct !== null ? ` · ${formatPct(row.apyPct, { sign: false })} APY, variable` : ""}
                  {row.healthFactor !== null ? ` · health ${row.healthFactor.toFixed(2)}` : ""}
                </Text>
              </View>
              <View style={styles.right}>
                <Money value={row.suppliedUsd ?? row.valueUsd} reason="The protocol reported no value." />
                {row.earnedUsd !== null ? (
                  <Text variant="label" tone="positive">
                    earned <Money value={row.earnedUsd} sign variant="label" tone="positive" />
                  </Text>
                ) : row.borrowedUsd !== null && row.borrowedUsd > 0 ? (
                  <Text variant="label" tone="secondary">
                    borrowed <Money value={row.borrowedUsd} variant="label" tone="secondary" />
                  </Text>
                ) : (
                  <Text variant="label" tone="muted">
                    Deposited
                  </Text>
                )}
              </View>
            </View>
          ))}
          <Text variant="label" tone="muted">
            Rates are the protocol&apos;s current variable APY — they move, and are not a promised return.
          </Text>
        </Block>
      )}
    </DetailScreen>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  right: { alignItems: "flex-end" },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  fact: { width: "33%", paddingRight: 8, gap: 2 },
  headroom: { gap: 6 },
  yieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
});
