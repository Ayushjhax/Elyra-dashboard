import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { OverviewCard } from "~/components/portfolio/Overview";
import { TradingActivity } from "~/components/portfolio/TradingActivity";
import { useAppStore } from "~/lib/store";
import type { PortfolioFeed } from "~/lib/stores/portfolio";

jest.mock("lucide-react-native", () => ({
  AlertTriangle: () => null, ArrowDownRight: () => null, ArrowUpRight: () => null,
  Eye: () => null, EyeOff: () => null, ExternalLink: () => null,
  Info: () => null, Check: () => null, ChevronDown: () => null,
}));
jest.mock("~/lib/auth/AuthProvider", () => ({ useElyraAuth: () => ({ solanaAddress: "wallet" }) }));
jest.mock("~/lib/stores/activity", () => ({ useWalletActivity: () => ({ items: [], loading: false, error: null }) }));
jest.mock("~/lib/stores/market", () => ({
  useAssets: () => ({ byId: new Map() }),
  useAssetsBySymbols: () => ({ bySymbol: new Map() }),
  usePrices: () => ({ rows: new Map() }),
}));
jest.mock("~/lib/stores/portfolioViews", () => ({
  usePortfolioHistory: () => ({ values: [600, 640, 673], loading: false, error: null, history: { basis: "recorded" } }),
}));
jest.mock("~/lib/useClock", () => ({ useMinute: () => 1792800000000, useSecond: () => 1792800000000 }));
jest.mock("~/components/ui/marks", () => ({ CoinMark: () => null }));
jest.mock("~/components/ui/overlays", () => ({ BottomSheet: () => null }));
jest.mock("~/components/ui/layout", () => ({
  Skeleton: () => null,
  EmptyState: ({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { View, Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(View, null, React.createElement(Text, null, title), React.createElement(Text, null, body), action);
  },
}));
jest.mock("~/components/wallet/parts", () => ({
  openExternal: jest.fn(),
  Notice: ({ children }: { children: React.ReactNode }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(Text, null, children);
  },
}));

function snapshot(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    asOf: "2026-10-24T00:00:00Z",
    summary: { totalValueUsd: 673, availableCapitalUsd: 600, unrealizedPnlUsd: null, pnl24hUsd: null, pnl24hPct: null, agentManagedPct: null, agentManagedValueUsd: null },
    scopes: [], spot: [], perps: [], defi: [], orders: [], activity: [], history: [], notes: [], partial: false,
    prediction: { connected: false, valueUsd: null, costBasisUsd: null, unrealisedPnlUsd: null, capitalAtRiskUsd: null, maxPayoutUsd: null, activeMarkets: null, resolvingWithin24h: null, resolvingWithin7d: null, claimableCount: null, claimableValueUsd: null, unavailableReason: null },
    ...overrides,
  };
}

function feed(data = snapshot()): PortfolioFeed {
  return { snapshot: data, error: null, unconfigured: false, loading: false, stale: false, fetchedAt: 1792800000000, refreshing: false, signedIn: true, refetch: jest.fn() };
}

function perpSnapshot(): PortfolioSnapshot {
  return snapshot({
    scopes: [{ id: "hyperliquid", label: "Hyperliquid", venue: "hyperliquid", chain: "ethereum", address: "wallet", valueUsd: 1000 }],
    perps: [{ id: "btc", venue: "hyperliquid", market: "BTC-PERP", side: "short", size: 0.125, entryPrice: 100000, markPrice: 99500, leverage: 3, marginUsd: 4000, liquidationPrice: 130000, notionalUsd: 12437.5, unrealizedPnlUsd: 62.5, roePct: 1.5625, fundingUsd: null }],
  });
}

beforeEach(async () => {
  await act(() => useAppStore.setState({ balancesHidden: false, marketType: "all" }));
});

describe("portfolio summary", () => {
  it("explains unavailable PnL instead of inventing a zero", async () => {
    await render(<OverviewCard feed={feed()} />);
    expect(screen.getByLabelText("Unavailable: No open position reported a PnL.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "About Open PnL" }).props.accessibilityHint).toMatch(/not zero/);
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("hides the chart and its accessible history values with balances", async () => {
    await render(<OverviewCard feed={feed()} />);
    expect(screen.getByLabelText(/Seven days: from \$600/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("switch", { name: "Hide balances" }));
    expect(screen.queryByLabelText(/Seven days: from/)).toBeNull();
    expect(screen.getByLabelText("Balance history hidden")).toBeTruthy();
    expect(screen.queryByText("$673.00")).toBeNull();
  });
});

describe("positions", () => {
  it("shows a real perp's side, leverage, open PnL and venue action", async () => {
    await render(<TradingActivity feed={feed(perpSnapshot())} />);
    expect(screen.getByText("BTC-PERP")).toBeTruthy();
    expect(screen.getByText("Short")).toBeTruthy();
    expect(screen.getByText("3×")).toBeTruthy();
    expect(screen.getByText("+$62.50")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open on Hyperliquid/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close position/ })).toBeNull();
  });

  it("masks a position's size, margin and PnL", async () => {
    await act(() => useAppStore.setState({ balancesHidden: true }));
    await render(<TradingActivity feed={feed(perpSnapshot())} />);
    expect(screen.queryByText("0.1250")).toBeNull();
    expect(screen.queryByText("$4,000.00")).toBeNull();
    expect(screen.queryByText("+$62.50")).toBeNull();
    expect(screen.getAllByLabelText("Hidden").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("$99,500.00")).toBeTruthy();
  });

  it("distinguishes an unconnected perp account from an empty one", async () => {
    await render(<TradingActivity feed={feed()} />);
    await fireEvent.press(screen.getByRole("radio", { name: "Perps" }));
    expect(screen.getByText("Connect your perps account")).toBeTruthy();
    expect(screen.queryByText("No perp positions open")).toBeNull();
  });

  it("distinguishes a failed perp read from no positions", async () => {
    await render(<TradingActivity feed={feed(snapshot({ notes: [{ scope: "hyperliquid", kind: "failed", reason: "Venue timed out" }], partial: true }))} />);
    await fireEvent.press(screen.getByRole("radio", { name: "Perps" }));
    expect(screen.getByText("Perps could not be read")).toBeTruthy();
    expect(screen.getByText("Venue timed out")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("does not leak prediction balances when balances are hidden", async () => {
    const base = snapshot();
    base.prediction = { ...base.prediction, connected: true, activeMarkets: 2, valueUsd: 212.75, unrealisedPnlUsd: 12.75 };
    await act(() => useAppStore.setState({ balancesHidden: true }));
    await render(<TradingActivity feed={feed(base)} />);
    await fireEvent.press(screen.getByRole("radio", { name: "Prediction" }));
    expect(screen.queryByText(/\$212\.75/)).toBeNull();
    expect(screen.queryByText(/\$12\.75/)).toBeNull();
    expect(screen.getAllByLabelText("Hidden")).toHaveLength(2);
  });
});
