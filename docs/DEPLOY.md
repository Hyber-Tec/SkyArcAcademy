# Deploys

Production is the Firebase project **`skyarcacademy`**, served at **https://skyarcacademy.web.app** (and
`skyarcacademy.firebaseapp.com`; `skyarcacademy.com` moves here at launch). Production runs reviewed code only:
GitHub deploys `main` after every merge, once CI passes on `main`. Nobody deploys from a branch.

## How a merge reaches production

1. A pull request passes CI (`.github/workflows/ci.yml`: jobs "Typecheck, tests and builds" and "Security rules
   tests") and is merged.
2. CI runs again on `main`. When both pass, the `deploy` job builds the website with the Firebase web settings from
   GitHub secrets and runs `scripts/deploy.sh`: `firebase deploy --only hosting,firestore,database,storage --force`,
   then `--only functions`, then `scripts/open-callables.sh` (see "Cloud Functions").
3. The new version is live. To roll back Hosting: Firebase console → Hosting → Release history → Roll back. Functions
   roll back by reverting the change on `main`.

To redeploy `main` without a change: GitHub → Actions → CI → Run workflow on `main`, or
`gh workflow run CI --ref main --repo Hyber-Tec/SkyArcAcademy`.

## What gets deployed

| Target | From | Notes |
|---|---|---|
| Hosting | `web/dist` (built in CI) | The public website's pages are files of their own (`index.html`, `programs.html`, `ko/…`; a news post `/news/…` is `news-post.html`, by a rewrite), with `sitemap.xml` and `robots.txt`. Every other address serves the app except `/assets/…`, so a build file that a deploy removed answers "not found" instead of the app's page. A tab opened before a deploy reloads itself when it can't load a page (`web/src/app/staleBuild.ts`). |
| Firestore rules and indexes | `firestore.rules`, `firestore.indexes.json` | `--force` deletes indexes that aren't in the file: the file is the truth. |
| Realtime Database rules | `database.rules.json` | Deny-all. Nothing uses the Realtime Database yet. |
| Storage rules | `storage.rules` | Announcement files and the Drive's files (staff only, read through the rules), and the website's pictures (anyone reads them). See "Storage" below. |
| Cloud Functions | `functions/` (built by the predeploy step) | Gen 2, `us-central1`, running as `functions@`. See "Cloud Functions" below. |

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
  Firebase Realtime Database Admin, Service Usage Consumer, Firebase Viewer; for the functions also Cloud Functions
  Developer, Cloud Run Admin, Cloud Scheduler Admin, Artifact Registry Administrator and Secret Manager Viewer, and
  Service Account User on `functions@` and on the Compute Engine default account (see "Cloud Functions").

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
- The public website's pictures are the exception, on purpose: `branches/skyarc/website/` (the Website page's photos
  and the news covers, resized in the browser) is readable by anyone, and the site shows them by plain address
  (`https://firebasestorage.googleapis.com/v0/b/…/o/…?alt=media`), with no token. Only admins write there.
- `getBlob` in the browser needs CORS on the bucket: `storage.cors.json` allows GET from the app's addresses and the
  local dev servers. Applied on 2026-10-15; apply it again after changing the file:
  `gcloud storage buckets update gs://skyarcacademy.firebasestorage.app --cors-file=storage.cors.json`.
- Storage rules that call `firestore.get()` need the Storage service agent
  (`service-1025403274020@gcp-sa-firebasestorage.iam.gserviceaccount.com`) to hold
  `roles/firebaserules.firestoreServiceAgent`. A non-interactive deploy never grants it, so it was granted by hand on
  2026-10-15:

  ```bash
  gcloud projects add-iam-policy-binding skyarcacademy --role roles/firebaserules.firestoreServiceAgent \
    --member serviceAccount:service-1025403274020@gcp-sa-firebasestorage.iam.gserviceaccount.com
  ```

## Cloud Functions

Set up on 2026-10-15. HyberTec's organization shapes three things here:

- **No permissions for default service accounts** (`iam.automaticIamGrantsForDefaultServiceAccounts`). The functions
  run as their own account, **`functions@skyarcacademy.iam.gserviceaccount.com`** (`setGlobalOptions` in
  `functions/src/app.ts`), with only what they use: Cloud Datastore User, Firebase Authentication Admin, Firebase Cloud
  Messaging Admin, Eventarc Event Receiver, Cloud Run Invoker, Logs Writer, Storage Object Admin on the default
  bucket, and Secret Accessor on `GMAIL_APP_PASSWORD`.
- **Builds run as the Compute Engine default account** (`cloudbuild.useComputeServiceAccount`), which therefore holds
  Cloud Build Service Account. It also holds Cloud Run Invoker and Eventarc Event Receiver, which the Firebase CLI
  checks for before it creates event-triggered functions; nothing runs as it.
- **Only the organization's own members may appear in IAM policies** (`iam.managed.allowedPolicyMembers`), so
  `allUsers` can't be a Cloud Run invoker. Callable functions must be reachable by anyone (each checks the caller's
  sign-in itself), so `scripts/open-callables.sh` turns off the Cloud Run **invoker IAM check** on every service
  labeled `deployment-callable` instead, which the organization allows (`run.managed.requireInvokerIam` is off).
  The Firebase CLI tries to add `allUsers` only when it creates a callable, so the deploy that adds a new callable
  reports "set invoker" for it; `scripts/deploy.sh` then opens the callables and deploys once more, and that run
  succeeds. One callable needs no sign-in at all: `websiteMessage`, the public website's trial request and contact
  form, which checks what it gets, drops bots and limits each sender itself (`functions/src/website.ts`).

The email app password is the Secret Manager secret **`GMAIL_APP_PASSWORD`**: the Google app password of the sending
Gmail account (`SENDER_EMAIL` in `shared/src/brand.ts`). It was set on 2026-10-16, and Firebase manages the secret since
then. While it holds anything but a 16-letter app password, the functions send nothing and the app says email isn't set
up (an invite then shows its sign-in link to copy). The functions read the version that was current when they were
deployed, so after changing it, deploy `main` again:

```bash
firebase functions:secrets:set GMAIL_APP_PASSWORD --project skyarcacademy   # paste the 16-letter app password
gh workflow run CI --ref main --repo Hyber-Tec/SkyArcAcademy
```

When the command offers to re-deploy the functions itself, answer **No**: production gets its functions from `main`.
An app password is made at https://myaccount.google.com/apppasswords, signed in as the sending account, once its
2-Step Verification is on.

How it was set up, to recreate or audit it:

```bash
P=skyarcacademy; N=1025403274020
DEPLOY=github-deploy@$P.iam.gserviceaccount.com; RUNTIME=functions@$P.iam.gserviceaccount.com
COMPUTE=$N-compute@developer.gserviceaccount.com
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com secretmanager.googleapis.com compute.googleapis.com orgpolicy.googleapis.com --project $P
gcloud iam service-accounts create functions --project $P --display-name "Cloud Functions runtime"
for role in roles/datastore.user roles/firebaseauth.admin roles/firebasecloudmessaging.admin \
  roles/eventarc.eventReceiver roles/run.invoker roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $P --member serviceAccount:$RUNTIME --role $role --condition=None
done
gcloud storage buckets add-iam-policy-binding gs://$P.firebasestorage.app --member serviceAccount:$RUNTIME \
  --role roles/storage.objectAdmin
for role in roles/cloudbuild.builds.builder roles/run.invoker roles/eventarc.eventReceiver; do
  gcloud projects add-iam-policy-binding $P --member serviceAccount:$COMPUTE --role $role --condition=None
done
for role in roles/cloudfunctions.developer roles/run.admin roles/cloudscheduler.admin \
  roles/artifactregistry.admin roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding $P --member serviceAccount:$DEPLOY --role $role --condition=None
done
for sa in $RUNTIME $COMPUTE; do
  gcloud iam service-accounts add-iam-policy-binding $sa --project $P --member serviceAccount:$DEPLOY \
    --role roles/iam.serviceAccountUser
done
printf unset | gcloud secrets create GMAIL_APP_PASSWORD --project $P --replication-policy automatic --data-file=-
gcloud secrets add-iam-policy-binding GMAIL_APP_PASSWORD --project $P --member serviceAccount:$RUNTIME \
  --role roles/secretmanager.secretAccessor
```

## The academy's first data

`isMember` in the rules requires the academy's document, so production needs it before anyone can sign in. After the
first deploy, `npm run seed -- --owner <email> --owner-name "<name>"` (from `main`, with an owner's gcloud login)
creates `branches/skyarc`, its public profile and that first owner. It's safe to run again: anything that exists is
left alone. (Done on 2026-10-15.)

## Sample data

Until the academy's real data arrives (A1–A4 in `docs/QUESTIONS.md`), production runs on sample data, so the app can be
tried with real-looking weeks. `npm run seed:sample` adds:

- a manager and four coaches with pay rates, who's in each day (their hours: Monday three coaches from 4 PM, one leaving
  at 6; the other days two; Sunday two, one of them in turn; the manager every day without teaching), their days off
  ahead marked not available except one coach's Sundays (so the days still to set show), and time entries that follow
  their hours;
- the students' shooting: about 100 results, most as synthetic SIUS PDFs in their Drive folders (uploaded to
  Storage), a few typed paper cards, a few scanned ones with a made-up picture of the card (to try correcting a card on
  the website), and progress reports (shared with each family that has a sign-in, and one draft);
- 39 students with levels, rifle codes, programs and families (seven parents and three students with a sign-in);
- ten weeks of classes as on the academy's sheets (`docs/DECISIONS.md` §21): each class with six seats and four or five
  students grouped by level, make-ups ("MU for 10/13"), extra practice and trials (Trial 1 for the last half hour),
  absences, Thanksgiving, and one class ahead with no coach in (Tuesday 7 PM, to show the warning);
- announcements and events.

Everything is fictional (`shared/src/sample/data.ts`): document IDs start with `sample-`, and emails end in
`@skyarc-sample.test`, a reserved domain that never gets mail. Preview a coach's or a parent's view with View as (the
eye icon by your name). To try the kiosk, set a sample coach's PIN on their Employees page.

**To be a coach, a parent or a student for real** (the website and the phone app, with their access as the rules give
it), give an email you read a sample person's access: `npm run seed:sample -- --login coach=you+coach@gmail.com`,
`parent=you+parent@gmail.com` (the Hwang family's two children) or `student=you+student@gmail.com` (Jiwoo Hwang). Gmail
delivers `you+anything@gmail.com` to `you@gmail.com`. The academy's sign-in email goes to it; sign in there with a
password made for it (Create an account, with that email). `--remove` takes these logins away with the sample data.

**Before the real data is imported, remove it all**, once no App Store or Google Play review is under way (their
reviewers sign in as sample people): first `npx tsx scripts/review-logins.ts --remove`, then
`npm run seed:sample -- --remove`. It also deletes what the app
made for the sample people afterwards (their classes, time entries, kiosk PINs, notifications and audit entries) and
never touches anyone else; the Drive files' bytes go with their records. Running `npm run seed:sample` again
refreshes the classes around the new date, and replaces the sample's earlier schedule. **Don't run it on production
while a store review is under way:** since classes are taught together the sample's classes have no coach of their
own, and the phone app in review (1.0) still finds a coach's classes by their coach.

## Moving to skyarcacademy.com (launch)

The academy owns skyarcacademy.com, and moving the app there is the last step before launch. When it happens, also:

1. **Hosting:** add the domain in the Firebase console (Hosting → Add custom domain) and the DNS records it asks for
   at the academy's registrar.
2. **Sign-in:** add `skyarcacademy.com` to Authentication → Settings → Authorized domains. Keep `authDomain` on
   `skyarcacademy.firebaseapp.com` unless the domain's `/__/auth/handler` is registered on the Google OAuth client.
3. **The app's own address:** `APP_DOMAIN` in `shared/src/brand.ts` (links in emails), the origins in
   `storage.cors.json` (apply it again, see "Storage"), `og:image` in `web/app.html` and `web/index.html`, and the
   address in `CLAUDE.md` and `README.md`.
4. **The email sender (decided 2026-10-15):** emails go from HyberTec's Gmail until now. Ask the owner for an address on the
   academy's domain (e.g. a Google Workspace mailbox) so mail stops landing in spam; publish SPF, DKIM and DMARC for
   it, then change `SENDER_EMAIL` in `shared/src/brand.ts` and set its app password with
   `firebase functions:secrets:set GMAIL_APP_PASSWORD`.
5. **Sample data:** removed (see above).
6. **The public website:** real testimonials on the Website page, or the section shows samples marked "Sample"
   (`docs/DECISIONS.md` §18); `APP_URL` in `shared/src/brand.ts` also sets the site's canonical addresses, sitemap and
   robots.txt (built from it) and the `https://skyarcacademy.web.app` addresses in `web/index.html`; submit the
   sitemap in Google Search Console.
7. **Privacy policy:** in effect since 2026-10-20 (`web/src/site/pages/Legal.tsx`). It names the website by
   `APP_DOMAIN` (`shared/src/brand.ts`), so it follows the move; check the academy's contact details in Settings →
   Academy (the policy and Help show them), and update the stores' privacy policy and support addresses if they still
   point at skyarcacademy.web.app (both keep working there).

## Manual deploy (only when GitHub Actions is down)

From an up-to-date `main`, never from a branch:

```bash
git switch main && git pull
npm ci --prefix web && npm ci --prefix functions
npm --prefix web run build                           # reads web/.env.local
bash scripts/deploy.sh                               # with your own login: firebase login, gcloud auth login
```
