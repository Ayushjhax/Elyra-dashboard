import { classifyIntent } from "@/lib/personalized/intent";

// Regression cases from the web classifier, caught during funded-device QA.
it("reads allocation and risk for balances checked against a concentration limit", () => {
  const intent = classifyIntent("Show my balances as a table and check my concentration limit");
  expect(intent.task).toBe("PERSONALIZED_REASONING");
  expect(intent.facets).toEqual(expect.arrayContaining(["allocation", "risk", "memory"]));
});
it("reads plural balances and holdings even when memory was also requested", () => {
  for (const message of ["Show my balances and saved limit", "Show my holdings and saved limit"]) {
    expect(classifyIntent(message).facets).toEqual(expect.arrayContaining(["allocation", "memory"]));
  }
});
