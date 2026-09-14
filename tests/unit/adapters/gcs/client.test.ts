import { describe, expect, it } from "vitest";
import { createGcsClient, hasStatus } from "@/adapters/gcs/client";
import { InternalError } from "@/core/errors";
import { apiError, gaxiosError } from "../../../fakes/gcs-bucket";

// The client is built without a network call, so a unit test can check the wiring:
// which bucket is which, and that a missing name is a boot-time mistake.

describe("createGcsClient", () => {
  it("opens the two named buckets on the project", () => {
    const buckets = createGcsClient({
      GOOGLE_CLOUD_PROJECT: "shelter",
      GCS_PRIVATE_BUCKET: "shelter-private",
      GCS_PUBLIC_BUCKET: "shelter-public",
    });
    expect(buckets.privateBucket.name).toBe("shelter-private");
    expect(buckets.publicBucket.name).toBe("shelter-public");
  });

  it("refuses to build without both bucket names", () => {
    expect(() =>
      createGcsClient({ GOOGLE_CLOUD_PROJECT: "shelter", GCS_PUBLIC_BUCKET: "shelter-public" }),
    ).toThrow(InternalError);
  });
});

describe("hasStatus", () => {
  it("reads the status from an ApiError's code and from a gaxios error's status", () => {
    expect(hasStatus(apiError(412), 412)).toBe(true);
    expect(hasStatus(gaxiosError(412), 412)).toBe(true);
    expect(hasStatus(apiError(404), 412)).toBe(false);
    expect(hasStatus(gaxiosError(500), 412)).toBe(false);
    expect(hasStatus(new Error("plain"), 412)).toBe(false);
    expect(hasStatus(null, 412)).toBe(false);
    expect(hasStatus("412", 412)).toBe(false);
  });
});
