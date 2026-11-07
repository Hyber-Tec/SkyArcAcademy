# Updates, after the first release

How a change reaches people once Sky Arc is in the stores. Most changes need no app update at all.

## What needs an app update

- **No update:** anything on the website or the server (the CRM, the public website, emails, rules, the data). Once
  its pull request is merged, it's live for everyone, the phone app included.
- **An app update:** a change to the phone app itself (a screen, a button, a fix in the app). Ask Claude Code for the
  change; it says whether it needs a release.
- **Promotional text** on the App Store changes at any time, with no update and no review.

## Releasing an update

1. **The change is merged** into `main` (its pull request).
2. **The newest `main` on this Mac:** `git switch main && git pull`. The stores get only merged, reviewed code.
3. **iPhone:** in Terminal, in the Sky Arc folder:

   ```bash
   npm run publish:iphone -- --version 1.0.1
   ```

   Apple needs a new version number for each App Store release: `1.0.1` for fixes, `1.1.0` for new features. Then ask
   Claude Code to "commit the release number" and merge its pull request.
4. **App Store Connect** → Sky Arc → **+** next to **iOS App** → the same version number → **What's New in This
   Version**: what changed, specifically (Apple refuses vague notes, guideline 2.3.12; Claude Code can draft them) →
   **Build**: the new one → **Add for Review** → **Submit for Review**. Or ask Claude Code to do all of it from the
   MacBook Pro. Apple says 90% of submissions are reviewed within a day; updates of an app it has approved are usually
   quick. **Version Release** decides what happens then: released at once ("Automatically release this version", as
   1.1.0 was), or **Release This Version** by hand, or **Phased release** over seven days.
5. **Android:** `npm run publish:android -- --track production`, on the Mac that holds Google Play's upload key (below),
   then "commit the release number". Release notes go in the Play Console's release; Google reviews it within hours to
   a few days.
6. **Phones update by themselves**, usually within a day. More → Version shows what a phone has.

## Which Mac uploads which store

The keys live in `mobile/.publish/` (never in git), and each store needs its own:

- **The App Store:** the App Store Connect key (`AuthKey_….p8`, `appstore.json`) is on the **Mac mini** and on the
  **MacBook Pro** (which uploaded the 1.1.0 builds). With it, Claude Code can also make the version, fill in What's New
  and the review notes, choose the build and submit it, through App Store Connect's API (as for 1.1.0).
- **Google Play:** the upload key (`upload.keystore`, `keystore.json`) is on the Mac that built build 3 (the
  **MacBook Pro**), with `play-service-account.json` if uploads by command are set up there
  ([testing.md](google-play/testing.md), Part 4). **Never run `npm run publish:android` on a Mac without that
  `upload.keystore`:** it would make a new key, and Google refuses a build signed with any other key than the one it
  knows. Copy the folder (AirDrop or a USB stick, never git or email) if another Mac must upload.
- Commit the release number after each upload ("commit the release number"), so the other Mac counts on from it.

## 1.1.0, sent on 2026-11-06 (both stores)

**What went out** (Claude Code, the night of 2026-11-05, from the MacBook Pro, `main` at #117): build **12** on
TestFlight and on Google Play's internal testing, with everything since 1.0.0 (the families' part, Create an account,
Sign in with Apple, notifications, the enrollment contract on the website, Korean for parents, lines that wrap between
words). Then:

- **App Store:** version **1.1.0** made in App Store Connect with its What's New ([listing.md](../store/listing.md)),
  build 12, the review notes for 1.1.0 ([review-notes.md](../store/review-notes.md): the same office login, its
  password unchanged) and **Automatically release this version**, and **submitted for review**.
- **Google Play:** **1.1.0 (12)** as a **draft release on the production track**, with its release notes
  ([listing.md](../store/listing.md)). Google reviews nothing until it's rolled out: the Data safety answers change
  with 1.1.0 and go first. (This app sends every change for review as soon as it's saved, so the API can't hold a
  finished release back; a draft waits.)

**What's left (Goo, about 10 minutes):**

1. **Apple's App Privacy** (App Store Connect → Sky Arc → **App Privacy**): add **Identifiers → Device ID** (linked to
   the user, App Functionality, not tracking): the phone's notification token; 1.0.0 had no notifications. The other
   types 1.1.0 needs (Phone Number, Other User Content, Other Data Types) are ticked already. **Publish.** It changes at
   any time, without a new review ([privacy-answers.md](../store/privacy-answers.md), "When the app changes").
2. **Google's Data safety** (Play Console → Sky Arc → **Policy and programs** → **App content** → **Data safety**): **account
   creation methods**: username and password, and OAuth (Google), now made in the app. The data types stay as they are
   (Phone number, Other info and Other user-generated content are declared already). **Save.**
3. **Roll out 1.1.0 on Google Play** (Play Console → Sky Arc → **Test and release** → **Production** → the draft
   **1.1.0 (12)** → **Edit release** → **Next** → **Save and publish**, or **Start rollout to Production**): Google
   reviews it (and the Data safety change, if it hasn't yet), then it goes live by itself. If the Publishing overview
   lists changes waiting, **Send changes for review** there.
4. **When both are out:** nothing to do on phones (they update by themselves). Later, once the iPhones have 1.1.0:
   `npx tsx scripts/lead-coach.ts --clear` (`docs/TODO.md`).

**What came back:** Apple approved 1.1.0 within a day, and it was in the App Store by the evening of 2026-11-06.
Google: Goo updated the Data safety form and sent it for review from the Publishing overview, then Claude Code rolled
out 1.1.0 (12) through the API (2026-11-06, in the evening). It's in Google's review; once approved it goes live by
itself. Apple's App Privacy has Device ID (Goo, the same evening).

(The API sends every change for review at once. A change saved in the Play Console with "Not now" waits in the
Publishing overview, so send it first there, then commit through the API.)

**How long:** Apple's first review took about two weeks (sent 2026-10-21, still waiting on 2026-11-03 until Goo wrote
to Apple); Google's first took up to eight days (2026-10-26 to live by 2026-11-03). An update is usually much quicker:
Apple reviews 90% of submissions within a day, and Google an update within hours to a few days (up to a week for a
new developer account). Both review at weekends too, sometimes more slowly.

## Keep in mind

- **The review login** must keep working for every review. Since 2026-10-26 it's one admin with the academy's real
  data (Goo's call, `docs/DECISIONS.md` §21; `docs/store/review-notes.md`). If a reviewer deleted it,
  `npx tsx scripts/review-logins.ts --real-data` brings it back with the same password.
- **A new permission or a new kind of data** (location, notifications, a new form) changes Apple's App Privacy and
  Google's Data safety answers ([privacy-answers.md](../store/privacy-answers.md)), and the privacy policy. Claude Code
  says so when a change adds one.
- **Apple's rules move.** Apple has announced that from April 2027 uploads must be built with the iOS 27 SDK (already
  the case) and need iPhone Duo screenshots; Google requires the newest Android target each year (API 36 since August
  31, 2026) and 16 KB memory pages from February 1, 2027. Ask Claude Code to check the stores' rules before a release
  if months have passed.
