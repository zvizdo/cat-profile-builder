import { defineConfig, devices } from "@playwright/test";
import { E2E_DATA_DIR } from "./tests/e2e/global-setup";

const isCI = process.env.CI === "true";

// End-to-end runs drive the production build with the filesystem store over `.data-e2e`
// (wiped by the global setup, so every run starts empty) and the fake model (ADR-012), so
// nothing reaches GCS or Gemini. Coverage is never collected here (constitution, Principle
// III). Port 3100 keeps a `pnpm dev` left on 3000 from being reused by mistake.
//
// The sign-in values are test fixtures, not secrets: the HMAC below is of the password
// `catsarecool` keyed by the throwaway secret, and both are exactly what the specs type.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One worker: the list and media journeys share the one store and count its cats.
  workers: 1,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start -p 3100",
    url: "http://localhost:3100/cats",
    reuseExistingServer: !isCI,
    env: {
      STORE: "fs",
      DATA_DIR: E2E_DATA_DIR,
      MODEL: "fake",
      PUBLIC_BASE_URL: "http://localhost:3100",
      SESSION_SECRET: "e2e-session-secret-not-a-secret",
      SHELTER_USERNAME: "volunteer",
      SHELTER_PASSWORD_HMAC: "0386af9ea64b97072cfca0b7851bc51e8acfb7edc256d3d2d8c32b9f915bd372",
      // Opens the dev-only /kit sheet in this production build, and nowhere else.
      KIT_ENABLED: "1",
    },
  },
});
