import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser }
  },
  // Plain JS/CJS files (Node scripts, config, test helpers like
  // playwright-helpers.js) run under Node, not the browser — they need
  // Node globals (require, process, module, __dirname, etc.).
  {
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  tseslint.configs.recommended,
  // TS-specific rules should only apply to TS files. Plain .js files
  // (like CommonJS Playwright helpers) are allowed to use require().
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  pluginReact.configs.flat.recommended,
  // react/prop-types is redundant (and unreliable) on TS files: the
  // TypeScript compiler already enforces prop shapes, and the rule
  // can't see types threaded through React.forwardRef generics.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "react/prop-types": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);
