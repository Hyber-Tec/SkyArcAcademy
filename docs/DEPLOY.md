# Deploys

Production is the Firebase project **`skyarcacademy`**, served at **https://skyarcacademy.com** (the academy's domain,
"Moving to skyarcacademy.com" below), and at Firebase's own `skyarcacademy.web.app` and `skyarcacademy.firebaseapp.com`,
which keep working. Production runs reviewed code only:
GitHub deploys `main` after every merge, once CI passes on `main`. Nobody deploys from a branch.

## How a merge reaches production

1. A pull request passes CI (`.github/workflows/ci.yml`: jobs "Typecheck, tests and builds" and "Security rules
   tests") and is merged.
2. CI runs again on `main`. While the checks run, the job **Plan the deploy** works out what changed since the last
   successful deploy (`scripts/deploy-plan.ts`, see "What each deploy deploys") and, when the website changed, builds
   it for production with the Firebase web settings from GitHub secrets.
3. When both checks pass, **Deploy main to production** deploys only that, with `scripts/deploy.sh`:
   `firebase deploy --only` the website and the rules that changed, then the functions whose code changed, then
   `scripts/open-callables.sh` (see "Cloud Functions"). A merge that changes nothing production runs (the docs, the
   phone app) deploys nothing, and the deploy job is skipped.
4. The new version is live. To roll back Hosting: Firebase console → Hosting → Release history → Roll back. Functions
   roll back by reverting the change on `main`.

Runs on `main` go one at a time, in the order of the merges, so a deploy never puts an older `main` over a newer one.

To redeploy `main` without a change: GitHub → Actions → CI → Run workflow on `main`, or
`gh workflow run CI --ref main --repo Hyber-Tec/SkyArcAcademy`. A run started by hand deploys everything (the
Firebase CLI still skips a function whose code, settings and secrets' versions are unchanged).

**Functions left behind.** A deploy of every function at once (a change to the shared code they all bundle) can run
out of the region's Cloud Run CPU quota: a function whose new revision can't start ("Quota exceeded for total allowable
CPU per project per region") keeps serving its previous one. The CLI records it as deployed all the same, so later
deploys skip it as unchanged. `scripts/deploy.sh` checks for such services after the functions deploy (newest revision
not the one serving), waits a minute and deploys them again by name, which the CLI never skips; the job fails if any is
still behind. It happened on 2026-11-10 (#156: six of 62).

## What each deploy deploys

`scripts/deploy-plan.ts` compares `main` with the commit production runs: the last run on `main` whose deploy job
succeeded, from GitHub's record of CI's runs.

| What changed | What deploys |
|---|---|
| `web/`, or the shared code (`shared/src/`, not its tests) | Hosting: the website's production build |
| `firestore.rules`, `firestore.indexes.json` | Firestore's rules and indexes |
| `storage.rules` | Storage's rules |
| `database.rules.json` | The Realtime Database's rules |
| `functions/src/` or the shared code (not their tests) | The functions whose code changed, and new ones |
| `functions/package.json`, `package-lock.json` or `tsconfig.json` | Every function |
| The deploy itself: `.github/workflows/ci.yml`, `firebase.json`, `.firebaserc`, `scripts/deploy.sh`, `scripts/deploy-plan.ts` and its `lib/deploy-plan.ts`, `scripts/open-callables.sh` | Everything |
| Anything else: docs, the phone app, tests | Nothing |

- **A function's code** is what its module bundles, everything it imports included, as the functions' build bundles
  it (the functions in `functions/src/index.ts` itself: the entry without its re-exports). The plan bundles each
  module at both commits and deploys the functions whose bundle differs. So a change to shared code redeploys only the
  functions that use it, and a change to a comment redeploys none. The setup every function shares stays in
  `functions/src/app.ts`, which every module imports: a change there redeploys them all. Code that would change a
  function without its module importing it isn't seen, so don't write any (setup belongs in `app.ts`).
- **Everything** deploys when the plan can't tell: no earlier deploy found, the last deploy didn't finish (it may
  have deployed part of its commit), production's commit isn't in `main`'s history, or the functions' code couldn't
  be compared (then every function). A function removed from the code deploys every function, which deletes it.
- **Nothing** deploys when production already runs this commit or a newer one (an old run started again).
- To see what a deploy would do: `npx tsx scripts/deploy-plan.ts --base <production's commit> --head <commit>`.

## What gets deployed

| Target | From | Notes |
|---|---|---|
| Hosting | `web/dist` (built by Plan the deploy) | The public website's pages are files of their own (`index.html`, `programs.html`, `ko/…`; a news post `/news/…` is `news-post.html`, by a rewrite), with `sitemap.xml` and `robots.txt`. Every other address serves the app except `/assets/…`, so a build file that a deploy removed answers "not found" instead of the app's page. A tab opened before a deploy reloads itself when it can't load a page (`web/src/app/staleBuild.ts`). |
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
- Authorized domains: `localhost`, `skyarcacademy.firebaseapp.com`, `skyarcacademy.web.app`, and since 2026-11-06
  `skyarcacademy.com` and `www.skyarcacademy.com`.

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
  local dev servers. Applied on 2026-10-15, and again on 2026-11-06 with the academy's domain; apply it again after
  changing the file:
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
  bucket, Secret Accessor on `GMAIL_APP_PASSWORD` and `SCATT_KEYS`, and Service Usage Consumer, to call Google's text reader (Cloud
  Vision, `readResultsSheet`: a competition's results sheet read from its photo; switched on with Goo's OK on
  2026-10-28).
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
account (`SENDER_EMAIL` in `shared/src/brand.ts`), the academy's **info@skyarcacademy.com** since 2026-11-09 (HyberTec's
Gmail before; `docs/DECISIONS.md` §40). Firebase manages the secret. While it holds anything but a 16-letter app
password, the functions send nothing and the app says email isn't set up (an invite then shows its sign-in link to
copy). To change it:

1. **The console:** Google Cloud console (project skyarcacademy) → Security → **Secret Manager** →
   `GMAIL_APP_PASSWORD` → **Versions** → **New version** → paste the 16 letters (spaces don't matter) → leave
   **Disable all past secret versions** unticked (the live functions still read the old one) → **Add new version**.
2. **Deploy `main` again:** the functions read the version that was current when they were deployed. GitHub →
   Actions → CI → **Run workflow** on `main`, or `gh workflow run CI --ref main --repo Hyber-Tec/SkyArcAcademy`. A run
   started by hand deploys everything, so every function that sends mail picks the new password up.

- **Making an app password:** signed in to Google as info@, at https://myaccount.google.com/apppasswords, once the
  account's 2-Step Verification is on. If Google says app passwords aren't available, the academy's Workspace admin
  allows 2-Step Verification first: admin.google.com → Security → Authentication → 2-Step Verification.
- **Changing info@'s Google password revokes its app passwords:** the app's email stops (account emails fall back to
  Firebase's own) until a new one is saved this way.

How it was set up, to recreate or audit it:

```bash
P=skyarcacademy; N=1025403274020
DEPLOY=github-deploy@$P.iam.gserviceaccount.com; RUNTIME=functions@$P.iam.gserviceaccount.com
COMPUTE=$N-compute@developer.gserviceaccount.com
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com secretmanager.googleapis.com compute.googleapis.com orgpolicy.googleapis.com \
  vision.googleapis.com --project $P
gcloud iam service-accounts create functions --project $P --display-name "Cloud Functions runtime"
for role in roles/datastore.user roles/firebaseauth.admin roles/firebasecloudmessaging.admin \
  roles/eventarc.eventReceiver roles/run.invoker roles/logging.logWriter roles/serviceusage.serviceUsageConsumer; do
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
# SCATT's product keys, hex, a comma between keys (docs/DECISIONS.md §45): the SCATT import reads files with them.
# Never in the code or a chat: copied from the decoding research's private notes. Added 2026-11-10.
gcloud secrets create SCATT_KEYS --project $P --replication-policy automatic --data-file=<the keys' file>
gcloud secrets add-iam-policy-binding SCATT_KEYS --project $P --member serviceAccount:$RUNTIME \
  --role roles/secretmanager.secretAccessor
```

## The academy's first data

`isMember` in the rules requires the academy's document, so production needs it before anyone can sign in. After the
first deploy, `npm run seed -- --owner <email> --owner-name "<name>"` (from `main`, with an owner's gcloud login)
creates `branches/skyarc`, its public profile and that first owner. It's safe to run again: anything that exists is
left alone. (Done on 2026-10-15.)

## Sample data

Production has held the academy's real data since 2026-10-26 (`docs/DECISIONS.md` §21), so on production the sample
data lives only in the **demo academy** (`branches/demo`, §22), which owners switch to from the account menu ("Demo
data") to show the app. `npm run seed:sample` on production fills the demo academy (its first run makes it from the real
one: settings, website and owners) and refuses the real one; run it again before showing the app to bring its classes
around the day. On the emulators (the practice copy) it goes into the academy itself, or into a demo academy there with
`--academy demo`. It adds:

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
- announcements and events;
- five trial requests and questions from the website, three of them new (Home's Messages).

Everything is fictional (`shared/src/sample/data.ts`): document IDs start with `sample-`, and emails end in
`@skyarc-sample.test`, a reserved domain that never gets mail. Preview a coach's or a parent's view with View as (the
eye icon by your name). To try the kiosk, set a sample coach's PIN on their Employees page.

**To be a coach, a parent or a student for real** (the website and the phone app, with their access as the rules give
it), give an email you read a sample person's access: `npm run seed:sample -- --login coach=you+coach@gmail.com`,
`parent=you+parent@gmail.com` (the Hwang family's two children) or `student=you+student@gmail.com` (Jiwoo Hwang). Gmail
delivers `you+anything@gmail.com` to `you@gmail.com`. The academy's sign-in email goes to it; sign in there with a
password made for it (Create an account, with that email). `--remove` takes these logins away with the sample data.

**`npm run seed:sample -- --remove`** takes it all away, with what the app made for the sample people afterwards (their
classes, time entries, kiosk PINs, notifications and audit entries); it never touches anyone else, and the Drive files'
bytes go with their records. Running `npm run seed:sample` again refreshes the classes around the new date and
replaces the sample's earlier schedule. Production's sample data was removed this way on 2026-10-26, before the
academy's real data came in; the App Store's review account stayed, as an admin (`docs/publishing/store/review-notes.md`).

## Moving to skyarcacademy.com

The academy's domain, **skyarcacademy.com**, is registered at Squarespace, and its DNS is there too (Squarespace's
nameservers). Goo has the account since 2026-11-07. **Done on 2026-11-07**, as below: Firebase shows both
`skyarcacademy.com` and `www.skyarcacademy.com` Connected, and #119 moved the links to it. Until the move it showed the academy's earlier website,
through two A records for `@`.

The domain's email is Google Workspace (`info@`). Its records stay exactly as they are:

- the MX record (`smtp.google.com`);
- the SPF TXT record (`v=spf1 include:_spf.google.com ~all`);
- DKIM (`google._domainkey`) and DMARC (`_dmarc`).

Firebase's own addresses keep serving the same site after the move, so nothing that links to `skyarcacademy.web.app`
breaks: the phone app 1.0 and 1.1, and emails already sent.

1. **Claude Code, done on 2026-11-06:**
   - Sign-in's authorized domains include `skyarcacademy.com` and `www.skyarcacademy.com` (see "Sign-in settings").
   - The bucket's CORS allows both (see "Storage").
2. **Goo, Firebase** (console → Hosting → **Add custom domain**):
   - Enter `skyarcacademy.com`, leave the redirect box unticked, and **Continue**.
   - Choose **Advanced setup**, so the old website stays up until Firebase's certificate is ready.
   - It shows a **TXT** record (`hosting-site=skyarcacademy`, for ownership) and a second **TXT** record for the
     certificate (host `_acme-challenge`).
3. **Goo, Squarespace** (https://account.squarespace.com/domains → `skyarcacademy.com` → **DNS**):
   - Under **Custom records**, add both TXT records as Firebase shows them: Host `@` for the first, `_acme-challenge`
     for the second (without `.skyarcacademy.com`).
   - Squarespace may ask for the account's password or a 2-step code first.
   - Then **Verify** in Firebase.
4. **When Firebase says the certificate is ready** (usually within hours), switch the website:
   - In Squarespace, delete the two **A** records for `@`: `172.66.3.26` and `162.159.143.30`, the old website. Delete
     any **AAAA** for `@` too.
   - Add the **A** record Firebase shows: Host `@`, `199.36.158.100`.
   - The status goes to **Connected**. Squarespace's records are kept up to 4 hours by some networks, so a few people
     see the old site that long.
5. **`www`:**
   - In Firebase, **Add custom domain** `www.skyarcacademy.com`, and tick the box that redirects it to
     `skyarcacademy.com`.
   - Add the record it shows in Squarespace (the domain has no `www` record before this).
6. **Claude Code checks the domain:** DNS, the certificate, the pages, sign-in. Then
   [#119](https://github.com/Hyber-Tec/SkyArcAcademy/pull/119) is merged, which moves these to skyarcacademy.com:
   - `APP_DOMAIN` (every link in emails and notifications, the privacy policy's wording, the phone app's next build);
   - the website's canonical addresses, sitemap and robots.txt;
   - redirects from the old site's `/tuition`, `/schedule` and `/terms`;
   - the docs.
   It also drops the home page's sample quotes, which had to be real or gone before the domain points here
   (`docs/DECISIONS.md` §18).
7. **The email sender** (decided 2026-10-15 to wait for the domain): the academy's `info@` address sends since
   2026-11-09, with its app password in the `GMAIL_APP_PASSWORD` secret (above). The domain publishes SPF, DKIM and
   DMARC for Google Workspace.
8. **After the move:**
   - Google Search Console: add the domain and send the sitemap.
   - The stores' addresses (`docs/publishing/store/listing.md`): Google Play's any time; the App Store's Support and Marketing URLs
     with the next version.

Keep `authDomain` on `skyarcacademy.firebaseapp.com` unless the domain's `/__/auth/handler` is registered on the Google
OAuth client and Apple's Services ID first (`docs/TODO-notes.md`, "Google's sign-in window").

## Manual deploy (only when GitHub Actions is down)

From an up-to-date `main`, never from a branch:

```bash
git switch main && git pull
npm ci --prefix web && npm ci --prefix functions
npm --prefix web run build                           # reads web/.env.local
bash scripts/deploy.sh                               # everything; with your own login: firebase login, gcloud auth login
```
