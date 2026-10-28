# Notes for the reviewers

What to paste into App Store Connect's **App Review Information** ([apple/app-store.md](../publishing/apple/app-store.md),
steps 15–17), the replies to send if Apple answers with guideline 4.8 (sign-in), 3.2 (an app for one business) or
5.2.1, 4.2.6 or 4.3 (who publishes the app), and Google Play's **Sign-in details**. Keep them true: reviewers try what
the notes say. Checked on 2026-10-20 against Apple's list of what a complete review needs (who the app is for, the
devices tested, the outside services, a login for each kind of account, regional differences).

## The review login

Since 2026-10-26 production holds the academy's real data, and the reviewers sign in as an admin that sees it (Goo's
call, `docs/DECISIONS.md` §21): the office login, with the same email and password as before, now an admin of its own
named "Reviewer (App Store)". The coach, parent and student logins went with the sample people. The password is only
on this Mac: `open -e mobile/.publish/review-logins.json` (never in git or in a document). Don't change it while a
version is in review. If a reviewer deletes the account, `npx tsx scripts/review-logins.ts --real-data` brings it back
with the same password.

| Login | Email | Who |
| --- | --- | --- |
| Office | `paige.sutton@skyarc-sample.test` | an admin of the academy, with its real data: goes in Apple's sign-in fields |

Until 2026-10-26 there were four sample people (an office, a coach, a parent and a student, made by
`npx tsx scripts/review-logins.ts`); their passwords stay in the same file, for if they're made again.

## Apple: App Review Information

- **Sign-in required:** Yes. **User name:** the office email. **Password:** the office password.
- **Contact:** your name, phone (`+1 …`) and email.
- **Attachment:** the academy's written permission ([apple/app-store.md](../publishing/apple/app-store.md), step 1).
- **Notes** (the box takes 4,000 characters; this text is about 3,850 with the passwords in, so keep additions short).
  Paste it, then put the password in place of the capitals, and the phones you tried the app on in place of the last
  capitals:

```
Sky Arc is the app of Sky Arc Sports Academy, an air rifle academy, for its families and staff. The academy runs its classes, coaches, students and results on our website; the app brings them to phones. Parents and students see their classes, every score and the progress reports the academy shares. Coaches see every class and who's in, set their availability and score paper targets from a photo. The office (owners and admins) sees the day, the schedule and every student.

WHO PUBLISHES IT
HyberTec LLC designed, built and runs the Sky Arc platform (this app, its website and its server) for Sky Arc Sports Academy, which has given us permission to publish it under its name and logo: its written permission is attached. Sky Arc is not made from a template or an app generation service; it is its own product for one sport.

DEMO ACCOUNT
On "Sign in to Sky Arc Sports Academy", sign in with the email and password in the sign-in fields (no Google needed): paige.sutton@skyarc-sample.test / OFFICE PASSWORD. It is an admin of the academy (the office) and shows the academy's real schedule and students, in its time zone (New York): please look around without changing or deleting anything. Coaches, parents and students see a part of the same app (their own classes, scores and reports).

WHAT TO TRY
Home (today's classes; tap one), Schedule (another day; tap a class), Scan (photograph a paper target or choose a photo; check the shots, choose a student; you can leave without saving), Students (open one: classes, scores, files), More (coaches, News, Drive, Reports).

SIGN-IN (guideline 4.8)
Sky Arc requires an account the academy has created: the academy adds a person's email address on its website, and only that address can open the app. There is no sign-up in the app. Google sign-in and email-and-password sign-in are two ways of proving it is that address; an account the academy hasn't added sees "No access yet" and nothing else. We believe the app falls under 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account".

ACCOUNT DELETION (guideline 5.1.1(v))
More → Delete my account, for every account (also on the "No access yet" screen). It removes the sign-in and the person's profile at once; the academy's own records stay with the academy, as the screen and the privacy policy explain: https://skyarcacademy.web.app/privacy. If you try it with the demo account, we will restore the account for the next review.

COMMENTS (guideline 1.2)
The only user-generated content is comments on the academy's announcements, written and read by its staff only (owners, admins, coaches); families never see them. Whoever posts chooses whether a post takes comments, owners and admins can delete any comment, and the academy can pause or remove anyone's access. Contact details: More → Help.

PERMISSIONS AND DATA
The camera and the photo picker are used only in Scan (staff), to photograph or choose a paper target or a match's results sheet; nothing is saved to the phone's photos. A target is read on the phone itself; a results sheet's text is read on Sky Arc's server, and the sheet is filed in the student's folder. No ads, analytics or tracking.

SERVICES THE APP USES
Google Firebase (sign-in, database, file storage, server functions) and Google Sign-In. No payment, advertising or AI services.

TESTED ON
DEVICES AND iOS VERSIONS TESTED (for example: iPhone 16 Pro with iOS 27.0). The app is offered in the United States only and works the same for everyone.
```

## If Apple answers with guideline 4.8

Reply once, from the same message in App Store Connect. If Apple still asks for another sign-in after this,
[apple/rules.md](../publishing/apple/rules.md#sign-in-with-apple-48) has the two ways out (the quickest: email and
password only in the iPhone app).

```
Thank you for the review. Nobody can use Sky Arc without an account Sky Arc Sports Academy has already created: the academy adds the person's email address on its website, and only that address can open the app. The app has no sign-up. Google sign-in and email-and-password sign-in are two ways for that person to prove they own the address the academy added; any other account sees "No access yet" and nothing else (signing in with your own Google account shows this). We believe this falls under guideline 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account". A sign-in that hides the email address could not open the app either, because access follows the address the academy holds. If you still find another sign-in option necessary, please tell us and we will change the app.
```

## If Apple answers with guideline 3.2

Apple may find that an app for one academy doesn't belong in public search. Unlisted is for good
([apple/rules.md](../publishing/apple/rules.md#public-or-unlisted)): decide first. To go unlisted, request it at
https://developer.apple.com/contact/request/unlisted-app/, add this line at the top of the review notes:

```
This app is intended for unlisted distribution; we have submitted the request.
```

and reply from the same message:

```
Thank you for the review. Sky Arc serves the families, students and staff of Sky Arc Sports Academy. We have requested unlisted app distribution for it and added this to the review notes. Please let us know if anything else is needed.
```

## If Apple answers with guideline 5.2.1, 4.2.6 or 4.3

Reply from the same message, with the academy's written permission attached again. Check the details are still true
before sending.

```
Thank you for the review. HyberTec LLC designed, built and operates the Sky Arc platform (this app, its website at skyarcacademy.web.app and its server) for Sky Arc Sports Academy, an air rifle academy, with the academy's permission to use its name and logo: the academy's written permission is attached. Sky Arc is not built from a commercialized template or an app generation service, and it is not a copy of another app: it is made for this one sport and academy (classes by coach, students and their families, scores from the range's electronic scoring, and paper air rifle targets scored from a photo with its own image analysis). Our other app serves a different business. We are glad to answer any question about it.
```

## Google Play: Sign-in details

Play Console → **App content** → **Sign-in details** (or **App access**) → **All or some functionality is restricted**
→ **Add instructions**, once: the name below, the review login's email and password (as for Apple), and its text.

`Office login`:

```
Every part of the app needs an account that Sky Arc Sports Academy has created. Sign in with the email and password (no Google needed). This is an admin of the academy (the office) and shows the academy's real schedule and students, in New York time: please look around without changing or deleting anything. Home (today's classes; tap one), Schedule (another day; tap a class), Scan (photograph or choose a paper target; you can leave without saving), Students (open a student) and More. Coaches, parents and students see a part of the same app.
```

## Google Play: other declarations

The app asks for the camera and for photos the person chooses (Android's own photo picker), for Scan only; nothing
else (no location, contacts, calls, SMS or background work). **Advertising ID:** No (no ads, no analytics).
