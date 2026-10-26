# Google Play: the first upload and testing

From the developer account to Sky Arc on testers' Android phones. Android follows the iPhone, once the app has been
tried on Android phones (the owner, 2026-10-20). Checked against Google's help on 2026-10-20.

**The developer account** is HyberTec LLC's **organization** account, verified (the owner, 2026-10-26): Google
publishes the app once it has reviewed it, with no closed test first (a personal account would have needed 12 testers
for 14 days: https://support.google.com/googleplay/android-developer/answer/14151465). Sign in at
https://play.google.com/console with the Google account that holds it.

Google reviews testing releases too: "a few hours or up to seven days (or longer in exceptional cases)", longer for new
accounts (https://support.google.com/googleplay/android-developer/answer/9859654).

## Part 1: The app (once)

1. **Create the app.** https://play.google.com/console → **Home** → **Create app**:
   - App name: **Sky Arc**
   - Default language: **English (United States)**
   - App or game: **App**; Free or paid: **Free**
   - tick the declarations (Developer Program Policies, US export laws) → **Create app**.

   Do it early, even before Android is ready: since September 30, 2026 Android apps in Brazil, Indonesia, Singapore and
   Thailand must come from verified developers, worldwide in 2027. Google Play developers need no new step: Play Console
   registers the app's package name (`com.skyarcacademy.app`) when the app is created and uploaded, and keeping
   **Google Play App Signing** claims it
   (https://developer.android.com/developer-verification/guides/google-play-console).

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
   SHA-1 and SHA-256 (Play Console → **Test and release** → **Setup** → **App signing**). Until the App signing key's are
   in, Google sign-in fails in copies from Google Play (email and password work); once they are, it works in the builds
   already uploaded, within minutes, with no new build: Google checks the phone's copy against the fingerprints Firebase
   holds, not against the app's Firebase file. Then ask Claude Code to run `npm run phone:setup`, which keeps this Mac's
   copy of that file up to date for the next build.

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

## Part 5: Closed testing (optional)

HyberTec's organization account needs no closed test: once the internal testers have tried the app, go on to the store
page and the release ([production.md](production.md)). A closed test is still a way to give the app to more people
first (some families, say), with no minimum and no waiting period:

10. **Test and release** → **Testing** → **Closed testing** → **Manage track** (or **Create track**) → **Testers**: an
    email list with their Google account emails → **Countries / regions**: **United States** → **Create new release** →
    **Add from library** (the build from internal testing) → **Next** → **Save and publish**. Send the testers the join
    link from the **Testers** tab.

Then the store page and the release: [production.md](production.md).
