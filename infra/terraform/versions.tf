# Terraform and provider pins (ADR-014). The lock file beside this pins the exact provider
# build; `terraform init` refuses a drift from it.
terraform {
  required_version = ">= 1.14"

  # Local state (default: no backend block) until the day this moves to GitHub
  # (infra/terraform/README.md, "Deploying from GitHub"). This block is deliberately generic
  # — no bucket name — so it can be uncommented as-is; the bucket comes at `init` time from
  # either a git-ignored `backend.hcl` (`terraform init -backend-config=backend.hcl`) or
  # `-backend-config` flags (`deploy.yml`), never from a value typed here. Uncommenting this
  # with no local state yet: run `terraform init -backend-config=backend.hcl` and Terraform
  # starts the GCS backend empty. Uncommenting it with existing local state you want to
  # keep: run `terraform init -backend-config=backend.hcl -migrate-state` instead.
  # backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 9.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = ">= 3.0, < 4.0"
    }
    # `data "external" "git"` (image.tf) shells out to `git rev-parse` for the image tag.
    external = {
      source  = "hashicorp/external"
      version = ">= 2.0, < 3.0"
    }
  }
}
