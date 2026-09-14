locals {
  # The app's own bucket pair. Terraform no longer creates a `-test` pair (F18 review
  # addendum, 2026-09-12): the @gcs store contract suite is opt-in and points at two scratch
  # buckets created by hand (README, "Test buckets"), so this stack only ever touches the
  # two buckets the running app actually uses.
  private_buckets = {
    private = coalesce(var.private_bucket_name, "${var.project_id}-cat-profiles-private")
  }
  public_buckets = {
    public = coalesce(var.public_bucket_name, "${var.project_id}-cat-profiles-public")
  }

  # The first apply cannot know the service URL (referencing the service's own `uri` from
  # its env is a cycle), and the app refuses to boot on a PUBLIC_BASE_URL that is not a URL.
  public_base_url = var.public_base_url != "" ? var.public_base_url : "https://placeholder.invalid"

  # Browsers upload originals straight to the private bucket and fetch derived files from
  # the public one, so both need CORS for the app origin and the local dev server.
  cors_origins = distinct(compact([var.public_base_url, "http://localhost:3000"]))

  apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
    # V4 URL signing without a key file goes through IAM Credentials `signBlob`.
    "iamcredentials.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  service = each.value
  # Other things in the project may use these APIs; destroying this stack must not turn
  # them off.
  disable_on_destroy = false
}
