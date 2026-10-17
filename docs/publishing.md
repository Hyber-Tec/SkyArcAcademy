# Publishing the phone app

How to get Sky Arc onto people's phones through Apple and Google, when the app is ready: TestFlight first, then the App
Store and Google Play; what each step costs and how long it takes; what Apple and Google ask for that is not code
(written for you in [docs/store/](store/)); and how to put out updates afterwards with one command. Written so you can do
it alone. Nothing in it needs Claude Code except where it says "ask Claude Code".

**Nothing has been sent to Apple or Google.** Until the app is ready (owner, 2026-10-16), it goes on your own iPhone
over the cable with `npm run iphone` ([docs/running-the-apps.md](running-the-apps.md)): no TestFlight, no App Store
Connect.

Start with [Where things stand](#where-things-stand-2026-10-17), then [Apple's checklist](#apples-checklist-checked-2026-10-17)
and [What Apple and Google will check](#what-apple-and-google-will-check).

## Where things stand (2026-10-17)

**Done:**
- **Who uses the app**: the academy's owners, admins and coaches, with the same five tabs (Home, Schedule, Scan,
  Students, More). A coach sees their own classes and every student without the families' contact details, scans cards,
  and corrects or deletes scores. Parents and students who sign in get the family's four tabs (Home, Classes, Reports,
  More): their children's or their own classes, and the progress reports the academy shared.
- **Firebase**: the iPhone app (`1:1025403274020:ios:e9806988e82e53cb6ae9b1`) and the Android app
  (`1:1025403274020:android:bbcc3273a22750b66ae9b1`) are registered in the skyarcacademy project, the Android one with
  the standard debug key's SHA-1 and SHA-256, so Google sign-in works in builds made on a Mac. Their files go in
  `mobile/firebase/` (`npm run phone:setup` downloads them; never in git).
- **The app's identity**: Sky Arc, `com.skyarcacademy.app`, version 1.0.0, build 1 (`mobile/release.json` holds the
  version and the number of the last build uploaded). It declares only standard encryption, so App Store Connect asks
  no export question. The id becomes permanent only when the first build is uploaded to App Store Connect. It is built
  with Xcode 27 (the iOS 27 SDK) for iOS 16.4 and later, which meets Apple's minimum today and the one coming in April
  2027.
- **Permissions**: the camera, and photos chosen in the phone's own photo picker, for the Scan tab only, with their texts
  in `mobile/app.config.ts`. No location, contacts, microphone, notifications or tracking.
- **In the app, what the stores look for**: **More → Delete my account** (it asks for the password, or Google, then the
  server function `deleteMyAccount` deletes the account), also on every screen an account can be stuck on (No access
  yet, paused access, Confirm your email); **More → Privacy policy**; **More → Version**.
- **The commands**: `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots` (never run yet),
  and every text the stores ask for, in [docs/store/](store/).

**Decided:** a public listing from HyberTec's Apple account ([Public or unlisted](#public-or-unlisted); read its note
on guideline 3.2 before submitting). No Sign in with Apple for now
([Sign in with Apple](#sign-in-with-apple-guideline-48)).

**Left, in this order, when you decide to publish** (each is explained further down, and
[Apple's checklist](#apples-checklist-checked-2026-10-17) has them step by step):
1. **The academy's written permission** for HyberTec LLC to publish the app under its name and logo
   ([Public or unlisted](#public-or-unlisted), guideline 5.2.1).
2. **The privacy policy** (https://skyarcacademy.web.app/privacy) is a draft for the academy's review. Before submitting,
   it must be in effect, and it must say what Apple's guideline 5.1.1(i) asks
   ([The privacy policy](#the-privacy-policy-inside-the-app-too)). Ask Claude Code for the changes when the academy
   approves the policy.
3. **Two small changes in the app** (ask Claude Code): a way to contact the academy from inside the app (guideline 1.5),
   and the privacy policy linked before signing in too ([Apple's checklist](#apples-checklist-checked-2026-10-17)).
4. **[A way in for the reviewers](#a-way-in-for-the-reviewers)**: an admin and a coach login on the real Sky Arc that
   don't show real students.
5. **The App Store Connect key and record, and TestFlight** ([part 1](#part-1-one-time-setup-on-your-mac),
   [part 2](#part-2-testflight)).
6. **Screenshots**: `npm run publish:screenshots` ([part 3](#part-3-the-app-store), step 2).
7. **The App Store submission** ([part 3](#part-3-the-app-store)), then **Google Play** ([part 4](#part-4-google-play)).

## Apple's checklist (checked 2026-10-17)

What Apple's rules ask of Sky Arc, read against the App Review Guidelines dated October 16, 2026 and App Store Connect's
help pages on 2026-10-17. The numbers are Apple's guideline numbers, the ones reviewers quote. Apple changes these pages
several times a year: before submitting, look at the "Last Updated" date at the bottom of
https://developer.apple.com/app-store/review/guidelines/, and if it is newer, ask Claude Code to check again.

### Already done in the app

- **Signing in inside the app** (Google's own sheet, or email and password), no sign-up in the app, and access only for
  an email the academy added (4.0; for 4.8 see [Sign in with Apple](#sign-in-with-apple-guideline-48)).
- **Delete my account** in More and on every screen an account can be stuck on, with what the academy keeps said on
  screen (5.1.1(v)).
- **The privacy policy linked in More and before signing in** (sign-in, "No access yet", paused access) (5.1.1(i); the
  policy is written but not yet in effect, below).
- **Help** in More and before signing in: the website's Help page (https://skyarcacademy.web.app/help), with the
  academy's contact details from Settings → Academy and HyberTec's email for problems with the app (1.5). It's also the
  Support URL.
- **The camera and the photo picker for Scan only**, with clear texts; nothing saved to the phone's photos; no
  microphone, location or contacts (2.5.14, 5.1.1(ii) to (iv)).
- **No ads, analytics, tracking, purchases or outside AI service**: the paper card is read on the phone itself (3.1,
  5.1.2).
- **Built with Xcode 27** (the iOS 27 SDK): Apple has required the iOS 26 SDK since April 2026 and requires the iOS 27
  SDK from April 2027 (2.5.1).
- **Standard encryption only**, declared in the app, so App Store Connect asks no export question.
- **A privacy manifest** listing why the app uses the functions Apple asks about, and the same from the outside code it
  includes, with two exceptions to check at the first upload (below).
- **No hidden features**: the practice copy and the developer menu exist only in development builds (2.5.19).

### Needs a change first (ask Claude Code)

1. **The privacy policy in effect** (5.1.1(i), 2.1): it now says everything in
   [The privacy policy](#the-privacy-policy-inside-the-app-too) (2026-10-17); once the academy approves it, Claude Code
   sets its date in effect, which takes the "Draft" banner away.
2. **Optional:** keep the developer client's local network text out of store builds (5.1.1(ii)); disconnect Google too
   when someone deletes their account.

### Your part, step by step

1. **Decide public or unlisted**, knowing guideline 3.2 ([Public or unlisted](#public-or-unlisted)). If you'd like
   Apple's view first, request a free 30-minute App Review appointment (video, Tuesdays and Thursdays):
   https://developer.apple.com/help/app-review/before-submitting-for-review/app-review-appointment. It is advice only:
   Apple "cannot preapprove apps".
2. **The academy's written permission** for its name and logo (5.2.1, 4.1): a short signed letter, the clause in
   HyberTec's signed agreement with the academy, or an email from the academy's owner. Apple accepts any of these.
3. **The privacy policy**: the academy approves it (https://skyarcacademy.web.app/privacy), then Claude Code puts it in
   effect.
4. **The Support URL**: https://skyarcacademy.web.app/help. Fill in the academy's email and phone in the website's
   Settings → Academy first: the Help page shows them (1.5).
5. **The review logins**: ask Claude Code ([A way in for the reviewers](#a-way-in-for-the-reviewers)).
6. **Apple's agreement and the EU question**: the Account Holder of HyberTec's Apple account signs in at
   https://developer.apple.com/account and accepts the Apple Developer Program License Agreement updated on
   2026-10-13 (App Store Connect blocks submissions until it's accepted). In App Store Connect → **Business** →
   **Agreements**, check that **Digital Services Act** has an answer for HyberTec LLC: Apple asks every account, even one
   that doesn't sell in the European Union. Sky Arc is offered in the United States only.
7. **[Part 1](#part-1-one-time-setup-on-your-mac) and [part 2](#part-2-testflight)**: the key, the app record, the first
   TestFlight build. Then the checks below.
8. **[Part 3](#part-3-the-app-store)**: the App Store Connect pages (content rights, age rating, privacy answers,
   availability, review information), then **Submit for Review**.

### Check at the first upload and on test devices

- **Apple's email after the upload.** If it mentions ITMS-91061 (a missing privacy manifest) or ITMS-91065 (a missing
  signature), give it to Claude Code. Two parts of today's build carry neither: the image library that comes with
  Expo's prebuilt modules (SDWebImage) and React Native's JavaScript engine (Hermes), both on Apple's list. The fix is a
  build setting and a new upload.
- **iPad and iPhone Duo.** An iPhone-only app still installs on iPads (in a compatibility mode) and fills the inside
  screen of iPhone Duo (on sale from 2026-10-23); reviewers may use either. Before submitting, open the build on an iPad
  simulator and on the iPhone Duo simulator (Xcode 27.1) and go through the five tabs (2.1, 2.4.1).
- **The screenshot size.** App Store Connect now names the required iPhone size "iPhone with Dynamic Island (medium
  display)" (1206 × 2622); the command makes the large size (1320 × 2868), which it accepts too. If the version page
  still asks for the medium one, ask Claude Code to add it to the command.
- **The privacy answers.** Xcode's privacy report of the archive (Xcode → **Window** → **Organizer** → the archive →
  **Generate Privacy Report**) should agree with [docs/store/privacy-answers.md](store/privacy-answers.md).

### Later, when it applies

- **Parents and students in the app**: the 3.2 question becomes easier (an app for the academy's customers, not only its
  staff); children's privacy law and new state laws on age checks apply once students sign in
  ([Children's information](#childrens-information)); the age rating answers stay right unless chat, posts or comments
  come to the app.
- **Push notifications** (4.5.4, 5.1.2): never required to use the app, nothing confidential in them, no marketing
  without the person's consent; App Privacy gains "Device ID" ([part 5](#part-5-updates-with-one-command)).
- **From April 2027**: builds made with Xcode 27.1 or later need iPhone Duo screenshots too.

## Public or unlisted

**Decided (the owner, 2026-10-16): a public listing, published by HyberTec LLC from HyberTec's own Apple developer
account**, the one that already publishes HyberTec's apps and signs the testing builds. Anyone can find "Sky Arc" in the
App Store and download it; it still opens nothing without an account the academy made. Checked against Apple's pages on
2026-10-17; read them again before submitting.

- **What the two are.** Both are the real App Store: the same review, the same automatic updates. A **public** app
  shows when someone searches "Sky Arc". An **unlisted** app shows nowhere (no search, charts or categories): people
  install it from its link. Apple made unlisted for apps "not suited for public distribution", such as employee
  resources and apps for a limited audience (https://developer.apple.com/support/unlisted-app-distribution/).
- **Why public.** After approval Apple allows one change only: a public app can become unlisted, never the other way
  round ("Once your app is approved, the distribution method can't be changed. However, you can change a publicly
  available app to an unlisted app", https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods).
  Parents can find the app by its name when their part comes to it.
- **The likeliest rejection: guideline 3.2.** App Review refuses an app it finds "designed for a specific business or
  organization, including its partners, clients or employees, and not for general distribution on the App Store",
  because "Business apps available on the App Store are meant for use by a wide variety of external customers" (the
  wording of a 3.2 rejection). While the app serves only the academy's staff, that describes Sky Arc; once parents and
  students use it, it serves the academy's customers, which suits a public listing better.
- **Unlisted if Apple asks, but it is for good.** If App Review answers with 3.2: request unlisted distribution at
  https://developer.apple.com/contact/request/unlisted-app/, add "intended for unlisted distribution" to the review
  notes, and reply ([docs/store/review-notes.md](store/review-notes.md)). A round trip of a few days; nothing in the app
  changes. But Apple lets a public app become unlisted, never the other way, so the families' version would stay
  unlisted too. Three ways to weigh it: accept that; keep the staff on TestFlight until the families' part is in the app
  and submit the public listing then; or ask in an App Review appointment first
  ([Apple's checklist](#apples-checklist-checked-2026-10-17), step 1).
- **HyberTec's account.** Nothing in Apple's rules stops a developer from publishing an app it builds and runs for a
  client: the store shows HyberTec LLC as the seller, and the testing builds have already registered the app's id,
  `com.skyarcacademy.app`, in HyberTec's account. Three review guidelines to be ready for:
  - **5.2.1:** an app should come from whoever owns or has licensed its name and logo, and "Sky Arc Sports Academy" is
    the academy's. Reviewers often ask for proof when the seller's name differs from the app's. Before submitting, get
    the academy's written permission for HyberTec LLC to publish the Sky Arc app under the academy's name and logo: a
    short letter signed by its owner, the clause in HyberTec's signed agreement with the academy, or an email from the
    academy's owner (Apple accepts "a signed contract, electronic communication (emails …), or licensing documents").
    Attach it in **App Review Information → Attachment**; the review notes mention it.
  - **4.2.6 and 4.3:** Apple refuses apps made from a commercialized template and submitted by the template's
    provider for its clients, and copies of one app. Sky Arc's app grew from the same in-house code as Hyber CRM's, but
    it is its own product for one sport (the schedule by coach, paper targets scored from a photo). The review notes
    say so up front, and a reply is ready if a reviewer cites either ([docs/store/review-notes.md](store/review-notes.md)).
- **If the academy wants the app later.** App Store Connect can transfer an app to another developer account (the
  app's page → App Information → Transfer App), and people keep it without installing it again.

## What Apple and Google will check

### A way in for the reviewers

Reviewers can't use an app that needs an account without one, and Sky Arc has one academy: an admin login shows its
students, who are children. Apple also asks for a login for each kind of account the app has; Sky Arc's app has two
today, the office (owners and admins) and coaches. While production holds only the sample data (fictional people,
`sample-` IDs), the review logins can be an admin and a coach of it. Once the academy's real students are in, a reviewer
must not see them: before that submission, ask Claude Code for review logins that see only sample data. Either way:
their emails must already be confirmed (otherwise the app stops at "Confirm your email"), and their passwords must not
change while Apple reviews ("Credentials that expire or change before your review starts may result in the submission
being rejected"). The review notes ([docs/store/review-notes.md](store/review-notes.md)) say which logins to give.

### Deleting an account (Apple 5.1.1(v), Google's account deletion policy)

The app has no "create an account" (the academy invites people on the website), but signing in with Google for the
first time creates a sign-in, so the app offers **More → Delete my account**, and the same link on the screens an
account can be stuck on. Deleting removes the sign-in and the person's profile at once; the academy's own records
(classes, scores, reports, employees' pay) stay with the academy. Google also wants a web page that says how, for
people without the app: the Help page's "Deleting your account" (https://skyarcacademy.web.app/help), with the privacy
policy's "Your choices" behind it.

### Sign in with Apple (guideline 4.8)

The app signs people in with **Google** or an **email and a password**. Apple's guideline 4.8 says an app that uses a
sign-in like Google's "must also offer as an equivalent option another login service" that collects only the name and
email, lets people keep their email private, and doesn't track them for ads. Sign in with Apple is the usual one, but
the rule doesn't name it, and it has exceptions. The one that fits Sky Arc: *"Your app is an education, enterprise, or
business app that requires the user to sign in with an existing education or enterprise account."* Nobody gets anything
from the app without an account the academy made: the academy adds a person's email address, only that address opens
it, the app has no sign-up, and Google or a password are two ways of proving it is that address. Checked on 2026-10-17
(https://developer.apple.com/app-store/review/guidelines/#login-services); check again before submitting.

**Decided by this check: no Sign in with Apple for now.** It would help nobody here: with "Hide My Email", Apple gives
the app a private address the academy doesn't know, so it would open nothing, and Apple's own design guide asks apps not
to ask for the real address afterwards. The review notes claim the exception, and a reply is ready
([docs/store/review-notes.md](store/review-notes.md)). Reviewers judge this case by case, so a rejection quoting 4.8 is
possible.

If Apple still asks after one reply, there are two ways out:
1. **Email and password only in the iPhone app** (the quickest: an hour or two of work, then a new build). Guideline 4.8
   then doesn't apply at all: *"Your app exclusively uses your company's own account setup and sign-in systems."*
   Google stays on the website and on Android. Whoever only uses Google adds a password once: on the website, their
   account → **Add a password**, or **Forgot password?** in the app.
2. **Add Sign in with Apple** (three to four days of work, and setup on Apple's and Firebase's sites: the capability on
   the app's id, a key, Apple's email relay for the academy's emails, and the Apple sign-in in Firebase). People would
   join it to their academy account after signing in once with Google or their password, and deleting an account
   would also cancel Apple's sign-in. Worth it only if the academy wants one-tap sign-in on iPhones, for families for
   example.

### The camera and the photos

Both stores ask why the app uses them: to photograph a paper target, or choose a photo of one (in the phone's own photo
picker, which hands the app only the photo chosen), so the app can score it and file it in the student's folder of the
academy's Drive. The texts the phone shows are in `mobile/app.config.ts`; the privacy answers in
[docs/store/privacy-answers.md](store/privacy-answers.md) say the same.

### Children's information

The app is for the academy's staff (adults), and it shows students' information, many of them children. It is not made
for children: never choose **Made for Kids**, and keep words like "for kids" out of the store texts (Apple keeps them
for its Kids category). Apple's age questions changed in 2025 and 2026; the answers are in
[docs/store/listing.md](store/listing.md), "Age rating": "None" or "No" everywhere except **Guns or Other Weapons:
Infrequent** (the app is about air rifle shooting), which gives a **9+** rating. The privacy policy's "Children" section
covers how the academy handles children's information.

When students get their own logins (some of them under 13), two things for HyberTec and a lawyer rather than for
Apple's review: the US children's privacy law (COPPA, updated in 2025), and the 2026 laws in Texas, Utah and Louisiana
that ask app makers to check, through Apple, the age group of people there and to respect their parents' consent
(Apple's "Declared Age Range"; Claude Code can add it, with a new build). Apple says its review doesn't change for these
laws, but they apply wherever the app is downloaded in those states.

### The privacy policy, inside the app too

Both stores want the policy's address in their forms (https://skyarcacademy.web.app/privacy, or the academy's domain
once it moves there) **and** a link to it inside the app (More → Privacy policy, and under the sign-in form: done).
Apple's guideline 5.1.1(i) says the policy must clearly (the draft does all of this since 2026-10-17):
- say what the app collects, **how** it collects it, and every use: for the phone app, signing in (Google or a
  password), and the camera or the photo picker in Scan, with the photo and its scores filed in the student's Drive
  folder and nothing saved to the phone's photos;
- confirm that the companies helping to run the app "will provide the same or equal protection of user data" as the
  policy (today's draft only says they use it to provide their service);
- explain how long information is kept and how it's deleted, and how people withdraw consent or ask for deletion:
  **Delete my account** in the app and what the academy keeps, and that camera and photo access can be turned off in
  the iPhone's Settings.

And it must be in effect: no "Draft" banner (a page marked as a draft is the kind of temporary content guideline 2.1
rejects).

### Help and contact (guideline 1.5)

"Make sure your app and its Support URL include an easy way to contact you; this is particularly important for apps
that may be used in the classroom." Done: the website's Help page (https://skyarcacademy.web.app/help) is the Support
URL and opens from More → Help and under the sign-in form. It shows the academy's contact details from Settings →
Academy (fill in its email and phone there) and HyberTec's email for problems with the app.

## The plan, and what it costs

| Stage | Money | Your time | Waiting |
| --- | --- | --- | --- |
| Apple Developer Program (HyberTec LLC) | $99 a year (HyberTec's membership, already paid for its apps) | – | – |
| App Review appointment, if you want Apple's view first (optional) | – | 30 min | Tuesdays and Thursdays |
| App Store Connect: API key, app record, first TestFlight build | – | 1 hour | Build processing 10–30 min |
| TestFlight for you (internal testers) | – | 15 min | Minutes |
| TestFlight for the academy's staff (external testers) | – | 15 min | Beta App Review, about a day per new version |
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
6. **The academy's staff** (external testing): first **TestFlight** → **Test Information**: the **Beta App
   Description** and **Feedback Email** from [docs/store/testflight-notes.md](store/testflight-notes.md), and the review
   login (Apple's beta review signs in too). Then **+** next to **External Testing** → a group (`Sky Arc staff`) → add
   testers by email. The first build of each version goes through a short **Beta App Review** (about a day), which uses
   the same guidelines as the App Store. Paste the notes' "What to Test" into the build's **What to Test**.

## Part 3: The App Store

Do this once the TestFlight build is the one you want to ship.

1. **Prerequisites:** [Where things stand](#where-things-stand-2026-10-17), the list left, and
   [Apple's checklist](#apples-checklist-checked-2026-10-17).
2. **Screenshots:** in Terminal, `npm run publish:screenshots` (20–30 minutes; `-- --iphone` or `-- --android` for one
   store; [docs/store/listing.md](store/listing.md), "Screenshots"). It starts the practice copy, makes a simulator and
   an emulator of their own ("Sky Arc Screenshots"), installs a store-style build on each, signs in as the practice
   owner, opens the five tabs and saves the pictures into `mobile/.publish/screenshots/`. Look at each: the sample
   data's made-up names only.
3. **The version page:** App Store Connect → Sky Arc → **1.0 Prepare for Submission**:
   - **Screenshots:** the five files in the iPhone slot for the large display (6.9-inch, 1320 × 2868), in order (the
     app is iPhone-only). If the page also marks the medium size (6.3-inch, "iPhone with Dynamic Island (medium
     display)") as required, ask Claude Code to add that size to the command.
   - **Promotional Text, Description, Keywords, Support URL, Marketing URL:** paste from
     [docs/store/listing.md](store/listing.md).
   - **Version:** `1.0.0`, to match the builds. **Copyright:** `2026 HyberTec LLC`.
   - **Build:** click **+** and choose the TestFlight build.
   - **App Review Information:** Sign-in required → **Yes**, with the admin review login; the coach login goes in the
     notes ([A way in for the reviewers](#a-way-in-for-the-reviewers)); your name, phone and email for Apple to reach
     you; **Notes:** the Apple notes from [docs/store/review-notes.md](store/review-notes.md), with the devices you
     tested on; **Attachment:** the academy's written permission ([Public or unlisted](#public-or-unlisted)).
   - **Version Release:** **Manually release this version**. Click **Save**.
4. **App Information:** **Category** Sports, secondary Education; **Content Rights**: **Yes**, the app shows
   third-party content (the academy's name, logo and records) and you have the rights to it (the academy's permission);
   **Age Rating**: **Set Up Age Ratings** with the answers in [docs/store/listing.md](store/listing.md), "Age rating"
   (Apple works out 9+); **Privacy Policy URL**: the policy's address. If a **Digital Goods and Services** section asks
   whether customers can consume digital goods or services in the app: **No**.
5. **App Privacy:** answer with [docs/store/privacy-answers.md](store/privacy-answers.md), item by item.
6. **Pricing and Availability:** Price **Free**; Availability: the **United States**; App Distribution Methods: as
   decided in [Public or unlisted](#public-or-unlisted). Untick the availability on **Mac** (Apple silicon) and on
   **Apple Vision Pro**: Apple offers iPhone apps there by default, and this one is made for the iPhone and its camera
   (Apple: "camera-based apps are not well suited for visionOS").
7. **Submit for Review**. Apple answers within 24–48 hours in most cases. A rejection comes as a message in App Store
   Connect quoting the guideline number; answer from the same message thread. Replies to the likeliest ones (4.8, 3.2,
   and 5.2.1, 4.2.6 or 4.3) are ready in [docs/store/review-notes.md](store/review-notes.md); for anything else, give
   Claude Code the message to draft the reply or the fix.
8. **Release:** when approved, click **Release This Version**.

## Part 4: Google Play

1. **The developer account** at https://play.google.com/console (HyberTec LLC's, if it exists; otherwise **An
   organization**, with HyberTec LLC's legal name, address and D-U-N-S number, $25 once; Google's checks can take days).
2. **Create the app:** Play Console → **Create app**: **Sky Arc**, English (United States), **App**, **Free**.
3. **Set up your app** (the Dashboard lists each form; the texts are in [docs/store/](store/)): privacy policy; **App
   access** (the review logins and the notes from [docs/store/review-notes.md](store/review-notes.md)); **Ads:** No;
   **Content rating**; **Target audience:** 18 and over (the staff's app); **Data safety** from
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
when a change adds one. Push notifications also bring Apple's guideline 4.5.4: they must never be required to use the
app, never carry confidential information, and never market anything without the person's consent; and the App Privacy
answers gain "Device ID" ([docs/store/privacy-answers.md](store/privacy-answers.md)).

Each version's "What's New" must describe its new features specifically (2.3.12), and the review notes must point to
them (2.3.1).

## What is prepared, and what only you can do

Prepared in [docs/store/](store/) (edit anything you like; words in ALL CAPS need your details):

- `listing.md`: the stores' name, subtitle, descriptions and keywords; Apple's age rating answers; the screenshots and
  the command that makes them.
- `review-notes.md`: the notes for Apple's reviewer, the replies to the likeliest rejections, and Google's App access.
- `privacy-answers.md`: Apple's App Privacy answers and Google's Data safety answers, item by item.
- `testflight-notes.md`: the Beta App Description and "What to Test" for TestFlight testers.

Only you can: get the academy's written permission and its approval of the privacy policy, make the keys and accounts
(the App Store Connect key, the Google Play account and its service account), create the app records, submit, answer
Apple's and Google's messages, and accept Apple's updated agreements when App Store Connect shows a banner (the Account
Holder of HyberTec's Apple account).
