import { describe, expect, it } from "vitest";
import { loadConfig } from "@/adapters/config";
import { InternalError } from "@/core/errors";

// The smallest environment that boots: memory store, fake model, one shelter account.
const VALID = {
  STORE: "memory",
  PUBLIC_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "sixteen-characters-long",
  SHELTER_USERNAME: "shelter",
  SHELTER_PASSWORD_HMAC: "a".repeat(64),
};

function bootError(env: Record<string, string | undefined>): InternalError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof InternalError) return error;
    throw error;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig", () => {
  it("fills in every default", () => {
    const config = loadConfig({ ...VALID, STORE: undefined });
    expect(config).toMatchObject({
      STORE: "fs",
      MODEL: "fake",
      DATA_DIR: ".data",
      VERTEX_LOCATION: "global",
      MODEL_DRAFTING: "gemini-3.8-flash",
      MODEL_DESCRIBER: "gemini-2.5-flash-lite",
      FAKE_MODEL_SCENARIO: "noop",
      LOG_LEVEL: "info",
    });
    expect(config.FAKE_DESCRIBER).toBeUndefined();
  });

  it("keeps only the known keys and never the rest of the environment", () => {
    const config = loadConfig({ ...VALID, PATH: "/usr/bin", HOME: "/home/x" });
    expect(config).not.toHaveProperty("PATH");
    expect(config).not.toHaveProperty("HOME");
  });

  it("treats an empty value as unset, as .env.example leaves the optional ones", () => {
    const config = loadConfig({
      ...VALID,
      FAKE_MODEL_SCENARIO: "",
      FAKE_DESCRIBER: "",
      GCS_PRIVATE_BUCKET: "",
      STORE: "",
    });
    expect(config.FAKE_MODEL_SCENARIO).toBe("noop");
    expect(config.FAKE_DESCRIBER).toBeUndefined();
    expect(config.STORE).toBe("fs");
  });

  it("names every missing variable in one boot error", () => {
    const error = bootError({});
    expect(error.message).toContain("PUBLIC_BASE_URL");
    expect(error.message).toContain("SESSION_SECRET");
    expect(error.message).toContain("SHELTER_USERNAME");
    expect(error.message).toContain("SHELTER_PASSWORD_HMAC");
  });

  it("names every invalid value with what is wrong", () => {
    const error = bootError({
      ...VALID,
      STORE: "redis",
      PUBLIC_BASE_URL: "not a url",
      SESSION_SECRET: "short",
      SHELTER_PASSWORD_HMAC: "not-hex",
      FAKE_DESCRIBER: "sometimes",
      LOG_LEVEL: "loud",
    });
    for (const name of [
      "STORE",
      "PUBLIC_BASE_URL",
      "SESSION_SECRET",
      "SHELTER_PASSWORD_HMAC",
      "FAKE_DESCRIBER",
      "LOG_LEVEL",
    ]) {
      expect(error.message).toContain(name);
    }
    expect(error.message).not.toContain("SHELTER_USERNAME");
  });

  it("STORE=gcs needs both buckets and the project, each named", () => {
    const error = bootError({ ...VALID, STORE: "gcs" });
    expect(error.message).toContain("GCS_PRIVATE_BUCKET");
    expect(error.message).toContain("GCS_PUBLIC_BUCKET");
    expect(error.message).toContain("GOOGLE_CLOUD_PROJECT");
    expect(error.message).toContain("STORE=gcs");
  });

  it("lists the cloud values beside the other problems, all in one error", () => {
    const error = bootError({ STORE: "gcs" });
    expect(error.message).toContain("SESSION_SECRET (missing)");
    expect(error.message).toContain("GCS_PUBLIC_BUCKET (required when STORE=gcs)");
  });

  it("STORE=gcs boots once the buckets and project are set", () => {
    const config = loadConfig({
      ...VALID,
      STORE: "gcs",
      GCS_PRIVATE_BUCKET: "private",
      GCS_PUBLIC_BUCKET: "public",
      GOOGLE_CLOUD_PROJECT: "my-project",
    });
    expect(config.STORE).toBe("gcs");
    expect(config.GCS_PRIVATE_BUCKET).toBe("private");
  });

  it("MODEL=vertex needs the project, and only the project", () => {
    const error = bootError({ ...VALID, MODEL: "vertex" });
    expect(error.message).toContain("GOOGLE_CLOUD_PROJECT");
    expect(error.message).toContain("MODEL=vertex");
    expect(error.message).not.toContain("GCS_PRIVATE_BUCKET");

    const config = loadConfig({ ...VALID, MODEL: "vertex", GOOGLE_CLOUD_PROJECT: "p" });
    expect(config.MODEL).toBe("vertex");
  });

  it("reads the fake-model knobs", () => {
    const config = loadConfig({ ...VALID, FAKE_MODEL_SCENARIO: "noop", FAKE_DESCRIBER: "fail" });
    expect(config.FAKE_MODEL_SCENARIO).toBe("noop");
    expect(config.FAKE_DESCRIBER).toBe("fail");
  });

  it("ignores FPS_GATE, which only Playwright reads", () => {
    expect(loadConfig({ ...VALID, FPS_GATE: "1" })).not.toHaveProperty("FPS_GATE");
  });
});
