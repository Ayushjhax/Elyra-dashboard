import { formatPriceUsd } from "@/lib/format";
import { formatAnswerText } from "~/lib/personalized/format";
it("formats small USD prices, comma-grouped figures and scientific notation through instrument precision", () => {
  expect(formatAnswerText("Price $0.00002345, total $1,234.56; $1e-8")).toBe(
    `Price ${formatPriceUsd(0.00002345)}, total ${formatPriceUsd(1234.56)}; ${formatPriceUsd(1e-8)}`,
  );
});
it("leaves percentages and token quantities alone", () => {
  expect(formatAnswerText("25% in SOL, 1.25 SOL")).toBe("25% in SOL, 1.25 SOL");
});
