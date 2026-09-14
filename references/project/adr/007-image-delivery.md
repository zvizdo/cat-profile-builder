# ADR-007: Image delivery

**Status**: accepted · **Date**: 2026-09-10

## Context

FR-075: visitors never receive an original; every image is sized for the surface. SC-004:
LCP within 2.5 s on a mid-tier mobile connection. The spec already names "the framework's
built-in image optimisation" as the mechanism.

## Decision

- Public surfaces render `next/image` against the public-bucket URL of
  `profiles/{pid}/media/{mid}/clean.{rev}.jpg` taken from the published manifest (ADR-015);
  originals live in the private bucket and cannot be fetched. `remotePatterns` allows only
  the configured public bucket.
- `sizes` is set per surface (hero full-bleed, gallery cell, list card, carousel 1920). The
  optimiser produces WebP/AVIF variants on demand and caches them on the Cloud Run instance
  filesystem (`minimumCacheTTL` one day). Because derived URLs are immutable (content-hashed),
  the cache never serves a stale crop. The optimiser fetches with no credential.
- Focal point becomes `style={{ objectPosition: "x% y%" }}` with `object-fit: cover`.
- The **builder** canvas uses the same component so the crop a volunteer sees is the crop a
  visitor sees.

## Alternatives rejected

- Generating fixed derivative sizes with `sharp` at upload — more objects to manage and no
  format negotiation; the spec's own technical constraints already chose the framework route.
- A CDN image service — a third party and a credential for a problem the framework solves.

## Amendment 2026-09-12 (F23): the app serves every derived file

**Why.** The shelter's Google Cloud organisation enforces `iam.allowedPolicyMemberDomains`
(domain-restricted sharing), which forbids granting `allUsers` on a bucket. So a browser
cannot read `https://storage.googleapis.com/<public bucket>/…` at all — no image showed in
the builder or on a published page once deployed. Terraform's `public_access` grant was
never going to be allowed.

**Decision.** Every derived file (`clean`, `poster`, `web`) is served by the app at
`/media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}`, under every store — the route the
filesystem store already used for local development. `MediaStore.publicUrl` answers that
root-relative path on GCS too, so a manifest never carries a bucket host; the public bucket
keeps its name and layout but has no public reader — the app's service account is the only
one. The route streams through a new port method, `readDerivedRange`, honours `Range`
(`206`/`416`, so the trim editor's `<video>` can seek), answers `HEAD`, carries
`ETag: "{rev}"` with `If-None-Match → 304`, and keeps `Cache-Control: public,
max-age=31536000, immutable`. Uploads are unchanged: the browser still puts the original
straight into the private bucket over a signed URL.

**Consequences.** `next/image` now optimises same-origin URLs — the optimiser fetches
`/media/…` from the app itself, which the fs-mode e2e journeys already exercised;
`remotePatterns` for `storage.googleapis.com` stays only so a manifest written before this
amendment still renders. Media bytes flow through Cloud Run (2 vCPU, concurrency 20 —
fine at a shelter's scale; a clip is streamed, never buffered). Infra follow-up (F18 owns
Terraform): drop the `public_access` variable and the `allUsers` grant.

**Alternatives rejected.** Signed read URLs for every image — breaks the forever cache and
the kiosk would need fresh links all day (ADR-015 already rejected this). A CDN in front of
the bucket — still needs a reader the org policy forbids, or a second identity to manage.
Asking the organisation for a policy exception — outside the shelter's control.
