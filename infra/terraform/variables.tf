variable "project_id" {
  description = "The Google Cloud project everything is created in."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, both buckets and the Artifact Registry repository (decision Q2)."
  type        = string
  default     = "us-west1"
}

variable "vertex_location" {
  description = "VERTEX_LOCATION for the app. `global`: the two Gemini ids are served from the global endpoint, not a single region."
  type        = string
  default     = "global"
}

variable "service_name" {
  description = "Name of the Cloud Run service and of the Artifact Registry repository."
  type        = string
  default     = "cat-profile-builder"
}

variable "image" {
  description = "Escape hatch: a full pre-built image reference for the Cloud Run service to run instead of the one Terraform builds itself (image.tf). Leave unset (the default) so `terraform apply` builds, pushes and deploys on its own; set this only to run something Terraform did not build, e.g. a hotfix pushed by hand."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Overrides the tag Terraform builds and pushes (image.tf). Leave unset (the default) so the tag is the current commit's short git SHA, computed with `git rev-parse` rather than by asking Docker anything — stable across a `plan` with nothing changed. Both `plan` and `apply` still need a Docker daemon reachable regardless (the `docker` provider pings it); this only avoids needing one just to compute the tag itself. Set this to force a rebuild under a specific tag, e.g. from CI."
  type        = string
  default     = null
}

variable "public_base_url" {
  description = "PUBLIC_BASE_URL for the app: the service's own https URL. Unknown before the first apply, so it defaults to empty and the service gets a placeholder until the next apply passes the `service_url` output back in."
  type        = string
  default     = ""

  validation {
    condition     = var.public_base_url == "" || startswith(var.public_base_url, "https://")
    error_message = "public_base_url must be empty or an https:// URL."
  }
}

variable "shelter_username" {
  description = "SHELTER_USERNAME: the one sign-in name the shelter uses (ADR-011). Not a secret; the password HMAC is."
  type        = string
}

# The two credential values (ADR-011). `pnpm make-credentials` writes them to
# `secrets.auto.tfvars`, which Terraform loads on its own and git ignores. They are
# `sensitive`, so a plan prints them as `(sensitive value)`; they still land in the state
# file (README, "State").
variable "session_secret" {
  description = "SESSION_SECRET: the key that signs session cookies and the password HMAC. Produced by `pnpm make-credentials`, never typed by hand."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.session_secret) >= 32
    error_message = "session_secret must be at least 32 characters; run `pnpm make-credentials`."
  }
}

variable "shelter_password_hmac" {
  description = "SHELTER_PASSWORD_HMAC: the hex HMAC-SHA256 of the shelter password keyed by session_secret. Produced by `pnpm make-credentials` together with the secret."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.shelter_password_hmac))
    error_message = "shelter_password_hmac must be 64 lowercase hex characters; run `pnpm make-credentials`."
  }
}

# Bucket names are global across all of Google Cloud, so a project may need its own. A
# variable default cannot mention another variable; `null` means "derive it from
# project_id" (main.tf) and the `-test` pair always follows with a `-test` suffix.
variable "private_bucket_name" {
  description = "GCS_PRIVATE_BUCKET. Default: `<project_id>-cat-profiles-private`."
  type        = string
  default     = null
}

variable "public_bucket_name" {
  description = "GCS_PUBLIC_BUCKET. Default: `<project_id>-cat-profiles-public`."
  type        = string
  default     = null
}

variable "model_drafting" {
  description = "MODEL_DRAFTING: the Gemini id that drafts and edits profiles (ADR-003)."
  type        = string
  default     = "gemini-3.8-flash"
}

variable "model_describer" {
  description = "MODEL_DESCRIBER: the Gemini id that describes photos and clips (ADR-003)."
  type        = string
  default     = "gemini-2.5-flash-lite"
}

variable "public_access" {
  description = "Grant `allUsers` read on the public bucket (the service's own public access is unconditional — cloud-run.tf, `invoker_iam_disabled`). The design needs the bucket readable by anyone (ADR-015, published pages); an org policy (`iam.allowedPolicyMemberDomains`) can forbid the `allUsers` grant, in which case set false until the project gets an exception."
  type        = bool
  default     = true
}

variable "signer_developers" {
  description = "IAM members (`user:…`) allowed to impersonate the runtime service account, so they can run the @gcs contract suite with its identity (against a hand-created scratch bucket pair, README \"Test buckets\" — this stack does not create one). Owner alone cannot mint its tokens."
  type        = list(string)
  default     = []
}
