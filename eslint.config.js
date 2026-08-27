import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        document: "readonly",
        Event: "readonly",
        HTMLElement: "readonly",
        HTMLSelectElement: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["packages/cesium-copc/src/epsg-definitions.ts"],
    rules: {
      "no-loss-of-precision": "off",
    },
  },
);
