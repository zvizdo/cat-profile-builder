import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Coverage is measured over the unit, component and contract projects only; Playwright
// never feeds it (constitution, Principle III). Thresholds: core 95/95, app 80/80.
// This is the single exclusion list; every entry says why (ADR-012).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // The server-only marker has no runtime meaning in tests (see tests/setup/server-only.ts).
      "server-only": new URL("./tests/setup/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        // Type-only declarations: nothing executes.
        "src/**/*.d.ts",
        // The port interfaces (contracts/ports.md) are types only; their guarantees are
        // executed and asserted through the fakes by tests/contract/*.suite.ts.
        "src/core/ports/**",
        // The document shell is static markup with no branch to assert on.
        "src/app/layout.tsx",
        // A single framework redirect call; Next's own tests cover redirect().
        "src/app/page.tsx",
        // Orchestration only (shells out to ffmpeg, calls sharp against real files on
        // disk); its pure parts live in scripts/lib/fixtures.ts and are unit-tested there.
        // Verified instead by re-running `pnpm make-fixtures` and diffing CHECKSUMS.sha256
        // (T005 brief) — no ffmpeg in unit tests.
        "scripts/make-fixtures.ts",
        // The terminal side of `pnpm make-credentials` (a raw-mode hidden prompt, stdin,
        // exit codes); every piece of logic it calls — makeCredentials, parseArgs, the
        // renderers and the refuse-to-overwrite writer — is unit-tested in
        // src/core/auth/credentials.ts and scripts/lib/make-credentials.ts. Verified
        // instead by running it for real against the dev deployment (F17 brief).
        "scripts/make-credentials.ts",
        // Orchestration only (writes real files under DATA_DIR through the real fs
        // adapters and shells out to ffmpeg via the real video pipeline); every piece of
        // logic it calls — buildRoster, checkReadiness, finalizeUpload, publish, trimVideo
        // — is unit- and contract-tested elsewhere. Verified instead by running `pnpm seed`
        // against a scratch DATA_DIR and reading the profiles back (T041 brief).
        "scripts/seed.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        "src/core/**": { lines: 95, branches: 95 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/component.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          environment: "node",
          include: ["tests/contract/**/*.test.ts"],
        },
      },
    ],
  },
});
