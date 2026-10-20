# Apple's rules, and how Sky Arc meets them

The reasons behind the answers in [app-store.md](app-store.md): what Apple's rules ask of Sky Arc and where the app
stands. Read against the App Review Guidelines dated October 16, 2026 and Apple's help pages on 2026-10-20. The numbers
are Apple's guideline numbers, the ones reviewers quote.

Apple changes these pages several times a year. Before submitting, look at the "Last Updated" date at the bottom of
https://developer.apple.com/app-store/review/guidelines/; if it's newer than October 16, 2026, ask Claude Code to check
again.

## Ready in the app

- **Signing in** (4.0, 4.8): Google's own sheet, or an email and a password; no sign-up in the app; only an email the
  academy added opens it ([Sign in with Apple](#sign-in-with-apple-48)).
- **Delete my account** (5.1.1(v)): More → Delete my account for every role, and on every screen an account can be stuck
  on ("No access yet", paused access, Confirm your email). It says what the academy keeps, as Apple's help now asks.
- **The privacy policy** (5.1.1(i)): in effect since 2026-10-20 at https://skyarcacademy.web.app/privacy, linked in More
  and under the sign-in form. It says what the app collects and how (signing in; the camera and the photo picker in
  Scan), that the companies running it protect the data as the policy does, how long things are kept, and how to delete
  the account or turn off camera and photo access.
- **Help and contact** (1.5, "particularly important for apps that may be used in the classroom"): the Support URL,
  https://skyarcacademy.web.app/help, linked in More and under the sign-in form, with the academy's email and phone from
  Settings → Academy. Families also have "Contact Sky Arc" in More.
- **A demo account on the live server** (2.1): [the review logins](#the-review-logins).
- **The camera and the photo picker, for Scan only** (5.1.1), with their reasons on screen; nothing saved to the phone's
  photos; no microphone, location, contacts, push notifications or tracking.
- **No ads, analytics, tracking, purchases or outside AI service** (3.1, 5.1.2): the paper card is read on the phone
  itself.
- **Built with Xcode 27** (the iOS 27 SDK; 2.5.1): Apple has required the iOS 26 SDK since April 28, 2026 and requires
  the iOS 27 SDK from April 2027. The app runs on iOS 16.4 and later (Apple's floor: iOS 13 today, iOS 15 from April
  2027).
- **Standard encryption only** (HTTPS), declared in the app, so App Store Connect asks no export question.
- **Privacy manifests** (ITMS-91061): every library on Apple's list carries its own. Since 2026-10-20 the app builds
  Expo's modules from source (`usePrecompiledModules: false` in `mobile/app.config.ts`): the prebuilt image module left
  SDWebImage, which is on Apple's list, without one.
- **No hidden features** (2.5.19): the practice copy and the developer menu exist only in development builds.
- **Staff comments** (1.2): [Comments](#comments-12).

## The review logins

Apple needs a login on the live app, one for each kind of account ("If your app has multiple account types… use the
Notes field to add additional credentials for each type"), and logins that don't change while it reviews ("Credentials
that expire or change before your review starts may result in the submission being rejected").

Four sample people in production, made by `npx tsx scripts/review-logins.ts` (2026-10-20), with confirmed emails, so
a reviewer sees only made-up students:

| Login | Who | What a reviewer sees |
|---|---|---|
| `office` | the sample manager (an admin) | every tab of the staff's app; goes in the sign-in fields |
| `coach` | a sample coach | a coach's tabs: their classes, availability, the students, Scan |
| `parent` | a sample parent of two students | the family's tabs: classes, scores, reports |
| `delete-test` | a sample student | for trying More → Delete my account |

Their passwords are only in `mobile/.publish/review-logins.json` on this Mac (never in git). If a reviewer deletes an
account, running the script again brings it back with the same password; the academy's records stay.

**When the academy's real students are in production,** the office and coach logins would see them. Before the next
submission after that, ask Claude Code for review logins that see sample people only.

## Public or unlisted

**Decided (the owner, 2026-10-16): a public listing, published by HyberTec LLC from HyberTec's own Apple developer
account**, the one that publishes HyberTec's apps. Anyone can find "Sky Arc" in the App Store and download it; it opens
nothing without an account the academy made.

- **What the two are.** Both are the real App Store, with the same review and automatic updates. A **public** app shows
  when someone searches "Sky Arc"; an **unlisted** one shows nowhere, and people install it from its link. Apple made
  unlisted for apps "not suited for public distribution", such as employee resources
  (https://developer.apple.com/support/unlisted-app-distribution/).
- **Why public.** After approval Apple allows one change only: "you can change a publicly available app to an unlisted
  app", never the other way
  (https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods). Families
  find the app by its name.
- **Guideline 3.2, the likeliest question.** App Review has refused apps "designed for a specific business or
  organization, including its partners, clients or employees, and not for general distribution" (the wording of a 3.2
  rejection, still reported in 2026; the guideline itself doesn't say it). Sky Arc now serves the academy's families as
  well as its staff, which suits a public listing better than a staff-only app did. If App Review still answers with
  3.2: request unlisted distribution at https://developer.apple.com/contact/request/unlisted-app/ and reply
  ([review-notes.md](../../store/review-notes.md)). Apple says it answers within 3 business days, though one developer
  waited longer in April 2026. Unlisted is for good.
- **HyberTec's account, the academy's name** (5.2.1, 4.2.6, 4.3). An app should come from whoever owns or has licensed
  its name and logo, and reviewers ask for proof when the seller's name differs from the app's. Apple accepts "a signed
  contract, or email correspondence": the academy's email ([app-store.md](app-store.md), step 1), attached for the
  reviewer. Apple also refuses apps made from a commercial template for its clients, and copies of one app: Sky Arc
  grew from the same in-house code as HyberTec's other product, but it is its own product for one sport (classes by
  coach, scores from the range and from paper targets read from a photo). The review notes say so, and a reply is
  ready.
- **If the academy wants the app later,** App Store Connect transfers an app to another developer account (the app →
  App Information → Transfer App), and people keep it without installing it again.

Free advice before submitting, if you'd like it: a 30-minute App Review appointment (Webex, Tuesdays and Thursdays),
https://developer.apple.com/help/app-review/before-submitting-for-review/app-review-appointment. Apple "cannot
preapprove apps".

## Sign in with Apple (4.8)

The app signs people in with **Google** or an **email and a password**. Guideline 4.8 says an app that uses a sign-in
like Google's "must also offer as an equivalent option another login service" that collects only the name and email,
lets people keep their email private, and doesn't track them. Sign in with Apple is the usual one, but the rule has
exceptions, unchanged on 2026-10-20, and one fits Sky Arc: *"Your app is an education, enterprise, or business app that
requires the user to sign in with an existing education or enterprise account."* Nobody gets anything from the app
without an account the academy made: the academy adds a person's email address, only that address opens it, there is
no sign-up, and Google or a password are two ways of proving it's that address.

**Decided by this check: no Sign in with Apple for now.** With "Hide My Email", Apple would give the app a private
address the academy doesn't know, so it would open nothing. The review notes claim the exception, and a reply is ready
([review-notes.md](../../store/review-notes.md)). Reviewers judge case by case, so a rejection quoting 4.8 is possible.
If Apple still asks after one reply, two ways out:

1. **Email and password only in the iPhone app** (the quickest: an hour or two of work, then a new build). Guideline 4.8
   then doesn't apply: *"Your app exclusively uses your company's own account setup and sign-in systems."* Google stays
   on the website and on Android; whoever uses only Google adds a password once (the website: their account → **Add a
   password**, or **Forgot password?** in the app).
2. **Add Sign in with Apple** (three to four days of work, plus setup with Apple and Firebase). Worth it only if the
   academy wants one-tap sign-in on iPhones.

## Comments (1.2)

Guideline 1.2 asks apps with user-generated content for a way to filter it, report it and block abusive users, and for
published contact details. Sky Arc's only such content is comments on the academy's announcements, among its staff:
only owners, admins and coaches read and write them, and families never see them. Whoever posts chooses whether a post
takes comments; owners and admins delete any comment; the academy pauses or removes anyone's access on the website; and
Help shows the academy's contacts. The review notes say so. If a reviewer still asks for a way to report a comment, ask
Claude Code: a "Report" on each comment that tells the office is a small change.

## Children

Students sign in, some of them under 13 ("Children" in the privacy policy covers their information).

- **In App Store Connect:** not **Made for Kids** (the Kids category is for apps designed for children, with stricter
  rules); "Not Applicable" under Age Categories and Override; no words like "for kids" in the store texts. Apple asks
  only for a privacy policy and compliance with children's privacy law. The age rating comes out **9+**, from
  "infrequent guns or other weapons" (air rifle).
- **The law, for HyberTec and a lawyer** (not for Apple's review, which doesn't change):
  - **COPPA**, the US children's privacy law, applies now that children under 13 sign in. Its 2025 changes have been in
    force since April 22, 2026.
  - **State laws on app stores and age**: Utah (Apple shares age ranges for new Utah accounts since May 6, 2026), Texas
    (in force since June 4, 2026, still in court), Alabama and California (January 1, 2027), Louisiana (July 1, 2027).
    Apple: "no changes to the App Review process", and developers "are responsible for their own age restrictions"
    (https://developer.apple.com/support/age-assurance/). Apple's Declared Age Range can be added to the app (a new
    build) if a lawyer advises it.

## The screenshots

- **Required:** one set for the 6.3-inch iPhone, "iPhone with Dynamic Island (medium display)": 1179 × 2556 or
  1206 × 2622, portrait. Reports from October 2026 say App Store Connect refuses a 6.9-inch set (1320 × 2868) in that
  slot.
- **Ready:** eight from the owner's iPhone, 1179 × 2556, in `mobile/.publish/screenshots/ios/`, and the same eight at
  1290 × 2796 in `ios-6.9-inch/`, for the 6.9-inch or 6.5-inch slot if the page still asks for one (a leftover line in
  Apple's table says it may).
- **Rules:** PNG or JPEG, no transparency, 1 to 10 per size, more than half of them showing the app in use (2.3.3), no
  iPad set for an iPhone-only app.
- **Optional:** App Previews (videos, 15–30 seconds), and the new header and search images (2.3.14).
- **From April 2027:** screenshots for iPhone Duo as well (1398 × 2034 outside, 2007 × 2853 inside).

Apple's sizes: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

## Check at the first upload

- **Apple's email after the upload.** ITMS-91061 (a missing privacy manifest) or ITMS-91065 (a missing signature):
  give it to Claude Code. React Native's JavaScript engine (Hermes) comes prebuilt without a manifest of its own; Apple's
  list names it, but no rejection for it has been reported.
- **iPad and iPhone Duo.** An iPhone-only app still installs on iPads (in a compatibility mode) and on the inside screen
  of iPhone Duo (on sale from 2026-10-23); reviewers may use either. Before the first submission, ask Claude Code to go
  through the tabs on the iPad and iPhone Duo simulators (2.1, 2.4.1).
- **The privacy answers.** Xcode's privacy report of the archive (Xcode → **Window** → **Organizer** → the archive →
  **Generate Privacy Report**) should agree with [privacy-answers.md](../../store/privacy-answers.md).

## Later, when it applies

- **Push notifications** (4.5.4, 5.1.2): never required to use the app, nothing confidential in them, no marketing
  without consent; App Privacy gains "Device ID".
- **April 2027:** the iOS 27 SDK (already used) and iPhone Duo screenshots.
- **A new permission** (location, notifications): new questions from Apple; Claude Code says so when a change adds one.
