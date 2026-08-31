import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Every test in this repo exercises server code — provider adapters, the tool
 * registry, request signing, the Telegram webhook — so the environment is
 * node, not jsdom. No component is under test.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      /*
       * `server-only` ships two entries: a no-op under the `react-server`
       * export condition, and one that throws everywhere else, so that
       * importing a server module from a client bundle is a build error.
       * Vitest externalises the package and resolves it through Node, which
       * picks the throwing entry — every suite touching a server module then
       * fails on import. Point it at the no-op directly; `resolve.conditions`
       * does not reach an externalised dependency.
       *
       * Next still enforces the real boundary at build time. This only tells
       * the test runner which half of the package applies to it.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
