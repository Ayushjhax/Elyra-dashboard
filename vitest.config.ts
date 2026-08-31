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
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
