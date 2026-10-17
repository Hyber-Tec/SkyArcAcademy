# Publishing the phone app

How to get Sky Arc onto people's phones through Apple and Google, when the app is ready: TestFlight first, then the App
Store and Google Play; what each step costs and how long it takes; what Apple and Google ask for that is not code
(written for you in [docs/store/](store/)); and how to put out updates afterwards with one command. Written so you can do
it alone. Nothing in it needs Claude Code except where it says "ask Claude Code".

**Nothing has been sent to Apple or Google.** Until the app is ready (owner, 2026-10-16), it goes on your own iPhone
over the cable with `npm run iphone` ([docs/running-the-apps.md](running-the-apps.md)): no TestFlight, no App Store
Connect.

Start with [Where things stand](#where-things-stand-2026-10-16) and [What Apple and Google will check](#what-apple-and-google-will-check).

## Where things stand (2026-10-16)

**Done:**
- **Firebase**: the iPhone app (`1:1025403274020:ios:e9806988e82e53cb6ae9b1`) and the Android app
  (`1:1025403274020:android:bbcc3273a22750b66ae9b1`) are registered in the skyarcacademy project, the Android one with
  the standard debug key's SHA-1 and SHA-256, so Google sign-in works in builds made on a Mac. Their files go in
  `mobile/firebase/` (`npm run phone:setup` downloads them; never in git).
- **The app's identity**: Sky Arc, `com.skyarcacademy.app`, version 1.0.0, build 1 (`mobile/release.json` holds the
  version and the number of the last build uploaded). It declares only standard encryption, so App Store Connect asks
  no export question. The id becomes permanent only when the first build is uploaded to App Store Connect.
- **Permissions**: the camera and the photo library, for the Scan tab only, with their texts in `mobile/app.config.ts`.
  No location, contacts, microphone, notifications or tracking.
- **In the app, what the stores look for**: **More → Delete my account** (it asks for the password, or Google, then the
  server function `deleteMyAccount` deletes the account), also on every screen an account can be stuck on (No access
  yet, Coming to the app, paused access, Confirm your email); **More → Privacy policy**; **More → Version**.
- **The commands**: `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots` (never run yet),
  and every text the stores ask for, in [docs/store/](store/).

**Decided:** a public listing from HyberTec's Apple account ([Public or unlisted](#public-or-unlisted)).

**Left, in this order, when you decide to publish** (each is explained further down):
1. **The academy's letter** allowing HyberTec LLC to publish the app under its name and logo
   ([Public or unlisted](#public-or-unlisted), guideline 5.2.1).
2. **The privacy policy** (https://skyarcacademy.web.app/privacy) is a draft for the academy's review. Before submitting,
   it must be in effect, and it must say what the phone app does: the camera and photo library, for photos of paper
   targets that go into the academy's Drive. Ask Claude Code to add that paragraph when the academy approves the policy.
3. **[A way in for the reviewers](#a-way-in-for-the-reviewers)**: a login on the real Sky Arc that doesn't show real
   students.
4. **The App Store Connect key and record, and TestFlight** ([part 1](#part-1-one-time-setup-on-your-mac),
   [part 2](#part-2-testflight)).
5. **Screenshots**: `npm run publish:screenshots` ([part 3](#part-3-the-app-store), step 2).
6. **The App Store submission** ([part 3](#part-3-the-app-store)), then **Google Play** ([part 4](#part-4-google-play)).

## Public or unlisted

**Decided (the owner, 2026-10-16): a public listing, published by HyberTec LLC from HyberTec's own Apple developer
account**, the one that already publishes HyberTec's apps and signs the testing builds. Anyone can find "Sky Arc" in the
App Store and download it; it still opens nothing without an account the academy made. Checked against Apple's pages on
2026-10-16; read them again before submitting.

- **What the two are.** Both are the real App Store: the same review, the same automatic updates. A **public** app
  shows when someone searches "Sky Arc". An **unlisted** app shows nowhere (no search, charts or categories): people
  install it from its link. Apple made unlisted for apps "not suited for public distribution", such as employee
  resources and apps for a limited audience (https://developer.apple.com/support/unlisted-app-distribution/).
- **Why public.** After approval Apple allows one change only: a public app can become unlisted, never the other way
  round ("Once your app is approved, the distribution method can't be changed. However, you can change a publicly
  available app to an unlisted app", https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods).
  Parents can find the app by its name when their part comes to it.
- **Unlisted only if Apple asks.** Apple sometimes refuses an app that serves one business's own people (guideline
  3.2) and points to unlisted distribution instead. If that happens: request it at
  https://developer.apple.com/contact/request/unlisted-app/, add "intended for unlisted distribution" to the review
  notes, and submit again. A round trip of a few days; nothing in the app changes.
- **HyberTec's account.** Nothing in Apple's rules stops a developer from publishing an app it builds and runs for a
  client: the store shows HyberTec LLC as the seller, and the testing builds have already registered the app's id,
  `com.skyarcacademy.app`, in HyberTec's account. Three review guidelines to be ready for:
  - **5.2.1:** an app should come from whoever owns or has licensed its name and logo, and "Sky Arc Sports Academy" is
    the academy's. Reviewers often ask for proof when the seller's name differs from the app's. Before submitting, get
    a short letter from the academy, signed by its owner, allowing HyberTec LLC to publish the Sky Arc app under the
    academy's name and logo. Attach it in **App Review Information → Attachment**; the review notes mention it.
  - **4.2.6 and 4.3:** Apple refuses apps made from a commercialized template and submitted by the template's
    provider for its clients, and copies of one app. Sky Arc's app grew from the same in-house code as Hyber CRM's, but
    it is its own product for one sport (the schedule by coach, paper targets scored from a photo). The review notes
    say so up front, and a reply is ready if a reviewer cites either ([docs/store/review-notes.md](store/review-notes.md)).
- **If the academy wants the app later.** App Store Connect can transfer an app to another developer account (the
  app's page → App Information → Transfer App), and people keep it without installing it again.

## What Apple and Google will check

### A way in for the reviewers

Reviewers can't use an app that needs an account without one, and Sky Arc has one academy: an admin login shows its
students, who are children. While production holds only the sample data (fictional people, `sample-` IDs), a review
login can be an admin of it. Once the academy's real students are in, a reviewer must not see them: before that
submission, ask Claude Code for a review login that sees only sample data. The review notes
([docs/store/review-notes.md](store/review-notes.md)) say which login to give.

### Deleting an account (Apple 5.1.1(v), Google's account deletion policy)

The app has no "create an account" (the academy invites people on the website), but signing in with Google for the
first time creates a sign-in, so the app offers **More → Delete my account**, and the same link on the screens an
account can be stuck on. Deleting removes the sign-in and the person's profile at once; the academy's own records
(classes, scores, reports, employees' pay) stay with the academy. Google also wants a web page that says how; the
privacy policy's "Your choices" section is that page (point to it with its address when the policy is in effect).

### Sign in with Apple (guideline 4.8)

The app signs people in with **Google** or an **email and a password**. Apple's guideline 4.8 asks an app with a
third-party sign-in such as Google to offer an equivalent private one (in practice, Sign in with Apple), with
exceptions; the one that fits Sky Arc: *"Your app is an education, enterprise, or business app that requires the user
to sign in with an existing education or enterprise account."* Nobody gets anything from the app without an account the
academy made: the academy adds a person's email address, only that address opens it, and Google or a password are two
ways of proving it is that address. Check Apple's page again before submitting
(https://developer.apple.com/app-store/review/guidelines/#login-services).

The review notes claim the exception. If Apple still asks for Sign in with Apple, ask Claude Code to add it (two to
three days of work): with "Hide My Email", the academy wouldn't recognize the address, so it needs one more step that
joins an Apple sign-in to the email the academy invited.

### The camera and the photos

Both stores ask why the app uses them: to photograph a paper target, or choose a photo of one, so the app can score it
and file it in the student's folder of the academy's Drive. The texts the phone shows are in `mobile/app.config.ts`;
the privacy answers in [docs/store/privacy-answers.md](store/privacy-answers.md) say the same.

### Children's information

The app is for the academy's office (adults), and it shows students' information, many of them children. It is not
made for children: in the age questions, answer that it isn't a Kids app; and the privacy policy's "Children" section
covers how the academy handles children's information.

### The privacy policy, inside the app too

Both stores want the policy's address in their forms (https://skyarcacademy.web.app/privacy, or the academy's domain
once it moves there) **and** a link to it inside the app (More → Privacy policy, done). It must say what the app really
does ([Where things stand](#where-things-stand-2026-10-16), item 2).

## The plan, and what it costs

| Stage | Money | Your time | Waiting |
| --- | --- | --- | --- |
| Apple Developer Program (HyberTec LLC) | $99 a year (HyberTec's membership, already paid for its apps) | – | – |
| App Store Connect: API key, app record, first TestFlight build | – | 1 hour | Build processing 10–30 min |
| TestFlight for you (internal testers) | – | 15 min | Minutes |
| TestFlight for the academy's office (external testers) | – | 15 min | Beta App Review, about a day per new version |
| Store texts, screenshots, privacy forms | – | 1–2 hours (texts are written; screenshots are a command) | – |
| App Review, first submission | – | 30 min | Usually 24–48 hours; a rejection adds a round trip of one to three days |
| Google Play developer account (HyberTec LLC), if HyberTec doesn't have one yet | $25 once | 30 min | Google's checks: days, sometimes weeks |
| Google Play: app setup, first upload, first review | – | 2 hours | First review up to 7 days |
| Every update afterwards | – | 5 min (one command) plus 2 min in each console | Apple 24–48 h, Google hours to days |

Nothing costs money per release.

## Part 1: One-time setup on your Mac

1. **An App Store Connect API key**, so the publishing command can upload builds without you typing a password each
   time. Sign in at https://appstoreconnect.apple.com → **Users and Access** → **Integrations** → **App Store Connect
   API** → **Team Keys** → **+**: name `Sky Arc publishing`, access **App Manager** → Generate. Click **Download API
   Key** (once only: Apple never offers it again). Note the **Issuer ID** (top of the page) and the key's **Key ID**.
   (HyberTec may already have such a key for its other app: a team key works for every app of the team, so you can
   reuse its file.)
2. Put the key where the command looks: in Terminal, in the Sky Arc folder,

   ```bash
   mkdir -p mobile/.publish
   mv ~/Downloads/AuthKey_*.p8 mobile/.publish/
   ```

   and create `mobile/.publish/appstore.json` (any plain-text editor; the folder is never in git):

   ```json
   { "keyId": "XXXXXXXXXX", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "" }
   ```

   **Leave `appleId` empty for now**: the app doesn't exist in App Store Connect until part 2 creates it. Back this
   folder up somewhere safe (a password manager): it is the only copy.
3. **Check the Mac can archive and sign the app:** `npm run publish:iphone -- --dry-run --no-bump`. It builds the App
   Store version without uploading it (10–20 minutes the first time) and ends with `✓ Ready to upload: …` and
   `Nothing was sent to Apple (--dry-run).` If it stops at the signing step, it says what to do; the logs are in
   `mobile/.expo/logs/publish-ios-*.log`.

## Part 2: TestFlight

Only when you decide the app is ready to share (not before: owner, 2026-10-16).

1. **The app's identifier at Apple.** Your first `npm run iphone` registers `com.skyarcacademy.app` in HyberTec's Apple
   account by itself. If you haven't run it: https://developer.apple.com/account/resources/identifiers → **+** → **App
   IDs** → **App** → Description `Sky Arc`, Bundle ID **Explicit** `com.skyarcacademy.app` → Continue → Register.
2. **Create the app record** at https://appstoreconnect.apple.com → **Apps** → **+** → **New App**: Platforms **iOS**;
   Name **Sky Arc** (if Apple says it's taken: **Sky Arc Sports Academy**; the name under the icon stays "Sky Arc");
   Primary Language **English (U.S.)**; Bundle ID **com.skyarcacademy.app**; SKU **skyarc**; User Access **Full
   Access** → **Create**.
3. Click Sky Arc → **App Information** → **General Information** shows **Apple ID**, a ten-digit number. Put it into
   `mobile/.publish/appstore.json` as `"appleId": "6740123456"` (your number, in quotes).
4. **Upload the first build:** in Terminal, `npm run publish:iphone`. It raises the build number in
   `mobile/release.json`, gets the iPhone project ready, builds, signs and uploads (15–25 minutes), and ends with
   `✓ Uploaded Sky Arc 1.0.0 (build 2) to App Store Connect.` Then ask Claude Code to "commit the release number": it
   opens a pull request with `mobile/release.json`, which you merge (never skip this, or the next upload reuses the
   number and Apple refuses it). On the **TestFlight** tab the build says "Processing" for 10–30 minutes.
5. **You as a tester** (internal testing: no review): **TestFlight** → **+** next to **Internal Testing** → group
   `HyberTec` → tick **Enable automatic distribution** → **Create** → **+** next to **Testers** → tick yourself →
   **Add**. On your iPhone, install **TestFlight** from the App Store, open Apple's invitation email → **View in
   TestFlight** → **Install**. (The TestFlight copy replaces the one `npm run iphone` installed: it is the same app.)
6. **The academy's office** (external testing): **TestFlight** → **+** next to **External Testing** → a group
   (`Sky Arc office`) → add testers by email. The first build of each version goes through a short **Beta App Review**
   (about a day). Paste [docs/store/testflight-notes.md](store/testflight-notes.md) into the build's **What to Test**.

## Part 3: The App Store

Do this once the TestFlight build is the one you want to ship.

1. **Prerequisites:** [Where things stand](#where-things-stand-2026-10-16), the list left.
2. **Screenshots:** in Terminal, `npm run publish:screenshots` (20–30 minutes; `-- --iphone` or `-- --android` for one
   store; [docs/store/listing.md](store/listing.md), "Screenshots"). It starts the practice copy, makes a simulator and
   an emulator of their own ("Sky Arc Screenshots"), installs a store-style build on each, signs in as the practice
   owner, opens the five tabs and saves the pictures into `mobile/.publish/screenshots/`. Look at each: the sample
   data's made-up names only.
3. **The version page:** App Store Connect → Sky Arc → **1.0 Prepare for Submission**:
   - **Screenshots:** the five files under **iPhone 6.9" Display**, in order (the app is iPhone-only).
   - **Promotional Text, Description, Keywords, Support URL, Marketing URL:** paste from
     [docs/store/listing.md](store/listing.md).
   - **Version:** `1.0.0`, to match the builds. **Copyright:** `2026 HyberTec LLC`.
   - **Build:** click **+** and choose the TestFlight build.
   - **App Review Information:** Sign-in required → **Yes**, with the review login
     ([A way in for the reviewers](#a-way-in-for-the-reviewers)); your name, phone and email for Apple to reach you;
     **Notes:** the Apple notes from [docs/store/review-notes.md](store/review-notes.md); **Attachment:** the academy's
     letter ([Public or unlisted](#public-or-unlisted)).
   - **Version Release:** **Manually release this version**. Click **Save**.
4. **App Information:** **Category** Sports, secondary Education; **Content Rights**: no third-party content; **Age
   Rating**: answer the questions as they are (not made for kids; no chat; no user-generated content shared outside the
   academy; no ads) and accept the rating Apple works out; **Privacy Policy URL**: the policy's address.
5. **App Privacy:** answer with [docs/store/privacy-answers.md](store/privacy-answers.md), item by item.
6. **Pricing and Availability:** Price **Free**; Availability: the **United States**; App Distribution Methods: as
   decided in [Public or unlisted](#public-or-unlisted).
7. **Submit for Review**. Apple answers within 24–48 hours in most cases. A rejection comes as a message in App Store
   Connect quoting the guideline number; answer from the same message thread. Give Claude Code the message to draft the
   reply or the fix.
8. **Release:** when approved, click **Release This Version**.

## Part 4: Google Play

1. **The developer account** at https://play.google.com/console (HyberTec LLC's, if it exists; otherwise **An
   organization**, with HyberTec LLC's legal name, address and D-U-N-S number, $25 once; Google's checks can take days).
2. **Create the app:** Play Console → **Create app**: **Sky Arc**, English (United States), **App**, **Free**.
3. **Set up your app** (the Dashboard lists each form; the texts are in [docs/store/](store/)): privacy policy; **App
   access** (the review login and the notes from [docs/store/review-notes.md](store/review-notes.md)); **Ads:** No;
   **Content rating**; **Target audience:** 18 and over (the office's app); **Data safety** from
   [docs/store/privacy-answers.md](store/privacy-answers.md); the store listing from
   [docs/store/listing.md](store/listing.md) with `icon-512.png`, `feature-graphic-1024x500.png` and the five phone
   screenshots from `mobile/.publish/screenshots/android/`.
4. **The first upload, by hand (once):** `npm run publish:android -- --dry-run`. The first time it makes Google Play's
   **upload key** (`mobile/.publish/upload.keystore`, with its password in `mobile/.publish/keystore.json`) and prints
   **"BACK BOTH FILES UP NOW"**: do it; without them no later update can be uploaded until Google resets the key. It
   also prints the key's **SHA-1 and SHA-256**. Then Play Console → **Test and release → Testing → Internal testing →
   Create new release**, keep **Google Play App Signing**, upload the `.aab` from `mobile/.expo/publish/android/`
   (⌘⇧. shows folders starting with a dot in Finder), roll it out, and ask Claude Code to "commit the release number".
5. **Fingerprints in Firebase, for Google sign-in:** Firebase console → project **skyarcacademy** → ⚙ **Project
   settings** → **Your apps** → the Android app → **Add fingerprint**: the upload key's SHA-1 and SHA-256 (step 4), and
   **Google's app signing key**'s (Play Console → **Test and release → Setup → App signing**). Then `npm run
   phone:setup` downloads the updated `google-services.json`. Without them, Google sign-in fails in copies from Google
   Play (email and password still work).
6. **The service account** the command uploads with from then on: Google Cloud console, project **skyarcacademy** →
   **IAM & Admin → Service Accounts → Create service account** (`play-publisher`, no roles) → **Keys → Add key → JSON**,
   saved as `mobile/.publish/play-service-account.json`; then Play Console → **Users and permissions → Invite new
   users** → its email → **App permissions → Sky Arc** → the release permissions → **Invite user**.
7. **Every later upload is one command:** `npm run publish:android` (Internal testing; `-- --track production` for
   Production; `-- --draft` leaves a draft; `-- --dry-run` builds without uploading).

## Part 5: Updates, with one command

1. Ask Claude Code for the change: it opens a pull request. Once merged, the website and server parts go live from
   `main` at once, for everyone.
2. In Terminal, in the Sky Arc folder on the newest `main` (`git switch main && git pull`: the stores get only merged,
   reviewed code): `npm run publish:iphone` and `npm run publish:android -- --track production`. Each raises the
   **build number** in `mobile/release.json`; then ask Claude Code to "commit the release number" and merge its pull
   request. Add `-- --version 1.1.0` for a new version number (Apple needs one per App Store release).
3. **Apple:** App Store Connect → Sky Arc → **+** → the new version → the build → "What's New" → **Submit for Review**.
   **Google:** with `--track production` the release goes to review by itself.
4. **Phones update by themselves**, usually within a day. More → Version shows what a phone has.

Changes to the website and the server reach everyone at once, with no app update; a change to the app itself goes out
as a release. A new permission (location, notifications) means new questions from both stores: Claude Code says so
when a change adds one.

## What is prepared, and what only you can do

Prepared in [docs/store/](store/) (edit anything you like; words in ALL CAPS need your details):

- `listing.md`: the stores' name, subtitle, descriptions and keywords; the screenshots and the command that makes them.
- `review-notes.md`: the notes for Apple's reviewer and Google's App access.
- `privacy-answers.md`: Apple's App Privacy answers and Google's Data safety answers, item by item.
- `testflight-notes.md`: "What to Test" for TestFlight testers.

Only you can: make the keys and accounts (the App Store Connect key, the Google Play account and its service account),
create the app records, submit, answer Apple's and Google's messages, and accept Apple's updated agreements when App
Store Connect shows a banner.
