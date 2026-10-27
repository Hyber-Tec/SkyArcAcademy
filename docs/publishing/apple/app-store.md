# The App Store, step by step

From an empty App Store Connect to Sky Arc on the App Store, in order. Each step says where to click, with the link.
Where a step says "ask Claude Code", that's the only part you don't do yourself. The reasons behind the answers are in
[rules.md](rules.md). Checked against Apple's pages on 2026-10-20.

**Your time:** about an hour and a half, mostly pasting. **Then Apple's review:** Apple aims to answer most submissions
within 24–48 hours, but brand-new apps have waited longer since October 2026, sometimes weeks
(https://developer.apple.com/distribute/app-review/).

**TestFlight is not needed.** Apple reviews a build as soon as it's uploaded and processed. Use TestFlight only to try
that build on phones first, or to let the academy's staff try it ([testflight.md](testflight.md)); it fits between
parts 4 and 5.

## Before you start

- **This Mac**, in the Sky Arc folder, on the newest `main`: `git switch main && git pull`.
- **HyberTec's Apple account** (https://developer.apple.com/account). Step 2 needs its **Account Holder**; steps 3
  and 4 the Account Holder or an **Admin**; the others an Admin or an **App Manager** in App Store Connect.
- **Ready on this Mac** (never in git; Terminal, in the Sky Arc folder):
  - the screenshots: `open mobile/.publish/screenshots`;
  - the reviewers' logins and passwords: `open -e mobile/.publish/review-logins.json`.
- **The website** shows the privacy policy without a "Draft" banner and the Help page with the academy's email and
  phone: https://skyarcacademy.web.app/privacy and https://skyarcacademy.web.app/help (both live once this round's
  pull request is merged).
- **The texts to paste**, in [docs/store/](../../store/): [listing.md](../../store/listing.md) (the store page),
  [review-notes.md](../../store/review-notes.md) (for the reviewer), [privacy-answers.md](../../store/privacy-answers.md)
  (the privacy questions).

## Part 1: The academy's permission

1. **Ask the academy's owner for a short email.** Apple wants an app to come from whoever owns its name and logo, or
   has their permission (guideline 5.2.1), and Sky Arc carries the academy's. Something like:

   > Could you reply to this email with the sentence below? Apple asks for it before Sky Arc can go on the App Store.
   >
   > "Sky Arc Sports Academy gives HyberTec LLC permission to publish the Sky Arc app, with the academy's name and
   > logo, on the App Store and Google Play."

   When the reply comes, save it as a PDF (in Mail: **File → Export as PDF**). You attach it in step 17.

## Part 2: Apple's account (once, the Account Holder)

2. **Accept Apple's updated agreement.** Sign in at https://developer.apple.com/account. If a banner asks you to review
   the **Apple Developer Program License Agreement** (updated 2026-10-13), open it and **Agree**. App Store Connect
   refuses submissions until it's accepted.
3. **Answer the EU question (Digital Services Act).** Apple asks every account, even one that sells nowhere in the
   European Union. Open https://appstoreconnect.apple.com/business → **Agreements** tab → **Compliance** section →
   **Digital Services Act**:
   - if it already shows an answer (HyberTec's other apps may have needed one), leave it;
   - if it says **Complete Compliance Requirements**, click it and choose **This is not a trader account** when none of
     HyberTec's apps is on the App Store in the EU ("If you don't distribute apps on the App Store in the EU … you're
     not acting as a trader"), otherwise **This is a trader account** (Apple then shows HyberTec's address, phone and
     email on its EU product pages). Sky Arc itself is offered in the United States only.

   Apple's page:
   https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/

## Part 3: The key and the app's record (once)

4. **Make an App Store Connect API key**, so the upload command signs in to Apple by itself. Open
   https://appstoreconnect.apple.com/access/integrations/api → **Team Keys** → **+** (the first time, the Account
   Holder clicks **Request Access** first) → Name `Sky Arc publishing`, Access **App Manager** → **Generate**. Then:
   - click **Download** next to the new key. Apple offers the file **once only**; it lands in Downloads as
     `AuthKey_XXXXXXXXXX.p8`;
   - note the key's **Key ID** (in its row) and the **Issuer ID** (above the list).

   If HyberTec already has a team key for its other apps, you can reuse its file: a team key works for every app of the
   team.
5. **Give the key to the command.** In Terminal, in the Sky Arc folder:

   ```bash
   mv ~/Downloads/AuthKey_*.p8 mobile/.publish/
   ```

   Then ask Claude Code to "make appstore.json with Key ID … and Issuer ID …", or write the file
   `mobile/.publish/appstore.json` yourself in any plain-text editor:

   ```json
   { "keyId": "XXXXXXXXXX", "issuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "appleId": "" }
   ```

   Leave `appleId` empty until step 7. Back up the `mobile/.publish` folder somewhere safe (a password manager or an
   encrypted drive): the key file is the only copy.
6. **Create the app in App Store Connect.** Open https://appstoreconnect.apple.com/apps → **+** → **New App**:
   - Platforms: **iOS**
   - Name: **Sky Arc** (if Apple says it's taken: **Sky Arc Sports Academy**; the name under the icon stays "Sky Arc")
   - Primary Language: **English (U.S.)**
   - Bundle ID: **com.skyarcacademy.app** (in the list, since `npm run iphone` registered it; if it isn't, ask Claude
     Code)
   - SKU: **skyarc**
   - User Access: **Full Access**

   → **Create**. Apple's page: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app
7. **Copy the app's Apple ID.** In the new app: left sidebar → **App Information** → **Apple ID** (a ten-digit
   number). Put it in `mobile/.publish/appstore.json` as `"appleId": "6740123456"` (your number, in quotes), or give it
   to Claude Code to put there.

## Part 4: Upload the app

8. **Upload.** In Terminal, in the Sky Arc folder, on the newest `main`:

   ```bash
   npm run publish:iphone
   ```

   15–30 minutes: it raises the build number, builds the App Store version, signs it as HyberTec LLC and uploads it.
   It ends with `✓ Uploaded Sky Arc 1.0.0 (build 2) to App Store Connect.` (The App Store version was built and signed
   on this Mac on 2026-10-20 without uploading, so the signing works.) You can also ask Claude Code to run it.
9. **Keep the build number.** Ask Claude Code to "commit the release number": it opens a pull request with
   `mobile/release.json`; merge it. Don't skip this: the next upload would reuse the number, and Apple refuses a number
   twice.
10. **Wait for Apple's processing** (10–30 minutes). The app → **TestFlight** tab shows the build as **Processing**,
    then ready; Apple emails when it's done. The app answers the encryption question by itself (standard encryption
    only), so nothing is asked. **If Apple's email mentions ITMS-91061 or ITMS-91065** (a privacy file or a signature
    missing in a library), give the email to Claude Code: the fix is a new build, and you start again at step 8.

## Part 5: The App Store page

In the app, left sidebar → **iOS App** → **1.0 Prepare for Submission**.

11. **Screenshots.** In Finder (`open mobile/.publish/screenshots`), drag the eight files of the **`ios`** folder into
    the **iPhone** screenshots, in their order (01 to 08). They are the size Apple requires, the 6.3-inch display
    (1179 × 2556). If the page also marks the 6.9-inch or 6.5-inch display as required, drag the eight of
    **`ios-6.9-inch`** there (the same pictures at 1290 × 2796). No iPad screenshots: the app is iPhone-only.
    **App Previews** (videos) are optional: leave them empty. Apple's sizes:
    https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
12. **The texts.** From [listing.md](../../store/listing.md), "App Store": **Promotional Text**, **Description**,
    **Keywords**, **Support URL**, **Marketing URL**.
13. **Version and copyright.** Version: `1.0.0` (it must match the build). Copyright: `2026 HyberTec LLC`.
14. **Build.** **Add Build** (or **+** under Build) → the build from step 8 → **Done**.
15. **Sign-In Information** (under App Review Information): tick **Sign-in required**; User name and Password: the
    **office** login from `review-logins.json`.
16. **Contact Information:** your first and last name, your phone in international format (`+1 404 555 0100`: Apple
    has required the `+1` since August 2026), your email.
17. **Notes:** the notes from [review-notes.md](../../store/review-notes.md), with the four logins filled in from
    `review-logins.json` and the phones you tried the app on. **Attachment:** the academy's permission (step 1).
18. **Version Release:** **Manually release this version** (you choose the moment after approval).
19. **Save** (top right).

## Part 6: The app's information

20. **App Information** (left sidebar):
    - **Subtitle:** `Classes, scores and progress` ([listing.md](../../store/listing.md)).
    - **Category:** Primary **Sports**, Secondary **Education**.
    - **Content Rights:** **Edit** → the app contains third-party content (the academy's name, logo and records) → tick
      that you have the rights to use it (the academy's permission).
    - **Age Rating:** **Set Up Age Rating** (or **Edit**) → the answers in [listing.md](../../store/listing.md), "Age
      rating". Apple works out **9+**.
    - **Save.**
21. **App Privacy** (left sidebar):
    - **Privacy Policy:** **Edit** → `https://skyarcacademy.web.app/privacy` → **Save**.
    - **Data Collection:** **Get Started** → the answers in [privacy-answers.md](../../store/privacy-answers.md),
      "Apple" → **Publish**.
22. **Pricing and Availability** (left sidebar):
    - **Price Schedule:** **Add Pricing** → United States, **USD 0.00 (Free)** → **Next** → **Confirm**.
    - **App Availability:** **Set Up Availability** (or **Edit**) → only the **United States** → **Confirm**.
    - **App Distribution Methods:** **Public** (decided; [rules.md](rules.md#public-or-unlisted)).
    - Untick **iPhone and iPad Apps on Apple Silicon Macs** and **Apple Vision Pro**: Apple offers iPhone apps there by
      default, and this one is made for the iPhone and its camera.
    - **Save.**

## Part 7: Submit, then release

23. **Submit.** Back on **1.0 Prepare for Submission** → **Add for Review** (top right) → check what it lists →
    **Submit for Review**. App Store Connect says what's missing if anything is; fix it and try again.
24. **Wait.** The status goes **Waiting for Review** → **In Review** → **Pending Developer Release** (approved), with
    an email at each step. Keep the review login working meanwhile (since 2026-10-26 one admin with the academy's real
    data: [review-notes.md](../../store/review-notes.md)), and don't upload another build while Apple reviews.
25. **If Apple rejects it,** the message names a guideline. Reply in the same thread (the app → **App Review** → the
    submission). Replies to the likeliest ones (4.8, 3.2, 5.2.1, 4.2.6 and 4.3) are ready in
    [review-notes.md](../../store/review-notes.md); for anything else, give the message to Claude Code to draft the
    reply or make the fix.
26. **Release.** When the status is **Pending Developer Release**: **1.0** → **Release This Version**. Sky Arc shows
    in the App Store within a few hours; searching for it can take a day.
27. **Tell Claude Code it's live**, with the App Store link, so the website and the docs can point to it.

After this, every update is shorter: [updates.md](../updates.md).
