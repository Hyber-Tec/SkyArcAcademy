# Publishing the phone app

The map for getting Sky Arc's phone app into the App Store and Google Play: where things stand, what only you can do,
and which guide to follow. Each guide is step by step, with the links. Nothing in them needs Claude Code except where
a step says "ask Claude Code".

**The plan (the owner, 2026-10-20):** the iPhone app goes to the App Store as soon as possible and improves through
updates. Android follows once it has been tried on Android phones.

## Where things stand (2026-11-06, evening)

| | iPhone (App Store) | Android (Google Play) |
| --- | --- | --- |
| Live | **1.1.0 (build 12)**, approved and released on 2026-11-06, within a day of sending it. 1.0.0 (build 2) was sent 2026-10-21 and approved after Goo wrote to Apple | **1.0.0 (build 3)**, sent 2026-10-26, live by 2026-11-03 |
| The update | Out: phones update to 1.1.0 by themselves | **1.1.0 (build 12)**, in Google's review since 2026-11-06 with the updated Data safety form; it goes live by itself once approved ([updates.md](updates.md)) |
| Classes taught together (§21) | From 1.1.0. 1.0.0 opens a class through each seat's lead coach (`scripts/lead-coach.ts`), kept until phones have 1.1.0 (about a week from 2026-11-06) | Yes |
| TestFlight / internal testing | **1.1.0 (build 12)**, the build in the App Store | **1.1.0 (build 12)** |
| Review login | One admin with the academy's real data (`docs/publishing/store/review-notes.md`) | The same login, in Sign-in details |

**No second submission while either is in review** (the owner, 2026-10-26). Changes to the phone app wait on `main`
and go up together as the next update once each store has answered on 1.1.0 ([updates.md](updates.md)).
Changes to the website and the server don't wait: they're live as soon as they're merged.

## When a store answers

Tell Claude Code what came, in a word ("Apple approved Sky Arc", or paste the message): it checks this page, does its
part and says what's left. What each answer means:

**Apple** (an email, and the status in App Store Connect → Sky Arc → App Store):

- **Ready for Distribution** (approved): 1.1.0 was sent to release itself once approved, so it's in the App Store
  within a day and phones update by themselves. (A version sent with a manual release shows **Pending Developer
  Release** instead: **Release This Version**, [apple/app-store.md](apple/app-store.md), step 26.)
- **Rejected:** the message names a guideline. Replies to the likeliest ones are ready in
  [store/review-notes.md](store/review-notes.md); for anything else, give the message to Claude Code
  ([apple/app-store.md](apple/app-store.md), step 25). A fix in the app needs a new build (Claude Code makes
  it); a reply alone doesn't.
- **A question** (in App Review): answer in the same thread. If Apple asks for the academy's permission (5.2.1),
  attach the academy's email.

**Google** (an email, and the Play Console's Publishing overview and Inbox):

- **Approved:** the release goes live by itself, within hours (you can't hold it), and phones update by themselves.
- **Rejected or a policy issue:** the Inbox names the policy. Give it to Claude Code; most need a form fixed in **App
  content** (Part 1 of [production.md](google-play/production.md)), not a new build.

**After both:** the lead coach comes off the seats once the iPhone's update is out
(`npx tsx scripts/lead-coach.ts --clear`; `docs/TODO.md`).

## The guides

| Guide | What | When |
| --- | --- | --- |
| [apple/app-store.md](apple/app-store.md) | The App Store, from Apple's account to the release | Done up to the review; steps 24–27 when Apple answers |
| [apple/testflight.md](apple/testflight.md) | Trying the store build on phones first | Optional |
| [apple/rules.md](apple/rules.md) | Apple's rules and how Sky Arc meets them; the decisions behind the answers | When Apple asks something |
| [apple/sign-in-with-apple.md](apple/sign-in-with-apple.md) | Sign in with Apple's settings at Apple and in Firebase | Once, before 1.1.0 |
| [google-play/testing.md](google-play/testing.md) | The developer account, creating the app, the first upload, testers, uploads by command | Done; Part 4 sets up uploads by command on a Mac |
| [google-play/production.md](google-play/production.md) | Google's forms, the store page, the release | Done up to the review; step 13 when Google answers |
| [updates.md](updates.md) | Every update after the first release, both stores; the next one is 1.1.0 | When the stores have answered |
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
  [rules.md](apple/rules.md#public-or-unlisted)).
- **Sign in with Apple from 1.1.0** (Goo, 2026-11-03): people make their accounts in the app from then on
  ([`DECISIONS.md`](../DECISIONS.md) §31), so 4.8's exception no longer fits; 1.0.0 has none
  ([rules.md](apple/rules.md#sign-in-with-apple-48)). Goo's setup, once:
  [apple/sign-in-with-apple.md](apple/sign-in-with-apple.md).
- **iPhone first, then Android** once tried; **TestFlight optional** (the owner, 2026-10-20).
- **Free, in the United States only, iPhone only** (no iPad layout; iPads run the iPhone app).

## Where things are

- **The guides:** `docs/publishing/`. **The texts:** `docs/publishing/store/`.
- **On the Mac that publishes only, never in git** (`mobile/.publish/`; back the folder up): the App Store Connect key
  and `appstore.json` (on the Mac mini), Google Play's upload key and service account (on the Mac that uploads Android),
  the reviewers' login, the screenshots. A Mac without a store's keys can't upload to that store.
- **The version and build number:** `mobile/release.json` (each upload raises the build; Claude Code commits it).
- **The commands:** `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots`
  (`scripts/publish.mjs`, `scripts/phone.mjs`), and `npx tsx scripts/review-logins.ts` (the reviewers' logins).
