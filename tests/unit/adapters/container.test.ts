import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "@/adapters/auth/session";
import { loadConfig } from "@/adapters/config";
import { createContainer, getContainer } from "@/adapters/container";
import { FAKE_DESCRIPTION } from "@/adapters/fake/describer";
import { NOOP_TEXT } from "@/adapters/fake/scenarios/noop";
import { InternalError, UnsupportedError } from "@/core/errors";
import { generateText } from "ai";
import { memoryLogger } from "../../fakes/logger";

const ENV = {
  STORE: "memory",
  MODEL: "fake",
  PUBLIC_BASE_URL: "http://localhost:3000/",
  SESSION_SECRET: "sixteen-characters-long",
  SHELTER_USERNAME: "shelter",
  SHELTER_PASSWORD_HMAC: "b".repeat(64),
  GCS_PRIVATE_BUCKET: "private",
  GCS_PUBLIC_BUCKET: "public",
  GOOGLE_CLOUD_PROJECT: "project",
};

function build(overrides: Record<string, string> = {}) {
  const logger = memoryLogger();
  return createContainer(loadConfig({ ...ENV, ...overrides }), logger);
}

describe("createContainer", () => {
  it("wires the memory stores over one pair of buckets and the fake model", async () => {
    const container = build();
    expect(container.logger).toBeDefined();
    expect(container.config.STORE).toBe("memory");

    await container.profileStore.writeDraft(
      "abcdefgh",
      { v: 1 },
      {
        name: "Mochi",
        line: "",
        thumbnail: null,
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    );
    await container.mediaStore.writeAsset("abcdefgh", "mmmmmmm2", { kind: "photo" });
    await container.profileStore.delete("abcdefgh");
    expect(await container.mediaStore.readAsset("abcdefgh", "mmmmmmm2")).toBeNull();

    // Root-relative like the filesystem store's: a memory store serves no file, and a
    // published manifest must never carry a plain `http:` URL.
    expect(container.mediaStore.publicUrl("abcdefgh", "mmmmmmm2", "poster", "0123456789")).toBe(
      "/media/profiles/abcdefgh/media/mmmmmmm2/poster.0123456789.jpg",
    );

    const described = await container.describer.describePhoto(new Uint8Array([1]));
    expect(described).toEqual({ text: FAKE_DESCRIPTION });
    const generated = await generateText({ model: container.languageModel, prompt: "hi" });
    expect(generated.text).toBe(NOOP_TEXT);
  });

  it("passes the fake knobs through: FAKE_DESCRIBER=fail and the scenario name", async () => {
    const container = build({ FAKE_DESCRIBER: "fail" });
    expect(await container.describer.describePhoto(new Uint8Array([1]))).toEqual({
      failed: "model",
    });
    expect(() => build({ FAKE_MODEL_SCENARIO: "no-such-scenario" })).toThrow(InternalError);
  });

  it("logs one boot line naming the modes and never a secret value", () => {
    const logger = memoryLogger();
    createContainer(loadConfig(ENV), logger);
    const boot = logger.entries.filter((entry) => entry.msg === "configuration validated");
    expect(boot).toHaveLength(1);
    expect(boot[0]?.level).toBe("info");
    expect(boot[0]?.fields).toMatchObject({
      STORE: "memory",
      MODEL: "fake",
      PUBLIC_BASE_URL: ENV.PUBLIC_BASE_URL,
      GCS_PRIVATE_BUCKET: "private",
    });
    const line = JSON.stringify(logger.entries);
    expect(line).not.toContain(ENV.SESSION_SECRET);
    expect(line).not.toContain(ENV.SHELTER_PASSWORD_HMAC);
    expect(line).not.toContain("SESSION_SECRET");
    expect(line).not.toContain("SHELTER_PASSWORD_HMAC");
  });

  it("gives a real clock and random ids", () => {
    const container = build();
    const before = Date.now();
    expect(container.clock.now().getTime()).toBeGreaterThanOrEqual(before);
    expect(container.ids.profileId()).toMatch(/^[a-z2-7]{8}$/);
  });

  it("reads the session from the cpb_session cookie with the configured secret", async () => {
    const container = build();
    const token = await createSessionToken(ENV.SESSION_SECRET, new Date());
    const jar = { get: (name: string) => (name === SESSION_COOKIE ? { value: token } : undefined) };
    expect(await container.readSession(jar)).toMatchObject({ sub: "shelter" });
    expect(await container.readSession({ get: () => ({ value: "anything" }) })).toBeNull();
    const foreign = await createSessionToken("another-secret-entirely", new Date());
    expect(await container.readSession({ get: () => ({ value: foreign }) })).toBeNull();
  });

  it("the video processor is the ffmpeg adapter: bytes that are no video are unsupported", async () => {
    const container = build();
    // Refused as a file problem whether or not ffmpeg is installed: with it, ffprobe finds
    // no video; without it, the adapter reports an internal error instead — either way,
    // no placeholder, and never a "not built" message.
    await expect(container.videoProcessor.probe(new Uint8Array([1]))).rejects.toSatisfy(
      (error) => error instanceof UnsupportedError || error instanceof InternalError,
    );
  });

  it("STORE=fs wires the filesystem stores over DATA_DIR, resolved from the working folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "cpb-container-"));
    try {
      const container = build({ STORE: "fs", DATA_DIR: root });
      await container.profileStore.writeDraft(
        "abcdefgh",
        { v: 1 },
        { name: "Mochi", line: "", thumbnail: null, updatedAt: "2026-09-10T00:00:00.000Z" },
      );
      expect(await readdir(join(root, "private", "profiles", "abcdefgh"))).toContain("draft.json");
      expect(container.mediaStore.publicUrl("abcdefgh", "mmmmmmm2", "clean", "0123456789")).toBe(
        "/media/profiles/abcdefgh/media/mmmmmmm2/clean.0123456789.jpg",
      );

      const relative = build({ STORE: "fs", DATA_DIR: ".data-container-test" });
      expect(relative.mediaStore.gsUri("abcdefgh", "mmmmmmm2", "web", "0123456789")).toBe(
        `file://${resolve(process.cwd(), ".data-container-test")}/public/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("STORE=gcs wires the Google Cloud Storage stores over the two named buckets", () => {
    const container = build({ STORE: "gcs" });
    // F23: the app serves every derived file itself, so the URL is the same root-relative
    // `/media/…` path under every store — no bucket carries a public grant.
    expect(container.mediaStore.publicUrl("abcdefgh", "mmmmmmm2", "poster", "0123456789")).toBe(
      "/media/profiles/abcdefgh/media/mmmmmmm2/poster.0123456789.jpg",
    );
    expect(container.mediaStore.gsUri("abcdefgh", "mmmmmmm2", "web", "0123456789")).toBe(
      "gs://public/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    );
  });

  it("MODEL=vertex wires the Vertex describer and drafting model without touching the network", () => {
    const container = build({ MODEL: "vertex", MODEL_DRAFTING: "drafting-from-env" });
    expect(container.languageModel.modelId).toBe("drafting-from-env");
    expect(container.languageModel.provider).toMatch(/vertex/);
    expect(typeof container.describer.describePhoto).toBe("function");
  });
});

describe("getContainer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds one container per process from the environment and keeps it", () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    vi.stubEnv("LOG_LEVEL", "silent");
    const first = getContainer();
    const second = getContainer();
    expect(second).toBe(first);
    expect(first.config.STORE).toBe("memory");
  });
});
