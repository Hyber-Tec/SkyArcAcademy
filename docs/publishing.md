# Publishing the phone app

The map for getting Sky Arc's phone app into the App Store and Google Play: where things stand, what only you can do,
and which guide to follow. Each guide is step by step, with the links. Nothing in them needs Claude Code except where
a step says "ask Claude Code".

**The plan (the owner, 2026-10-20):** the iPhone app goes to the App Store as soon as possible and improves through
updates. Android follows once it has been tried on Android phones.

## Where things stand (2026-10-20)

**2026-10-24: in Apple's review.** Sky Arc 1.0.0 (build 2) was uploaded on 2026-10-21 and submitted. Production keeps
the sample data and the reviewers' logins until Apple answers.

**2026-10-26: Android in internal testing.** Sky Arc 1.0.0 (build 3) was uploaded by hand to Google Play's internal
testing. The testers and the rest of [google-play/testing.md](publishing/google-play/testing.md) come next.

Ready for the App Store:

- **The app**, version 1.0.0: the office's, the coaches' and the families' tabs, with Delete my account, Help and the
  privacy policy in More and before signing in.
- **The App Store version** builds and signs on this Mac (tried on 2026-10-20 without uploading), with the privacy
  file Apple requires in every library on its list.
- **The privacy policy**, in effect since 2026-10-20 (https://skyarcacademy.web.app/privacy), and **Help**, the
  stores' support page (https://skyarcacademy.web.app/help).
- **The screenshots:** the eight you took on your iPhone, at the size Apple requires. On this Mac only:
  `open mobile/.publish/screenshots`.
- **The reviewers' logins:** four sample people in production (office, coach, parent, and a student for trying
  account deletion). Their passwords are only on this Mac: `open -e mobile/.publish/review-logins.json`.
- **Every text to paste:** [docs/store/](store/).

**TestFlight isn't needed.** Apple reviews a build as soon as it's uploaded and processed. TestFlight is only for
trying that build on phones first, if you want to ([apple/testflight.md](publishing/apple/testflight.md)).

## What only you can do

For the **App Store**, in this order (each is a step in [apple/app-store.md](publishing/apple/app-store.md)):

1. Ask the academy's owner for a one-line email giving HyberTec permission to publish the app under its name (step 1).
2. As HyberTec's Account Holder: accept Apple's updated agreement and check the EU question (steps 2–3).
3. Make the App Store Connect key and the app's record (steps 4–7).
4. Upload the app: one command (step 8), or ask Claude Code to run it.
5. Fill in App Store Connect from the prepared texts and screenshots, then submit (steps 11–23).
6. Answer Apple if it asks anything, then release (steps 24–26).

For **Google Play**: HyberTec's developer account is an **organization** account (HyberTec LLC), verified (the owner,
2026-10-26), so no closed test comes first. When Android is ready: [google-play/testing.md](publishing/google-play/testing.md)
(the app, the first upload, the internal testers), then [google-play/production.md](publishing/google-play/production.md).

## The guides

| Guide | What | When |
| --- | --- | --- |
| [apple/app-store.md](publishing/apple/app-store.md) | The App Store, from Apple's account to the release | Now |
| [apple/testflight.md](publishing/apple/testflight.md) | Trying the store build on phones first | Optional |
| [apple/rules.md](publishing/apple/rules.md) | Apple's rules and how Sky Arc meets them; the decisions behind the answers | When Apple asks something |
| [google-play/testing.md](publishing/google-play/testing.md) | The developer account, creating the app, the first upload, testers | When Android is ready |
| [google-play/production.md](publishing/google-play/production.md) | Google's forms, the store page, the release | After the internal test |
| [updates.md](publishing/updates.md) | Every update after the first release, both stores | After the first release |
| [store/](store/) | The texts to paste: the store pages, the age rating, the review notes and logins, the privacy answers, TestFlight's notes | While following the guides |

## Cost and time

| Stage | Money | Your time | Waiting |
| --- | --- | --- | --- |
| Apple Developer Program (HyberTec LLC) | $99 a year, already paid for HyberTec's apps | – | – |
| App Store: account steps, key, record, upload, the pages, submit | – | About 1½ hours | Apple's review: 24–48 hours is Apple's aim; new apps have waited longer since October 2026, sometimes weeks |
| TestFlight, if wanted | – | 15 minutes | Internal: minutes. External: about a day |
| Google Play developer account | Paid; HyberTec LLC's organization account, verified (2026-10-26) | – | – |
| Google Play: the app, the forms, the first upload | – | About 2 hours | Each review: hours to 7 days |
| Every update | – | 5 minutes plus a few in each store | Apple about a day and a half; Google hours to days |

Nothing costs money per release.

## Decided

- **A public listing, published by HyberTec LLC** from its own Apple account (the owner, 2026-10-16;
  [rules.md](publishing/apple/rules.md#public-or-unlisted)).
- **No Sign in with Apple** for now ([rules.md](publishing/apple/rules.md#sign-in-with-apple-48)).
- **iPhone first, then Android** once tried; **TestFlight optional** (the owner, 2026-10-20).
- **Free, in the United States only, iPhone only** (no iPad layout; iPads run the iPhone app).

## Where things are

- **The guides:** `docs/publishing/`. **The texts:** `docs/store/`.
- **On this Mac only, never in git** (`mobile/.publish/`; back the folder up): the App Store Connect key and
  `appstore.json`, Google Play's upload key and service account, the reviewers' logins, the screenshots.
- **The version and build number:** `mobile/release.json` (each upload raises the build; Claude Code commits it).
- **The commands:** `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots`
  (`scripts/publish.mjs`, `scripts/phone.mjs`), and `npx tsx scripts/review-logins.ts` (the reviewers' logins).
