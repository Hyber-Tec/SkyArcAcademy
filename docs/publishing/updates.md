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
5. **Android** (once it's on Google Play): `npm run publish:android -- --track production`, then "commit the release
   number". Release notes go in the Play Console's release; Google reviews it within hours to a few days.
6. **Phones update by themselves**, usually within a day. More → Version shows what a phone has.

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
