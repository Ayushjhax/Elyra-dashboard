// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", ".expo/*"],
  },
  {
    /* No colour values outside the theme: every colour comes from the brand
       tokens (CLAUDE.md). src/theme/tokens.test.ts enforces the same rule
       for hex and rgb() literals ESLint's selector cannot see in templates. */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/theme/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message: "No colour literals outside src/theme — use a brand token.",
        },
        {
          selector: "Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]",
          message: "No colour literals outside src/theme — use a brand token.",
        },
      ],
    },
  },
]);
