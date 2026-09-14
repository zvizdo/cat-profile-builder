# Bucket layout and access rules are ADR-015. Uniform bucket-level access everywhere: no
# per-object ACLs, so "who can read" is the bucket's IAM policy and nothing else.

resource "google_storage_bucket" "private" {
  for_each = local.private_buckets

  name                        = each.value
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  # Holds the shelter's data; must never be deletable by a stray `terraform destroy`
  # (destroy refuses instead, "Destroy" below).
  force_destroy = false

  versioning {
    enabled = true
  }

  # Every non-current version — an overwritten draft or anything left by deleting a cat —
  # stays 30 days as the recovery net (ADR-015), then goes. No `num_newer_versions`: after a
  # delete there is no live object, so that condition would keep the last versions forever.
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ARCHIVED"
    }
  }

  # Originals arrive by V4 signed resumable upload: a POST to start the session, then PUTs
  # of the bytes to the session URL GCS answers in `Location`. The `x-goog-*` list must
  # match the headers `createSignedUpload` signs in `src/adapters/gcs/media-store.ts`: the
  # browser's preflight names all of them and GCS answers with no CORS headers on any miss.
  cors {
    origin          = local.cors_origins
    method          = ["POST", "PUT", "OPTIONS"]
    response_header = ["Content-Type", "Location", "x-goog-resumable", "x-goog-content-length-range", "x-goog-if-generation-match"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "public" {
  for_each = local.public_buckets

  name                        = each.value
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  cors {
    origin          = local.cors_origins
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Cache-Control", "Range"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

# The public bucket is readable by anyone; the app writes every object there with
# `Cache-Control: public, max-age=31536000, immutable` (ADR-015).
resource "google_storage_bucket_iam_member" "public_read" {
  for_each = var.public_access ? google_storage_bucket.public : {}

  bucket = each.value.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
