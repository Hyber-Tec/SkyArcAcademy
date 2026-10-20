# Notes for the reviewers

What to paste into App Store Connect's **App Review Information** ([apple/app-store.md](../publishing/apple/app-store.md),
steps 15–17), the replies to send if Apple answers with guideline 4.8 (sign-in), 3.2 (an app for one business) or
5.2.1, 4.2.6 or 4.3 (who publishes the app), and Google Play's **Sign-in details**. Keep them true: reviewers try what
the notes say. Checked on 2026-10-20 against Apple's list of what a complete review needs (who the app is for, the
devices tested, the outside services, a login for each kind of account, regional differences).

## The review logins

Four sample people in production, made by `npx tsx scripts/review-logins.ts`; they see only made-up students. Their
passwords are only on this Mac: `open -e mobile/.publish/review-logins.json` (never in git or in a document). Don't
change them while a version is in review, and keep the sample data in production meanwhile. If a reviewer deletes an
account, run the script again: it comes back with the same password.

| Login | Email | Who |
| --- | --- | --- |
| Office | `paige.sutton@skyarc-sample.test` | the sample manager, an admin: goes in Apple's sign-in fields |
| Coach | `daniel.reed@skyarc-sample.test` | a sample coach |
| Parent | `jiyeon.hwang@skyarc-sample.test` | a sample parent of two students |
| Student | `seoyeon.lim@skyarc-sample.test` | a sample student, for trying Delete my account |

## Apple: App Review Information

- **Sign-in required:** Yes. **User name:** the office email. **Password:** the office password.
- **Contact:** your name, phone (`+1 …`) and email.
- **Attachment:** the academy's written permission ([apple/app-store.md](../publishing/apple/app-store.md), step 1).
- **Notes** (the box takes 4,000 characters; this text is about 3,850 with the passwords in, so keep additions short).
  Paste it, then put the four passwords in place of the capitals, and the phones you tried the app on in place of the
  last capitals:

```
Sky Arc is the app of Sky Arc Sports Academy, an air rifle academy, for its families and staff. The academy runs its classes, coaches, students and results on our website; the app brings them to phones. Parents and students see their classes, every score and the progress reports the academy shares. Coaches see their classes and the students, set their availability and score paper targets from a photo. The office (owners and admins) sees the day, the schedule by coach and every student.

WHO PUBLISHES IT
HyberTec LLC designed, built and runs the Sky Arc platform (this app, its website and its server) for Sky Arc Sports Academy, which has given us permission to publish it under its name and logo: its written permission is attached. Sky Arc is not made from a template or an app generation service; it is its own product for one sport.

DEMO ACCOUNTS
On "Sign in to Sky Arc Sports Academy", sign in with the email and password (no Google needed). Every account sees sample data only: made-up students, families, coaches and classes, in the academy's time zone (New York).
- Office (an admin), also in the sign-in fields: paige.sutton@skyarc-sample.test / OFFICE PASSWORD
- Coach: daniel.reed@skyarc-sample.test / COACH PASSWORD
- Parent of two students: jiyeon.hwang@skyarc-sample.test / PARENT PASSWORD
- Student, for trying account deletion: seoyeon.lim@skyarc-sample.test / STUDENT PASSWORD

WHAT TO TRY
- Office: Home (today's classes; tap one), Schedule (another day), Scan (photograph a paper target or choose a photo; check the shots, choose a student, save), Students (open one: classes, scores, files, family contacts), More (coaches, News, Drive, Reports).
- Coach: Home (classes, hours, to-do), Schedule, Availability (tap a day), Scan, More (students, News, Drive, Reports, Payroll).
- Parent: Home, Classes (a list or the months), Scores (open one: its shots on the target), Reports (open one), More (switch between the two children; contact the academy).
- Student: More → Delete my account.

SIGN-IN (guideline 4.8)
Sky Arc requires an account the academy has created: the academy adds a person's email address on its website, and only that address can open the app. There is no sign-up in the app. Google sign-in and email-and-password sign-in are two ways of proving it is that address; an account the academy hasn't added sees "No access yet" and nothing else. We believe the app falls under 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account".

ACCOUNT DELETION (guideline 5.1.1(v))
More → Delete my account, for every account (also on the "No access yet" screen); please try it with the student account. It removes the sign-in and the person's profile at once; the academy's own records stay with the academy, as the screen and the privacy policy explain: https://skyarcacademy.web.app/privacy

COMMENTS (guideline 1.2)
The only user-generated content is comments on the academy's announcements, written and read by its staff only (owners, admins, coaches); families never see them. Whoever posts chooses whether a post takes comments, owners and admins can delete any comment, and the academy can pause or remove anyone's access. Contact details: More → Help.

PERMISSIONS AND DATA
The camera and the photo picker are used only in Scan (staff), to photograph or choose a paper target; nothing is saved to the phone's photos. The target is read on the phone itself. No ads, analytics or tracking.

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
→ **Add instructions**, once per login: the name below, its email and password, and its text.

`Office login`:

```
Every part of the app needs an account that Sky Arc Sports Academy has created. Sign in with the email and password (no Google needed). This is an admin of the academy, with sample data only (made-up people; New York time): Home, Schedule (tap a class), Scan (photograph or choose a paper target, then save it for a student), Students (open a student and a file) and More.
```

`Coach login`:

```
A coach of the academy, with sample data only: their own classes, their availability (tap a day), the students without their families' contact details, Scan, and their pay in More.
```

`Parent login`:

```
A parent of two students, with sample data only: their classes, scores (open one to see its shots) and progress reports; More switches between the two children.
```

`Student login, for account deletion`:

```
A student, with sample data only. Use this login to try More → Delete my account; the other logins stay as they are.
```

## Google Play: other declarations

The app asks for the camera and for photos the person chooses (Android's own photo picker), for Scan only; nothing
else (no location, contacts, calls, SMS or background work). **Advertising ID:** No (no ads, no analytics).
