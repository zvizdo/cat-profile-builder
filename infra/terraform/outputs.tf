output "service_url" {
  description = "The Cloud Run service's https URL. Pass it back as `-var public_base_url=…` on the next apply."
  value       = google_cloud_run_v2_service.app.uri
}

output "private_bucket" {
  description = "GCS_PRIVATE_BUCKET for the app."
  value       = google_storage_bucket.private["private"].name
}

output "public_bucket" {
  description = "GCS_PUBLIC_BUCKET for the app."
  value       = google_storage_bucket.public["public"].name
}

output "artifact_registry_repository" {
  description = "Image path prefix for `docker push`."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "service_account_email" {
  description = "The runtime service account."
  value       = google_service_account.run.email
}
