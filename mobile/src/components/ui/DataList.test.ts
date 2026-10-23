import { fittingColumns, type DataColumn } from "~/components/ui/DataList";

const column = (key: string, width: number, priority?: number): DataColumn<unknown> => ({
  key,
  header: key,
  width,
  priority,
  render: () => null,
});

describe("fittingColumns", () => {
  const columns = [column("market", 120), column("entry", 90, 2), column("liq", 90, 3), column("value", 100), column("pnl", 100)];

  it("keeps every column when they fit", () => {
    expect(fittingColumns(columns, 600).map((c) => c.key)).toEqual(["market", "entry", "liq", "value", "pnl"]);
  });

  it("drops the lowest-priority column first, keeping order", () => {
    expect(fittingColumns(columns, 420).map((c) => c.key)).toEqual(["market", "entry", "value", "pnl"]);
    expect(fittingColumns(columns, 330).map((c) => c.key)).toEqual(["market", "value", "pnl"]);
  });

  it("never drops a column without a priority", () => {
    expect(fittingColumns(columns, 100).map((c) => c.key)).toEqual(["market", "value", "pnl"]);
  });
});
