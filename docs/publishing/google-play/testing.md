# Google Play: the first upload and testing

From the developer account to Sky Arc on testers' Android phones. **Later:** Android follows the iPhone, once the app
has been tried on Android phones (the owner, 2026-10-20). Start with [account.md](account.md). Checked against Google's
help on 2026-10-20.

Google reviews testing releases too: "a few hours or up to seven days (or longer in exceptional cases)", longer for new
accounts (https://support.google.com/googleplay/android-developer/answer/9859654).

## Part 1: The app (once)

1. **Create the app.** https://play.google.com/console → **Home** → **Create app**:
   - App name: **Sky Arc**
   - Default language: **English (United States)**
   - App or game: **App**; Free or paid: **Free**
   - tick the declarations (Developer Program Policies, US export laws) → **Create app**.

## Part 2: The first upload, by hand (once)

Google takes the very first build only from the Play Console's page; after that, the command uploads.

2. **Build it.** In Terminal, in the Sky Arc folder, on the newest `main`:

   ```bash
   npm run publish:android -- --dry-run
   ```

   The first time, it makes Google Play's **upload key** (`mobile/.publish/upload.keystore`, its password in
   `mobile/.publish/keystore.json`) and prints **"BACK BOTH FILES UP NOW"**: copy them to a password manager or an
   encrypted drive. Without them no later update can be uploaded until Google resets the key. It also prints the key's
   **SHA-1** and **SHA-256** (step 5 needs them).
3. **Upload it.** Play Console → Sky Arc → **Test and release** → **Testing** → **Internal testing** → **Create new
   release** → keep **Google Play App Signing** (Google holds the app's signing key) → **Upload** the `.aab` file from
   `open mobile/.expo/publish/android` → release notes `First release.` → **Next** → **Save and publish**. If Play
   Console says the release can't go out until some tasks are done, fill in the forms of
   [production.md](production.md), part 1, first: they're needed anyway. Then ask Claude Code to "commit the release
   number" and merge its pull request.
4. **Testers.** **Internal testing** → **Testers** tab → **Create email list** (`Sky Arc staff`, the testers' Gmail or
   Google account emails) → **Save** → copy the **join link** and send it. Each tester opens it on their Android phone,
   accepts, and installs Sky Arc from Google Play. Internal testing takes up to 100 testers.

## Part 3: Google sign-in in the store's copy (once)

5. **Add the fingerprints to Firebase.** Google Play signs the app with its own key, so Firebase must know it:
   https://console.firebase.google.com/project/skyarcacademy/settings/general → **Your apps** → the Android app → **Add
   fingerprint**, four times: the upload key's SHA-1 and SHA-256 (step 2), and the **App signing key certificate**'s
   SHA-1 and SHA-256 (Play Console → **Test and release** → **Setup** → **App signing**). Then ask Claude Code to run
   `npm run phone:setup`, which downloads the updated Firebase file for the next build. Until then Google sign-in fails
   in copies from Google Play; email and password work.

## Part 4: Uploads by command (once)

6. **Turn on Google's publishing API** for the project: https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com?project=skyarcacademy
   → **Enable**.
7. **Make the service account** the command uploads with:
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=skyarcacademy → **Create service account** → name
   `play-publisher` → **Create and continue** → no roles → **Done**. Open it → **Keys** → **Add key** → **Create new
   key** → **JSON** → **Create**. Move the downloaded file to `mobile/.publish/play-service-account.json` and back it
   up with the upload key.
8. **Let it publish Sky Arc.** Play Console (the account's main page, not the app's) → **Users and permissions** →
   **Invite new users** → the service account's email (`play-publisher@skyarcacademy.iam.gserviceaccount.com`) → **App
   permissions** → **Add app** → Sky Arc → tick **Release apps to testing tracks** and **Release to production, exclude
   devices, and use Play App Signing** → **Apply** → **Invite user**.
9. **From now on, one command:** `npm run publish:android` (internal testing), `-- --track closed` (closed testing),
   `-- --track production`. Each asks you to commit the release number afterwards.

## Part 5: Closed testing (required on a personal account)

Optional on an organization account. On a personal account made after November 13, 2023, Google lets the app reach
production only after at least 12 testers have stayed opted in to a closed test "continuously for the preceding 14
days" (https://support.google.com/googleplay/android-developer/answer/14151465).

10. **Find 12 or more testers** with Android phones who'll keep the app for two weeks: the academy's staff, and some
    families. Each signs in with the email the academy has for them.
11. **Start the closed test.** **Test and release** → **Testing** → **Closed testing** → **Manage track** (or **Create
    track**) → **Testers**: an email list with their Google account emails → **Countries / regions**: **United States**
    → **Create new release** → **Add from library** (the build from internal testing) → **Next** → **Save and
    publish**. Send the testers the join link from the **Testers** tab.
12. **Wait 14 days.** The Dashboard counts the testers who joined and the days. A tester who leaves the test breaks the
    count, so ask them to keep the app until the end.
13. **Apply for production.** Dashboard → **Apply for production**. Google asks how hard testers were to recruit, how
    they used the app and what they said; who the app is for, its value and the installs expected in its first year (the
    academy's families and staff); and what changed after the test and how you decided it was ready. Google answers
    within about a week.

Then the store page and the release: [production.md](production.md).
