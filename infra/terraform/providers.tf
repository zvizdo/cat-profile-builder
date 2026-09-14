# Credentials come from Application Default Credentials (ADC: the login that
# `gcloud auth application-default login` stores on this machine). Nothing is read from a
# key file.
provider "google" {
  project = var.project_id
  region  = var.region
}

# Talks to the local Docker daemon to build the app's image and push it to Artifact
# Registry (image.tf). Auth for the push is a short-lived OAuth2 token from the same ADC the
# `google` provider above uses — nothing is written to `~/.docker/config.json` and nothing
# runs `gcloud auth configure-docker` first.
provider "docker" {
  registry_auth {
    address  = "${var.region}-docker.pkg.dev"
    username = "oauth2accesstoken"
    password = data.google_client_config.default.access_token
  }
}
