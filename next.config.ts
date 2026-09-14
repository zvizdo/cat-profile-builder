import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run runs the self-contained server in .next/standalone (ADR-014).
  output: "standalone",
  images: {
    // Derived media is served by this app under `/media/` (F23); this host stays only so a
    // manifest published before then, which may still name the bucket, keeps rendering.
    remotePatterns: [{ protocol: "https", hostname: "storage.googleapis.com" }],
  },
  // The helper's skills are Markdown read from disk at request time (`skills.ts`), which
  // the standalone build's file tracing would otherwise leave behind (T035).
  outputFileTracingIncludes: {
    "/api/helper/chat": ["./src/core/helper/skills/*.md"],
  },
};

export default nextConfig;
