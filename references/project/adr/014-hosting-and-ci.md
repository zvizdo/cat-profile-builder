# ADR-014: Hosting and CI

**Status**: accepted · **Date**: 2026-09-10

## Context

Founding decision: Google Cloud Run. The constitution requires CI to enforce every gate and
names standing it up as a prerequisite of the first application code.

## Decision

- **Container**: a multi-stage `Dockerfile` — Node LTS, `ffmpeg` installed from the distro
  package, Next.js `output: "standalone"`. Runs as the service account that has Storage Object Admin on both buckets and Vertex AI
  User. The two buckets, their access settings, and the 30-day versioning lifecycle on the
  private one (ADR-015), the service account and its roles, the Secret Manager secrets, the
  Artifact Registry repository and the Cloud Run service itself are all declared in
  **Terraform** under `infra/terraform/` (decision 2026-09-10; replaces the earlier
  "checked-in `gcloud` script"). One `terraform apply` per environment; the only manual steps
  are adding secret *values* and, until CI can deploy, running `scripts/deploy.sh`. Request
  timeout 15 minutes (ADR-006), min instances 0, one concurrency-limited instance is enough
  for a shelter.
- **Configuration** by environment variables validated with Zod at boot
  (`src/adapters/config.ts`); the process refuses to start on a missing or malformed value.
  Secrets (`SESSION_SECRET`, `SHELTER_PASSWORD_HMAC`) come from Secret Manager mounted as
  env vars.
- **CI (GitHub Actions)** on every pull request: `pnpm install --frozen-lockfile`, lint,
  format check, `tsc --noEmit`, Vitest with coverage thresholds, `next build`, a grep of
  `.next/static` for `SESSION_SECRET`, `SHELTER_` and `GCS_PRIVATE_BUCKET` (Deployment Gate:
  no secret in the client bundle), `pnpm gen-tokens --check` (the token file must equal what
  `TOKENS.json` generates), Playwright against the built app with `STORE=fs MODEL=fake`,
  CLAUDE.md line-count check (≤ 200). Any red step blocks merge. Scripts run with `tsx`. Deploy is a separate manual workflow that builds and pushes the image and runs
  `terraform apply` with the new image tag.
- **Package manager**: `pnpm`, one lockfile.

## Note 2026-09-12 (T049 confirmation against T046/T047)

The decision stands as built; three details were settled in implementation and are recorded
here rather than restated in the decision text:

- **State** is a local `terraform.tfstate` under `infra/terraform/`, git-ignored (T046
  decision Q3). It moves to a GCS backend on the day the repository moves to GitHub — a
  manual step written up in `infra/terraform/README.md`, "Deploying from GitHub".
- **The deploy workflow** (`.github/workflows/deploy.yml`, `workflow_dispatch` only) runs the
  same `scripts/deploy.sh` a laptop runs. It authenticates with Workload Identity Federation
  (GitHub's OIDC token exchanged for a deploy service account, no stored key), whose pool,
  provider and service account are not created by Terraform and are the other manual step in
  that README section.
- **Public access** — `allUsers` as `roles/run.invoker` on the service and
  `roles/storage.objectViewer` on the public bucket — sits behind the `public_access` variable.
  `<project-id>` inherits `constraints/iam.allowedPolicyMemberDomains`, which rejects
  `allUsers`, so `dev.tfvars` carries `public_access = false` until an organization
  administrator grants an exception (T048 is blocked on it); the stack applies cleanly either
  way and nothing else changes.

## Amendment 2026-09-12 (F17): every knob a Terraform variable, credentials as plain env vars

User decision. The Secret Manager design above is superseded:

- `SESSION_SECRET` and `SHELTER_PASSWORD_HMAC` are Terraform variables (`sensitive = true`,
  validated: ≥ 32 characters and 64 hex characters) set as **plain environment variables**
  on the Cloud Run revision. The two Secret Manager secrets, the `secretmanager` API and the
  runtime account's accessor grant are removed. Trade-off, accepted for one shelter's shared
  password: anyone who can read the service's spec (`roles/run.viewer` and up) can read the
  values, and they sit in the state file; in exchange there is no second store, no
  "add a version by hand" step, and no revision that starts before its secret exists.
- `pnpm make-credentials` (ADR-011 amendment) writes the pair to
  `infra/terraform/secrets.auto.tfvars`, git-ignored, which Terraform loads on its own. On a
  GitHub runner the same two values arrive as `TF_VAR_session_secret` /
  `TF_VAR_shelter_password_hmac` from repository secrets (`deploy.yml`).
- The bucket names are variables too (`private_bucket_name`, `public_bucket_name`,
  defaulting to `<project_id>-cat-profiles-private` / `-public`; the `-test` pair follows
  them), so nothing about a deployment is fixed in a `.tf` file. `image` stays the one
  value only `scripts/deploy.sh` passes.

## Amendment 2026-09-12 (F18): Terraform builds the image; invoker IAM disabled instead of `allUsers`

User request: deployment is Terraform only, with every setting documented in an example
tfvars and nothing project-specific committed. Two things from the F17 amendment above no
longer hold:

- **The image is built and pushed by Terraform itself**, with the `kreuzwerker/docker`
  provider (`infra/terraform/image.tf`): a `docker_image` resource builds
  `linux/amd64` from the repo root against the checked-in `Dockerfile`, tagged with the
  current commit's short git SHA (read via `git rev-parse` through `data "external"`, so
  the tag itself stays identical across a `plan` that changes nothing — `plan` and `apply`
  both still need a Docker daemon reachable regardless, since the `docker` provider pings
  it on configure); a `docker_registry_image` resource pushes it to the Artifact Registry
  repository this same stack creates, authenticated with a short-lived OAuth2 token from
  the same Application Default Credentials the `google` provider already uses — no
  `gcloud auth configure-docker`, no key file. The Cloud Run service runs the pushed
  image's digest (`repo@sha256:…`), not its tag, so a revision rolls exactly when the
  content changes. `scripts/deploy.sh` and `.github/workflows/deploy.yml`'s reliance on it
  are gone; the workflow now runs `terraform apply` directly, and `image` /
  `infra/terraform/environments/` are replaced by an optional `image` override and a single
  `terraform.tfvars` (see `infra/terraform/terraform.tfvars.example`). Trade-off, accepted:
  an uncommitted source change is not built until it is committed, the same limit
  `scripts/deploy.sh` enforced by refusing a dirty tree outright.
- **Public invocation no longer uses an `allUsers` IAM binding.** The user enabled Cloud
  Run's own "disable invoker IAM check" setting
  (`google_cloud_run_v2_service.invoker_iam_disabled = true`) instead, which is not an IAM
  grant and so is not blocked by an organization policy that forbids `allUsers` (the
  situation `<project-id>` was in). The `google_cloud_run_v2_service_iam_member` allUsers
  invoker resource is removed entirely; `public_access` now gates only the public bucket's
  `allUsers → roles/storage.objectViewer` grant, which still needs a project-level org
  policy exception where that policy applies.

### Addendum (review round 1): the `-test` bucket pair is no longer Terraform's job

The stack no longer has a `create_test_buckets` variable or a `-test` bucket pair at all.
The `@gcs` store contract suite (`tests/contract/stores.test.ts`) is opt-in and already
kept out of the main stack's variables; having Terraform provision its scratch buckets too
meant the main apply's blast radius included resources the running app never touches.
Whoever runs that suite now creates the two scratch buckets by hand
(`infra/terraform/README.md`, "Test buckets and the `@gcs` contract suite") — same naming
convention (`-test` suffix, which the suite itself still enforces), just not
Terraform-managed.

## Alternatives rejected

- A `gcloud` shell script for provisioning — fine for buckets alone, but once the service
  account, registry and Cloud Run service join the list it cannot show a diff or
  be re-run safely; Terraform plans are reviewable at the human gate.

- Vercel hosting — no ffmpeg in the runtime and the founding decision is Cloud Run.
- Cloud Build for CI — fine, but the repository is on GitHub and Actions keeps CI next to the
  code.
