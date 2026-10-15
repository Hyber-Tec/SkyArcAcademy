# Deploys

Production is the Firebase project **`skyarcacademy`**, served at **https://skyarcacademy.web.app** (and
`skyarcacademy.firebaseapp.com`; `skyarcacademy.com` moves here at launch). Production runs reviewed code only:
GitHub deploys `main` after every merge, once CI passes on `main`. Nobody deploys from a branch.

## How a merge reaches production

1. A pull request passes CI (`.github/workflows/ci.yml`, job `check`) and is merged.
2. CI runs again on `main`. When `check` passes, the `deploy` job builds the website with the Firebase web settings
   from GitHub secrets and runs `firebase deploy --only hosting,firestore,database,storage --force`.
3. The new version is live. To roll back Hosting: Firebase console → Hosting → Release history → Roll back.

To redeploy `main` without a change: GitHub → Actions → CI → Run workflow on `main`, or
`gh workflow run CI --ref main --repo Hyber-Tec/SkyArcAcademy`.

## What gets deployed

| Target | From | Notes |
|---|---|---|
| Hosting | `web/dist` (built in CI) | |
| Firestore rules and indexes | `firestore.rules`, `firestore.indexes.json` | `--force` deletes indexes that aren't in the file: the file is the truth. |
| Realtime Database rules | `database.rules.json` | Deny-all. Nothing uses the Realtime Database yet. |
| Storage rules | `storage.rules` | Deny-all until the report files arrive with the HyberCRM fork. See "Storage" below. |
| Cloud Functions | — | Not yet. They arrive with the HyberCRM fork; see "Adding Cloud Functions" below. |

## How GitHub signs in to Google Cloud (no keys)

The deploy job uses **Workload Identity Federation**: GitHub's OIDC token is exchanged for a short-lived token of the
service account `github-deploy@skyarcacademy.iam.gserviceaccount.com`. No service-account key exists. Never create one.

- Pool `github`, provider `github-actions` (issuer `https://token.actions.githubusercontent.com`). The provider only
  accepts tokens from repository ID `1419241358` (`Hyber-Tec/SkyArcAcademy`) owned by ID `280069423` (`Hyber-Tec`).
  IDs, unlike names, can't be reused by a renamed or recreated repository.
- Only tokens whose `ref` is `refs/heads/main` may act as the service account (`roles/iam.workloadIdentityUser` on
  `principalSet://…/workloadIdentityPools/github/attribute.ref/refs/heads/main`). Pull requests and other branches
  can't deploy.
- The binding uses the `ref` attribute, not the token's subject, because this repository uses GitHub's **immutable
  subject** format (`repo:Hyber-Tec@280069423/SkyArcAcademy@1419241358:…`, see
  `gh api repos/Hyber-Tec/SkyArcAcademy/actions/oidc/customization/sub`). A binding to the name-only subject
  `repo:Hyber-Tec/SkyArcAcademy:ref:refs/heads/main` never matches, and firebase-tools then reports only
  "Failed to authenticate, have you run firebase login?".
- The service account's project roles: Firebase Hosting Admin, Firebase Rules Admin, Cloud Datastore Index Admin,
  Firebase Realtime Database Admin, Service Usage Consumer, Firebase Viewer.

How it was created (2026-10-15), to recreate or audit it:

```bash
P=skyarcacademy; N=1025403274020; SA=github-deploy@$P.iam.gserviceaccount.com
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project $P
gcloud iam service-accounts create github-deploy --project $P --display-name "GitHub deploys from main"
gcloud iam workload-identity-pools create github --project $P --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-actions --project $P --location global \
  --workload-identity-pool github --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name" \
  --attribute-condition "assertion.repository_id == '1419241358' && assertion.repository_owner_id == '280069423'"
gcloud iam service-accounts add-iam-policy-binding $SA --project $P --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.ref/refs/heads/main"
for role in roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin \
  roles/firebasedatabase.admin roles/serviceusage.serviceUsageConsumer roles/firebase.viewer; do
  gcloud projects add-iam-policy-binding $P --member "serviceAccount:$SA" --role $role --condition=None
done
```

## Firebase web settings

The web config (API key, app ID, …) is never committed (CLAUDE.md, "Secrets").

- **Local:** `web/.env.local` (git-ignored). Copy `web/.env.example` and fill it from Firebase console →
  Project settings → Your apps → **Sky Arc**.
- **CI:** the repository's Actions secrets `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
  `VITE_FIREBASE_APP_ID`. Change one with `gh secret set <NAME> --repo Hyber-Tec/SkyArcAcademy`.

## Sign-in settings (Firebase Authentication)

- Providers: **Email/Password** and **Google**.
- Authorized domains: `localhost`, `skyarcacademy.firebaseapp.com`, `skyarcacademy.web.app`. Add `skyarcacademy.com`
  when the domain moves here.

## Storage

- The default bucket **`skyarcacademy.firebasestorage.app`** (US-CENTRAL1, Standard, uniform bucket-level access) was
  created on 2026-10-15 with the Firebase Storage API (`POST v1alpha/projects/skyarcacademy/defaultBucket`). Its
  location can't change.
- Progress reports (SIUS PDFs, target photos) live here. Files concern minors: the app reads them through the
  Storage rules (`getBlob`), never through `getDownloadURL` links, which bypass the rules.
- Storage rules that call `firestore.get()` need the Storage service agent
  (`service-1025403274020@gcp-sa-firebasestorage.iam.gserviceaccount.com`) to hold
  `roles/firebaserules.firestoreServiceAgent`. A non-interactive deploy never grants it, so it was granted by hand on
  2026-10-15:

  ```bash
  gcloud projects add-iam-policy-binding skyarcacademy --role roles/firebaserules.firestoreServiceAgent \
    --member serviceAccount:service-1025403274020@gcp-sa-firebasestorage.iam.gserviceaccount.com
  ```

## Adding Cloud Functions

When `functions/` lands, the pull request that adds it also adds `functions` to the deploy's `--only` list, grants
the deploy account the roles a Functions deploy needs (it creates Cloud Run services, Eventarc triggers, scheduler
jobs and secret bindings, and acts as the runtime service account), and records them here.

## Manual deploy (only when GitHub Actions is down)

From an up-to-date `main`, never from a branch:

```bash
git switch main && git pull
npm ci --prefix web && npm --prefix web run build    # reads web/.env.local
firebase deploy --only hosting,firestore,database,storage --project skyarcacademy
```
