resource "google_artifact_registry_repository" "images" {
  repository_id = var.service_name
  location      = var.region
  format        = "DOCKER"
  description   = "Cat Profile Builder container images"

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  # The service holds no data (that is the buckets); recreating it is one apply.
  deletion_protection = false
  # Cloud Run's own "skip the invoker check" switch (not an IAM grant, so the
  # domain-restricted-sharing org policy that rejects an `allUsers` binding does not apply
  # to it either) — this is what makes the service reachable by anyone; the app does its
  # own sign-in (ADR-011). Unconditional: unlike the public bucket's `allUsers` grant
  # (buckets.tf, gated by `public_access`), nothing about reaching this service depends on
  # that org policy.
  invoker_iam_disabled = true

  template {
    service_account = google_service_account.run.email
    # ffmpeg wants the full Linux syscall surface of gen2.
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout               = "900s"
    # 50, not the original 20 (ADR-007's media-streaming note assumed 20): raised in the
    # Cloud Console and adopted here on 2026-09-22 so an apply keeps what runs live.
    max_instance_request_concurrency = 50
    session_affinity                 = false

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = local.cloud_run_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        # Bill CPU per request, not per warm instance: all the heavy work (ffmpeg, sharp)
        # runs inside the request, which is why the timeout is 15 minutes (ADR-006).
        cpu_idle = true
      }

      env {
        name  = "STORE"
        value = "gcs"
      }
      env {
        name  = "MODEL"
        value = "vertex"
      }
      env {
        name  = "GCS_PRIVATE_BUCKET"
        value = google_storage_bucket.private["private"].name
      }
      env {
        name  = "GCS_PUBLIC_BUCKET"
        value = google_storage_bucket.public["public"].name
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_LOCATION"
        value = var.vertex_location
      }
      env {
        name  = "MODEL_DRAFTING"
        value = var.model_drafting
      }
      env {
        name  = "MODEL_DESCRIBER"
        value = var.model_describer
      }
      env {
        name  = "SHELTER_USERNAME"
        value = var.shelter_username
      }
      env {
        name  = "PUBLIC_BASE_URL"
        value = local.public_base_url
      }
      # The two credentials are plain values on the revision (decision 2026-09-12, ADR-014
      # amendment): Terraform variables from `secrets.auto.tfvars`, no Secret Manager.
      # Anyone who can read the service's spec can read them; that is accepted for one
      # shelter's shared password.
      env {
        name  = "SESSION_SECRET"
        value = var.session_secret
      }
      env {
        name  = "SHELTER_PASSWORD_HMAC"
        value = var.shelter_password_hmac
      }
    }
  }
}
