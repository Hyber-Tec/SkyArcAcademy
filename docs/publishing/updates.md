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
   **Build**: the new one → **Add for Review** → **Submit for Review**. Apple puts updates of existing apps first: about
   a day and a half on average. When approved: **Release This Version** (or choose **Phased release** to reach everyone
   over seven days).
5. **Android:** `npm run publish:android -- --track production`, on the Mac that holds Google Play's upload key (below),
   then "commit the release number". Release notes go in the Play Console's release; Google reviews it within hours to
   a few days.
6. **Phones update by themselves**, usually within a day. More → Version shows what a phone has.

## Which Mac uploads which store

The keys live in `mobile/.publish/` (never in git), and each store needs its own:

- **The App Store:** the App Store Connect key (`AuthKey_….p8`, `appstore.json`) is on the **Mac mini**. Upload the
  iPhone app there, or copy those two files to the other Mac.
- **Google Play:** the upload key (`upload.keystore`, `keystore.json`) is on the Mac that built build 3 (the
  **MacBook Pro**), with `play-service-account.json` if uploads by command are set up there
  ([testing.md](google-play/testing.md), Part 4). **Never run `npm run publish:android` on a Mac without that
  `upload.keystore`:** it would make a new key, and Google refuses a build signed with any other key than the one it
  knows. Copy the folder (AirDrop or a USB stick, never git or email) if another Mac must upload.
- Commit the release number after each upload ("commit the release number"), so the other Mac counts on from it.

## The next update: 1.1.0 (both stores)

Waiting on `main` until each store has answered on 1.0.0 (no second submission during a review: the owner,
2026-10-26). Release 1.0.0 first when it's approved, then send this one straight away.

- **What it brings to the iPhone** (1.0.0 is build 2): classes taught together (#34) and the week from Monday (#33),
  the marks' words Here and No-show (#39), and the demo academy for the demo logins (`feat/mobile-demo-academy`).
- **What it brings to Android** (1.0.0 is build 3, which already has classes taught together): the marks' words, the
  demo academy, and three permissions it never used, gone (#37).
- **The steps,** after `git switch main && git pull`:
  1. Mac mini: `npm run publish:iphone -- --version 1.1.0` (the version becomes 1.1.0 and the build goes up). App Store
     Connect → Sky Arc → **+** next to **iOS App** → `1.1.0` → **What's New** from
     [listing.md](../store/listing.md) → **Build**: the new one → **Add for Review** → **Submit for Review**. When
     approved: **Release This Version**.
  2. Commit the release number, and pull it on the MacBook Pro.
  3. MacBook Pro: `npm run publish:android -- --track production` (the build goes up again, still 1.1.0). Play
     Console → the release → notes from [listing.md](../store/listing.md) → **Send changes for review**.
  4. Commit the release number.
  5. When the iPhone's 1.1.0 is out, take the lead coach off the seats: `npx tsx scripts/lead-coach.ts --clear`
     (`docs/TODO.md`).
- **The review notes:** the reviewers keep the admin login (the academy's real data). From 1.1.0 the phone also opens
  the demo academy for the demo logins (made-up people; their password is on the Mac mini, `docs/internal/`), so the
  reviewers could use those instead; that's the owner's call before submitting.

## Keep in mind

- **The review login** must keep working for every review. Since 2026-10-26 it's one admin with the academy's real
  data (Goo's call, `docs/DECISIONS.md` §21; `docs/store/review-notes.md`). If a reviewer deleted it,
  `npx tsx scripts/review-logins.ts --real-data` brings it back with the same password, on the Mac mini, which keeps
  it. On another Mac the script refuses to touch an account whose password it doesn't have, and `--remove` never
  deletes the review login or the demo logins.
- **A new permission or a new kind of data** (location, notifications, a new form) changes Apple's App Privacy and
  Google's Data safety answers ([privacy-answers.md](../store/privacy-answers.md)), and the privacy policy. Claude Code
  says so when a change adds one.
- **Apple's rules move.** Apple has announced that from April 2027 uploads must be built with the iOS 27 SDK (already
  the case) and need iPhone Duo screenshots; Google requires the newest Android target each year (API 36 since August
  31, 2026) and 16 KB memory pages from February 1, 2027. Ask Claude Code to check the stores' rules before a release
  if months have passed.
