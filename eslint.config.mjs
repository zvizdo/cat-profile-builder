import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import unusedImports from "eslint-plugin-unused-imports";

// Framework packages the core must never import (constitution, Principle I).
const frameworkImports = [
  "react",
  "react-dom",
  "react/*",
  "react-dom/*",
  "next",
  "next/*",
  "@ai-sdk/react",
  "@tiptap/*",
  "@dnd-kit/*",
  "server-only",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "unused-imports": unusedImports },
    rules: {
      // eslint-config-next already registers the jsx-a11y plugin; only its
      // recommended rule set is added here so the plugin is not registered twice.
      ...jsxA11y.flatConfigs.recommended.rules,
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "unused-imports/no-unused-imports": "error",
      // Complexity ceilings surface as warnings; every breach is decomposed or justified
      // in review (constitution, Principle I).
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", 10],
      "max-params": ["warn", 5],
    },
  },
  {
    // Components have a tighter ceiling than plain modules (constitution, Principle I).
    files: ["src/ui/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Tests: a `describe` callback is a list of cases, not a function with logic, and an
    // argument a fake ignores is named with a leading underscore (controller ruling, T014).
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: frameworkImports,
              message: "src/core is framework-free (constitution, Principle I).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".data/**",
    ".data-e2e/**",
    ".claude/worktrees/**",
    "next-env.d.ts",
    // Design handoff and Spec Kit artifacts are documents, not application code.
    "references/**",
    "specs/**",
    ".specify/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
