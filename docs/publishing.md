# Publishing the phone app

The map for getting Sky Arc's phone app into the App Store and Google Play: where things stand, what only you can do,
and which guide to follow. Each guide is step by step, with the links. Nothing in them needs Claude Code except where
a step says "ask Claude Code".

**The plan (the owner, 2026-10-20):** the iPhone app goes to the App Store as soon as possible and improves through
updates. Android follows once it has been tried on Android phones.

## Where things stand (2026-10-27)

| | iPhone (App Store) | Android (Google Play) |
| --- | --- | --- |
| In review | **1.0.0 (build 2)**, waiting for Apple's review since 2026-10-21 (checked on 2026-10-27) | **1.0.0 (build 3)**, in Google's review since 2026-10-26 (production) |
| Classes taught together (§21) | No: built before them. It opens a class through each seat's lead coach (`scripts/lead-coach.ts`), kept until its update | Yes |
| The demo academy on the phone (§22) | In 1.1.0 (#41) | In the next build, 1.1.0 |
| TestFlight | **1.1.0 (build 5)**, uploaded 2026-10-28 from the MacBook Pro for testing on phones ([phone-testing.md](phone-testing.md); not submitted); the App Store's 1.1.0 can be this build | — |
| Review login | One admin with the academy's real data (`docs/store/review-notes.md`) | The same login, in Sign-in details |

**No second submission while either is in review** (the owner, 2026-10-26). Changes to the phone app wait on `main`
and go up together as the next update, **1.1.0**, once each store has answered ([updates.md](publishing/updates.md)).
Changes to the website and the server don't wait: they're live as soon as they're merged.

## When a store answers

Tell Claude Code what came, in a word ("Apple approved Sky Arc", or paste the message): it checks this page, does its
part and says what's left. What each answer means:

**Apple** (an email, and the status in App Store Connect → Sky Arc → App Store):

- **Pending Developer Release** (approved): 1.0 → **Release This Version**
  ([apple/app-store.md](publishing/apple/app-store.md), step 26). Then the update, 1.1.0, as
  [updates.md](publishing/updates.md) says: it brings classes taught together and the demo academy to the iPhone.
- **Rejected:** the message names a guideline. Replies to the likeliest ones are ready in
  [store/review-notes.md](store/review-notes.md); for anything else, give the message to Claude Code
  ([apple/app-store.md](publishing/apple/app-store.md), step 25). A fix in the app needs a new build (Claude Code makes
  it); a reply alone doesn't.
- **A question** (in App Review): answer in the same thread. If Apple asks for the academy's permission (5.2.1),
  attach the academy's email.

**Google** (an email, and the Play Console's Publishing overview and Inbox):

- **Approved:** the first release goes live by itself, within hours (you can't hold it). Tell Claude Code the Google
  Play link ([google-play/production.md](publishing/google-play/production.md), step 13). Then 1.1.0, as
  [updates.md](publishing/updates.md) says.
- **Rejected or a policy issue:** the Inbox names the policy. Give it to Claude Code; most need a form fixed in **App
  content** (Part 1 of [production.md](publishing/google-play/production.md)), not a new build.

**After both:** the lead coach comes off the seats once the iPhone's update is out
(`npx tsx scripts/lead-coach.ts --clear`; `docs/TODO.md`).

## The guides

| Guide | What | When |
| --- | --- | --- |
| [apple/app-store.md](publishing/apple/app-store.md) | The App Store, from Apple's account to the release | Done up to the review; steps 24–27 when Apple answers |
| [apple/testflight.md](publishing/apple/testflight.md) | Trying the store build on phones first | Optional |
| [apple/rules.md](publishing/apple/rules.md) | Apple's rules and how Sky Arc meets them; the decisions behind the answers | When Apple asks something |
| [google-play/testing.md](publishing/google-play/testing.md) | The developer account, creating the app, the first upload, testers, uploads by command | Done; Part 4 sets up uploads by command on a Mac |
| [google-play/production.md](publishing/google-play/production.md) | Google's forms, the store page, the release | Done up to the review; step 13 when Google answers |
| [updates.md](publishing/updates.md) | Every update after the first release, both stores; the next one is 1.1.0 | When the stores have answered |
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
- **On the Mac that publishes only, never in git** (`mobile/.publish/`; back the folder up): the App Store Connect key
  and `appstore.json` (on the Mac mini), Google Play's upload key and service account (on the Mac that uploads Android),
  the reviewers' login, the screenshots. A Mac without a store's keys can't upload to that store.
- **The version and build number:** `mobile/release.json` (each upload raises the build; Claude Code commits it).
- **The commands:** `npm run publish:iphone`, `npm run publish:android`, `npm run publish:screenshots`
  (`scripts/publish.mjs`, `scripts/phone.mjs`), and `npx tsx scripts/review-logins.ts` (the reviewers' logins).
