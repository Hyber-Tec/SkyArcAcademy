# Google Play: the developer account

Which kind of Google Play developer account HyberTec has decides the first steps for Android. An **organization**
account can publish once Google has reviewed the app. A **personal** account made after November 13, 2023 must first
run a closed test with at least 12 testers for 14 days in a row (https://support.google.com/googleplay/android-developer/answer/14151465).
Checked against Google's help on 2026-10-20.

## Check which kind HyberTec has (5 minutes)

1. Sign in at https://play.google.com/console with the Google account that holds HyberTec's developer account.
2. Left menu → **Settings** → **Developer account** → **About you** (Google also calls it **Account details**):
   - **Organization:** it names HyberTec LLC, with a D-U-N-S number and the organization's address and website.
   - **Personal:** it names a person, with no D-U-N-S number.
3. Still unsure: open HyberTec's developer page on Google Play (any of its apps → the developer's name). An
   organization's page shows its address and phone.
4. Tell Claude Code which it is (it's on the owner's to-do in `docs/TODO.md`).

## An organization account

Nothing to change. The closed test is optional: [testing.md](testing.md).

## A personal account

Two ways:

- **Keep it and run the closed test**: 12 or more people with Android phones (the academy's staff, some families) keep
  the app installed for 14 days, then you apply for production, answering Google's questions about the test
  ([testing.md](testing.md), part 5). About three weeks in all.
- **Use an organization account for HyberTec LLC** (Google: "Choose an organization account if you're creating an
  account for an organization or business",
  https://support.google.com/googleplay/android-developer/answer/13634885): no closed test. It needs a D-U-N-S number
  (HyberTec's Apple membership as an organization needed one, so it probably has it), HyberTec's legal name and address
  as in its Google payments profile, a website (verified in Google Search Console) and a phone. Google shows the legal
  name, address, email and phone on the store, and verifies the account before it can publish, which can take days.
  Google's help on the account types also covers moving an account from one type to the other.

**Recommendation:** an organization account, if HyberTec has a D-U-N-S number: Sky Arc is published by HyberTec LLC on
the App Store too, and it saves the three weeks of the closed test.

## No account yet

Create an organization account: https://play.google.com/console/signup → **An organization** → the D-U-N-S number,
legal name and address, website, phone and email → pay the **US$25** fee (once) → finish Google's identity checks
(https://support.google.com/googleplay/android-developer/answer/13628312). "You must verify your developer account
before you can submit apps."

## Android developer verification (new in 2026)

Since September 30, 2026, Android apps in Brazil, Indonesia, Singapore and Thailand must come from verified developers;
it goes worldwide in 2027. Google Play developers need no new step: Play Console registers the app's package name
(`com.skyarcacademy.app`) when the app is created and uploaded, and keeping **Google Play App Signing** claims it
(https://developer.android.com/developer-verification/guides/google-play-console). So create the app in Play Console
early ([testing.md](testing.md), step 1), even before Android is ready.
