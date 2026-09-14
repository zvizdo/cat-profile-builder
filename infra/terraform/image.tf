# The image Cloud Run runs, built and pushed by Terraform itself (ADR-014 amendment,
# 2026-09-12). Nothing outside Terraform builds or pushes an image any more. Both `plan` and
# `apply` need a Docker daemon reachable regardless — the `docker` provider (providers.tf)
# pings it as soon as it configures, and `docker_image.app` refreshes through it on every
# plan. What the design below avoids needing Docker for is computing the *tag*.
#
# The tag has to be stable across a `plan` that changes nothing (must say "No changes"), so
# it cannot be read off Docker (which would mean re-inspecting a local image that may not
# exist, e.g. on a fresh runner). Instead the tag is the current commit's short SHA, read
# with `git rev-parse` through `data "external"` (a plain subprocess call). Trade-off,
# accepted: an uncommitted change to the source is not picked up until it is committed,
# since the tag does not change until the SHA does. A hash of every tracked file's contents
# would rebuild on content changes regardless of commits, but needs a second
# `data "external"` walking the whole tree for a benefit this one-shelter project does not
# need.
data "external" "git" {
  # `|| exit 1` matters: without it, a missing `git` or a non-git checkout (e.g. a
  # downloaded zip of the repo) still prints `{"sha":""}` and Terraform fails later with an
  # opaque `coalesce: no non-null, non-empty-string arguments` on `local.image_tag`. Failing
  # here instead makes `data "external"` report the real problem straight from `git`.
  program     = ["sh", "-c", "sha=$(git rev-parse --short HEAD) || exit 1; printf '{\"sha\":\"%s\"}' \"$sha\""]
  working_dir = "${path.module}/../.."
}

# The OAuth2 token behind the `docker` provider's registry_auth (providers.tf) — same ADC
# the `google` provider uses, refreshed on every plan/apply.
data "google_client_config" "default" {}

locals {
  # `var.image_tag` overrides the commit SHA (variables.tf) — a forced rebuild of the same
  # commit, or a tag CI wants to pin.
  image_tag  = coalesce(var.image_tag, data.external.git.result.sha)
  image_repo = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/app"

  # `var.image` (variables.tf) is the escape hatch for a pre-built image: when set, the two
  # resources below are not created (`count = 0`) and the service simply runs that
  # reference. Otherwise the service runs the digest Terraform just pushed, addressed as
  # `repo@sha256:…` rather than `repo:tag` so it rolls exactly when the content changes, not
  # merely when a mutable tag is reused (`docker_registry_image.sha256_digest`, not `.id` —
  # the provider sets `id` to the same digest string, `sha256_digest` says so explicitly).
  cloud_run_image = coalesce(var.image, "${local.image_repo}@${try(docker_registry_image.app[0].sha256_digest, "")}")
}

resource "docker_image" "app" {
  count = var.image == null ? 1 : 0

  name = "${local.image_repo}:${local.image_tag}"

  build {
    context  = "${path.module}/../.."
    platform = "linux/amd64"
  }

  # Without this, the provider diffs the image on every plan by asking Docker whether it
  # still matches — pinning the trigger to the tag means a rebuild happens only when the
  # tag (i.e. the commit) actually changes.
  triggers = {
    tag = local.image_tag
  }

  # Keep the built image in the local Docker cache; only the registry copy
  # (docker_registry_image.app, below) is what `keep_remotely` protects on destroy.
  keep_locally = true

  depends_on = [google_artifact_registry_repository.images]
}

resource "docker_registry_image" "app" {
  count = var.image == null ? 1 : 0

  name          = docker_image.app[0].name
  keep_remotely = true
}
