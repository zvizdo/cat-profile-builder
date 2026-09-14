# Infrastructure (Terraform)

Everything the app needs on Google Cloud, declared once (ADR-014, ADR-015): the two
buckets, the runtime service account and its grants, the Artifact Registry repository, the
app's own container image, and the Cloud Run service. One `terraform apply` per
environment — it builds the image, pushes it, and deploys, all in the same command. Every
deployment knob is a variable in `variables.tf`; the values come from two places and
nowhere else:

| Where | What | In git? |
|---|---|---|
| `terraform.tfvars` | Project, region, username, URL, bucket names, flags — everything but the two credential values | **never** |
| `secrets.auto.tfvars` | `session_secret`, `shelter_password_hmac` — written by `pnpm make-credentials` | **never** |

`terraform.tfvars.example` documents every variable — what it does, its allowed values,
its default, and when you'd change it. Copy it to `terraform.tfvars` and fill in the ones
that need a value; nothing in this directory names a specific project, URL or person.

State is a local file, git-ignored (decision Q3).

| File | Holds |
|---|---|
| `versions.tf`, `providers.tf` | Terraform ≥ 1.14, `hashicorp/google` 6–8 (credentials from ADC), `kreuzwerker/docker` (credentials from the same ADC's access token) |
| `variables.tf`, `terraform.tfvars.example` | Every input, documented; no environment's actual values |
| `main.tf` | Locals (bucket names, CORS origins) and the enabled APIs |
| `image.tf` | Builds the app's image and pushes it to Artifact Registry |
| `buckets.tf` | Private bucket (versioned, 30-day non-current lifecycle, no public access) and public bucket (`allUsers` read, gated by `public_access`) |
| `iam.tf` | Service account `cat-profile-builder-run` and its grants |
| `cloud-run.tf` | Artifact Registry repo and the Cloud Run v2 service, every env var included |
| `outputs.tf` | Service URL, bucket names, repo path, service account (nothing sensitive) |

## Prerequisites

- `terraform` ≥ 1.14, a Docker daemon running (Terraform's `docker` provider builds and
  pushes through it — Docker Desktop or the Linux daemon, either works), `gcloud` logged in
  as a project owner, and Application Default Credentials (ADC:
  `gcloud auth application-default login`).
- The repo installed (`pnpm install --frozen-lockfile`) for `pnpm make-credentials`.

All commands below run from this directory unless they say otherwise.

## The two credential values

The app signs in one shared shelter account (ADR-011). It needs two values:

- `SESSION_SECRET` — a random key. It signs the session cookie and keys the password hash.
- `SHELTER_PASSWORD_HMAC` — the shelter password run through HMAC-SHA256 with that key. The
  password itself is stored nowhere.

Because the hash is keyed by the secret, the two only make sense as a pair, so **one script
produces both**. From the repo root:

```sh
pnpm make-credentials
```

It asks for the shelter password twice with echo off, generates a fresh secret, computes the
hash and writes `infra/terraform/secrets.auto.tfvars` (owner-readable only, git-ignored). It
prints the path and never a value. Terraform loads every `*.auto.tfvars` on its own, so the
next apply carries them; nothing goes on the command line, and neither value belongs in
`terraform.tfvars` (`terraform.tfvars.example` says so where they'd otherwise be listed).

Things to know:

- **Rotating** either value — changing the password or just wanting a new secret — means
  running the script again with `--force` (it refuses to overwrite otherwise) and applying.
  Every existing session cookie stops being valid, so everyone signs in again.
- **Where the values live**: the tfvars file and `terraform.tfstate`, both git-ignored on
  this machine, and on the Cloud Run revision as plain environment variables (decision
  2026-09-12, ADR-014 amendment; it replaced Secret Manager). Anyone who can read the
  service's spec can read them; a `terraform plan` shows them as `(sensitive value)`.
- **No terminal?** `printf '%s' "$password" | pnpm make-credentials --password-stdin`
  (nothing lands in shell history; `printf` adds no newline).
- **Local dev** needs the same two variables in `.env.local`:
  `pnpm make-credentials --env` prints the two `KEY=value` lines to stdout instead of
  writing the tfvars — paste them in. A local pair and the deployed pair are independent.
- **A second environment** — a second Terraform working directory or workspace — would
  share the one `secrets.auto.tfvars` unless you keep its pair elsewhere and load it
  separately; the `.gitignore` here also covers `secrets.tfvars` for that case.

## Building and pushing the image

`image.tf` builds the app's container image with Terraform's `docker` provider and pushes
it to the Artifact Registry repository this same stack creates — no separate script or CI
build step exists. The tag is the current commit's short git SHA by default (read with a
plain `git rev-parse`, not by asking Docker anything), so re-running `terraform apply` on
the same commit reuses the same tag and image, and `terraform plan` reports "No changes"
when nothing in the source or the config has moved. Two variables let you override this:

- `image_tag` — build under a different tag than the commit SHA.
- `image` — skip the build entirely and run a pre-built image reference instead.

Both default to unset; `terraform.tfvars.example` explains when you'd set either. The
service always runs the pushed image by its digest (`repo@sha256:…`), not by its mutable
tag, so it rolls exactly when the image's content changes.

**`plan` as well as `apply` needs Docker running.** The SHA tag only keeps the *tag* stable
across a `plan` — the `docker` provider still pings the daemon as soon as it configures, and
`docker_image.app` refreshes through it on every plan, so a `plan` with no daemon reachable
fails outright (`Error: failed to create Docker client: Error pinging Docker server`), same
as an apply would. The provider honours `DOCKER_HOST` if your daemon isn't at the default
`/var/run/docker.sock` — Docker Desktop, OrbStack and Colima each set up their own context;
`docker context ls` shows which one is active.

**The trade-off worth knowing**: because the tag is the commit SHA, an uncommitted change
to the source is not built until it is committed. Run `git status` before an apply if the
image doesn't seem to reflect a recent edit.

**Registry token lifetime**: the push authenticates with a short-lived OAuth2 token
(`data.google_client_config.default.access_token`, providers.tf), minted when the plan runs
and valid for about an hour. A normal `terraform apply` run straight through has no trouble
with this — build and push together take about a minute. It only matters for a saved plan
(`terraform apply` on a `plan -out` file) applied much later, or a build that runs long
enough to outlast the token: the push then fails with an authentication error, and
re-running the apply (which mints a fresh token) is the fix.

## First apply (a new project)

1. Write the credentials: `pnpm make-credentials` (repo root, above).
2. Copy the example tfvars and fill it in: `cp terraform.tfvars.example terraform.tfvars`,
   then set `project_id` and `shelter_username` at least (every variable is documented in
   the file itself).
3. From this directory:

   ```sh
   terraform init
   terraform apply
   ```

   This one command creates every resource — buckets, service account, Artifact Registry
   repository, the image (built and pushed), and the Cloud Run service — in the right
   order.

The service's own URL is not known before it exists, so with `public_base_url` left empty
in the tfvars the first apply sets `PUBLIC_BASE_URL=https://placeholder.invalid` (the app
validates the value as a URL at boot and would refuse an empty one). Once the apply
finishes:

```sh
terraform output service_url
```

prints the real URL. Put it in `terraform.tfvars` as `public_base_url = "https://…"` and
apply once more — this also adds the URL to both buckets' CORS origins. The URL is stable
across revisions, so this happens once per environment.

Bucket names are global across Google Cloud. They default to
`<project_id>-cat-profiles-private` / `-public`; if a name is taken, set
`private_bucket_name` / `public_bucket_name` in the tfvars before the first apply (renaming a
bucket later means a new bucket and a copy).

## Public access

The published profile pages, the kiosk and the public bucket are meant to be readable by
anyone (the app does its own sign-in, ADR-011):

- **The service** has its invoker check disabled outright
  (`google_cloud_run_v2_service.invoker_iam_disabled = true`, cloud-run.tf) — Cloud Run's
  own switch for "answer anyone," not an IAM grant. This is unconditional: it works even
  where an organization forbids the alternative below.
- **The public bucket** grants `roles/storage.objectViewer` to `allUsers`, gated by the
  `public_access` variable (default `true`).

Some organizations enforce an org policy, `constraints/iam.allowedPolicyMemberDomains`,
that rejects any `allUsers` IAM binding project-wide (`Error 412 … do not belong to a
permitted customer`) — a project owner alone cannot lift it. That is exactly the bucket
grant above, not the service (which never used an `allUsers` binding to begin with — that
is the point of `invoker_iam_disabled`). Set `public_access = false` until the exception
lands: the stack still applies cleanly, and only the bucket goes private.

Lifting the org policy needs a project-level exception from an organization or folder
administrator, either in the console (IAM & Admin → Organization Policies →
`iam.allowedPolicyMemberDomains` → manage the policy → add a rule scoped to this project
that allows the value) or with `gcloud`:

```sh
gcloud org-policies set-policy - <<'EOF'
name: projects/<project-id>/policies/iam.allowedPolicyMemberDomains
spec:
  rules:
    - allowAll: true
EOF
```

Once the exception exists, set `public_access = true` in `terraform.tfvars` and apply.

## Every later apply

Deploying a new build of the app, from this directory:

```sh
terraform apply
```

It builds the current commit's image (skipping the build when Terraform already built this
exact tag *on this machine* — see "Building and pushing the image" above; on a fresh
machine, e.g. a GitHub runner or after `docker system prune`, the same commit is rebuilt
every time, just not re-pushed, since the registry already has that tag), pushes it, and
rolls the service only if the image's digest or any other setting actually changed.
Terraform asks for a `yes` unless you pass `-auto-approve` (what the GitHub workflow does).

To review before applying:

```sh
terraform plan
```

`plan` is the review artifact: on an unchanged commit and unchanged config it says "No
changes." Otherwise it must show no `allUsers` on the private bucket, the lifecycle rule on
it, and only the roles in `iam.tf` for the service account.

## Deploying from GitHub

`.github/workflows/deploy.yml` runs `terraform init` and `terraform apply` on a runner
under `workflow_dispatch` (someone presses "Run workflow"). The repository is local for now
(decisions Q1, Q3), so three things are not created yet and are manual steps for the day it
moves to GitHub:

1. **Workload Identity Federation** — the runner proves who it is with GitHub's OIDC token
   instead of a stored key. Create a pool and a provider that trust this repository, a deploy
   service account, and let the provider impersonate it:

   ```sh
   PROJECT=<project-id>
   REPO=<github-owner>/<repo-name>
   PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

   gcloud iam workload-identity-pools create github --project="$PROJECT" --location=global
   gcloud iam workload-identity-pools providers create-oidc github-actions \
     --project="$PROJECT" --location=global --workload-identity-pool=github \
     --issuer-uri=https://token.actions.githubusercontent.com \
     --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' \
     --attribute-condition="assertion.repository == '$REPO'"

   gcloud iam service-accounts create cat-profile-builder-deploy --project="$PROJECT"
   DEPLOY_SA="cat-profile-builder-deploy@$PROJECT.iam.gserviceaccount.com"
   gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project="$PROJECT" \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
   ```

   The deploy account needs what the apply touches: `roles/artifactregistry.admin` (create
   the repository, push), `roles/run.admin`, `roles/iam.serviceAccountUser` on the runtime
   account (to deploy as it), `roles/iam.serviceAccountAdmin` (creates
   `google_service_account.run` itself), `roles/resourcemanager.projectIamAdmin` (grants it
   project-level Vertex AI access), `roles/storage.admin` on the buckets and the state
   bucket, `roles/serviceusage.serviceUsageAdmin`. That is most of what `roles/editor` plus
   `roles/resourcemanager.projectIamAdmin` covers; start there and trim once a plan shows
   which of the narrower roles above are unused.

2. **State in a GCS bucket** — the runner has no `terraform.tfstate`. Create a versioned
   bucket:

   ```sh
   gcloud storage buckets create gs://<project-id>-terraform-state --location=<region> \
     --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets update gs://<project-id>-terraform-state --versioning
   ```

   `versions.tf` already carries a commented-out, generic `backend "gcs" {}` block — no
   bucket name in it, so it can be committed as-is once uncommented. The bucket name is
   supplied at `init` time instead, two different ways for the two places this runs:

   - **Locally**: a git-ignored `backend.hcl` beside the other `.tf` files
     (`infra/terraform/.gitignore` covers it, the same way it covers `terraform.tfvars`):

     ```hcl
     bucket = "<project-id>-terraform-state"
     prefix = "cat-profile-builder"
     ```

     Uncomment the `backend "gcs" {}` block, then migrate the existing local state into it:

     ```sh
     terraform init -backend-config=backend.hcl -migrate-state
     ```

   - **On the runner**: `deploy.yml` passes the same two values as `-backend-config` flags
     instead of a file, reading the bucket name from a repository variable,
     `TF_STATE_BUCKET` (table below) — nothing project-specific is ever committed to
     `deploy.yml` or `versions.tf` either way.

   From then on the local file is gone and both a laptop and the runner share one state.
   Same org policy caveat as everywhere else: the bucket is private, which is what state
   wants anyway.

3. **Every input as a repository secret or variable** — the runner has no
   `terraform.tfvars` and no `secrets.auto.tfvars`; every variable that has no default in
   `variables.tf` must arrive as an environment variable named `TF_VAR_<name>` (Terraform
   reads those on its own). `deploy.yml` sets:

   | Repository setting (Settings → Secrets and variables → Actions) | Maps to |
   |---|---|
   | Variable `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github-actions` |
   | Variable `GCP_DEPLOY_SERVICE_ACCOUNT` | the deploy account's email, from step 1 |
   | Variable `TF_STATE_BUCKET` | the state bucket's name from step 2 (no `gs://` prefix) |
   | Variable `GCP_PROJECT_ID` | `TF_VAR_project_id` |
   | Variable `SHELTER_USERNAME` | `TF_VAR_shelter_username` |
   | Variable `PUBLIC_BASE_URL` | `TF_VAR_public_base_url` (once known — "First apply" above) |
   | Secret `SESSION_SECRET` | `TF_VAR_session_secret` |
   | Secret `SHELTER_PASSWORD_HMAC` | `TF_VAR_shelter_password_hmac` |

   Paste the two secret values from your own `secrets.auto.tfvars`; when you rotate,
   update both. Every other variable in `variables.tf` keeps its default unless you also
   add it as a repository variable and to the workflow's `env:` block.

## Test buckets and the `@gcs` contract suite

This stack does not create a test bucket pair — the suite is opt-in and stays out of the
main stack's blast radius entirely. Create two scratch buckets by hand whose names end in
`-test` (any settings; the suite does not need CORS or versioning on them) and point
`GCS_PRIVATE_BUCKET` / `GCS_PUBLIC_BUCKET` at them with `GCS_CONTRACT_BUCKETS=1`:

```sh
gcloud storage buckets create gs://<project-id>-cat-profiles-private-test --location=<region>
gcloud storage buckets create gs://<project-id>-cat-profiles-public-test --location=<region>
```

The store contract suite (`tests/contract/stores.test.ts`) wipes `profiles/` in whatever it
is pointed at, so it only accepts names ending in `-test`. Never point the app at these. Run
it from the repo root:

```sh
GCS_CONTRACT_BUCKETS=1 \
GCS_PRIVATE_BUCKET=<project-id>-cat-profiles-private-test \
GCS_PUBLIC_BUCKET=<project-id>-cat-profiles-public-test \
GOOGLE_CLOUD_PROJECT=<project-id> \
pnpm vitest run tests/contract/stores.test.ts
```

Two things to know when reading its result:

- The signed-upload test needs a service-account identity: V4 signing calls IAM
  `signBlob`, which a user's ADC cannot do (`Cannot sign data without client_email`). To run
  it locally, point ADC at the runtime account first —
  `gcloud auth application-default login --impersonate-service-account=cat-profile-builder-run@<project-id>.iam.gserviceaccount.com`
  — and log back in normally afterwards. Your account needs Token Creator on the runtime
  account for that (`signer_developers` in the tfvars); Owner alone is not enough
  (`iam.serviceAccounts.getAccessToken` denied). Where the same org policy that blocks
  `allUsers` also rejects that binding (`Error 400: One or more users named in the policy
  do not belong to a permitted customer`), leave `signer_developers` empty and expect this
  one test to stay red locally until the project has an exception. On Cloud Run the account
  is the identity, so the app itself is unaffected.
- GCS allows roughly one write per second to the same object name. A test that rewrites
  the same document back-to-back can see a `429 rateLimitExceeded` once in a while; rerun.

## State

`terraform.tfstate` stays on this machine and is git-ignored (`.gitignore` here). It holds
resource ids **and the two credential values** (a `sensitive` variable is hidden in output,
not in state), so treat the file like `secrets.auto.tfvars`. When the repository moves to
GitHub and `deploy.yml` deploys, move state to a GCS backend and add a Workload Identity
pool ("Deploying from GitHub" above).

## Destroy

`terraform destroy` keeps the APIs enabled (`disable_on_destroy = false`) and refuses to
delete the app's buckets while they hold objects (`force_destroy = false`). The service is
deletable (`deletion_protection = false`) because it holds no data. The pushed image is kept
in the registry (`keep_remotely = true` on `docker_registry_image`) so a destroy does not
orphan a running revision elsewhere or make a rollback impossible. The hand-created `-test`
buckets ("Test buckets" above) are not managed by Terraform at all; delete them yourself
when you no longer need them.
