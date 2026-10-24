import { act, render, screen } from "@testing-library/react-native";
import { Delta, Money, Percent, Quantity } from "~/components/ui/values";
import { useAppStore } from "~/lib/store";

/* ---------------------------------------------------------------------------
   The money primitives' three promises: an unknown figure is a dash with a
   reason, never $0.00; hiding balances masks every amount and nothing
   else; a tiny amount is not printed as zero.
--------------------------------------------------------------------------- */

beforeEach(async () => {
  await act(() => useAppStore.setState({ balancesHidden: false }));
});

describe("an unknown value", () => {
  it("is a dash that says why, never $0.00", async () => {
    await render(<Money value={null} reason="The wallet could not be read." />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByLabelText("Unavailable: The wallet could not be read.")).toBeTruthy();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("is a dash for a change and a percentage too", async () => {
    await render(
      <>
        <Delta pct={null} usd={null} reason="No 24h price." />
        <Percent value={null} reason="No share." />
      </>,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("a known value", () => {
  it("prints dollars, with a sign when asked", async () => {
    await render(
      <>
        <Money value={1234.5} />
        <Money value={12.3} sign />
      </>,
    );
    expect(screen.getByText("$1,234.50")).toBeTruthy();
    expect(screen.getByText("+$12.30")).toBeTruthy();
  });

  it("is not zero when it is merely small", async () => {
    await render(<Money value={0.004} />);
    expect(screen.getByText("<$0.01")).toBeTruthy();
  });

  it("is a true zero when it is zero", async () => {
    await render(<Money value={0} />);
    expect(screen.getByText("$0.00")).toBeTruthy();
  });

  it("compacts millions without Intl, which Hermes ignores", async () => {
    await render(<Money value={53_084_444.6} compact />);
    expect(screen.getByText("$53.1M")).toBeTruthy();
  });
});

describe("hidden balances", () => {
  it("mask every amount, and say so to a screen reader", async () => {
    await act(() => useAppStore.setState({ balancesHidden: true }));
    await render(
      <>
        <Money value={1234.5} />
        <Quantity value={2.5} />
      </>,
    );
    expect(screen.queryByText("$1,234.50")).toBeNull();
    expect(screen.queryByText("2.50")).toBeNull();
    expect(screen.getAllByLabelText("Hidden")).toHaveLength(2);
  });

  it("keep a percentage change, but not its dollar part", async () => {
    await act(() => useAppStore.setState({ balancesHidden: true }));
    await render(<Delta pct={2.5} usd={10} />);
    expect(screen.getByText("+2.50%")).toBeTruthy();
    expect(screen.queryByText(/\$10/)).toBeNull();
  });

  it("still show an unknown value as unknown, not as hidden", async () => {
    await act(() => useAppStore.setState({ balancesHidden: true }));
    await render(<Money value={null} reason="Not read yet." />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
