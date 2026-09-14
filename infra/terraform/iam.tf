# One service account runs the Cloud Run service. Its grants are the smallest set the app
# needs: objects in its buckets, Vertex AI calls, and signing upload URLs as itself.

resource "google_service_account" "run" {
  account_id   = "${var.service_name}-run"
  display_name = "Cat Profile Builder (Cloud Run runtime)"

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "run_private" {
  for_each = google_storage_bucket.private

  bucket = each.value.name
  role   = "roles/storage.objectAdmin"
  member = google_service_account.run.member
}

resource "google_storage_bucket_iam_member" "run_public" {
  for_each = google_storage_bucket.public

  bucket = each.value.name
  role   = "roles/storage.objectAdmin"
  member = google_service_account.run.member
}

resource "google_project_iam_member" "run_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = google_service_account.run.member
}

# V4 signed URLs without a key file: the account signs with IAM Credentials `signBlob`,
# which needs Token Creator on itself.
resource "google_service_account_iam_member" "run_self_signer" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.run.member
}

# Developers who run the @gcs contract suite impersonate the runtime account (README):
# that needs Token Creator on it, which Owner alone does not carry.
resource "google_service_account_iam_member" "developer_impersonation" {
  for_each = toset(var.signer_developers)

  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}
