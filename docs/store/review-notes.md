# Notes for the reviewers

What to paste into App Store Connect's **App Review Information**, the replies to send if Apple answers with guideline
4.8 (sign-in), 3.2 (an app for one business) or 5.2.1, 4.2.6 or 4.3 (who publishes the app), and Google Play's **App
access** instructions. Fill in the ALL CAPS parts. Keep them true: reviewers try what the notes say. Checked on
2026-10-17 against Apple's list of what a complete review needs (who the app is for, the devices tested, the outside
services it uses, and a login for each kind of account).

**The review logins don't exist yet.** Make them before submitting ([docs/publishing.md](../publishing.md), "A way in for
the reviewers"): an admin and a coach who see only the sample data, never real students, with their emails already
confirmed. Their passwords are never written in the repository, and don't change them while Apple reviews.

Before pasting, read the notes against the app as it is that day: who uses it (today the academy's owners, admins and
coaches; parents and students are pointed to the website) and what each tab does.

## Apple: App Review Information

- **Sign-in required:** Yes
- **User name:** ADMIN REVIEW LOGIN EMAIL
- **Password:** ADMIN REVIEW LOGIN PASSWORD
- **Contact:** CONTACT NAME, CONTACT PHONE, CONTACT EMAIL
- **Attachment:** the academy's written permission to publish under its name and logo ([docs/publishing.md](../publishing.md), "Public or unlisted")
- **Notes** (the box takes 4,000 characters; this text is about 3,400 before the ALL CAPS parts are filled in):

```
Sky Arc is the app of Sky Arc Sports Academy, an air rifle academy for young people, for its staff: the owners, the admins and the coaches. The academy runs its classes, coaches, students and results on our website; this app gives its staff the day's classes, the schedule by coach, the students, and scoring of paper targets from a photo. A coach sees their own classes and the students (without their families' contact details), and can scan cards and correct or delete scores. Parents and students use the academy's website; if they sign in to the app, a page points them there.

WHO PUBLISHES IT
HyberTec LLC designed, built and runs the Sky Arc platform (this app, its website and its server) for Sky Arc Sports Academy, which has licensed its name and logo to us for it: the academy's permission is attached. Sky Arc is not made from a template or an app generation service; it is its own product for one sport.

DEMO ACCOUNTS
On "Sign in to Sky Arc Sports Academy", sign in with the email and password (no Google needed). Both accounts see sample data only: made-up students, coaches and classes. The app follows the academy's time zone (New York).
  Admin: ADMIN REVIEW LOGIN EMAIL / ADMIN REVIEW LOGIN PASSWORD
  Coach: COACH REVIEW LOGIN EMAIL / COACH REVIEW LOGIN PASSWORD

WHAT TO TRY
- Home: the day's classes (a coach sees their own). Tap one to see its students and its coach.
- Schedule: another day or week; tap a class.
- Scan: take a photo of a paper target, or choose one from Photos. The app scores it; check the shots, choose the student and save, and it's filed in the student's folder with the scores.
- Students: search for a student and open them: their classes, scores and files (open a file, or a score to correct or delete it). The admin also sees the family's contact details.
- More: the coaches, the appearance, the website, the privacy policy, and Delete my account.

SIGN-IN (guideline 4.8)
Sky Arc requires an account the academy has already created: the academy adds a person's email address on its website, and only that address can open the app. There is no sign-up in the app. Signing in with Google or with an email and a password are two ways of proving it is that address; an account the academy hasn't added sees "No access yet" and nothing else. We believe the app falls under 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account".

ACCOUNT DELETION (guideline 5.1.1(v))
More → Delete my account; the same link is on the "No access yet" screen. Deleting removes the sign-in and the person's profile at once. The academy's own records stay with the academy, as the screen and the privacy policy explain: PRIVACY POLICY ADDRESS

PERMISSIONS AND DATA
The camera and the photo picker are used only in Scan, to photograph or choose a paper target; nothing is saved to the phone's photos. The target is read on the phone itself. No ads, analytics or tracking.

SERVICES THE APP USES
Google Firebase (sign-in, database, file storage, server functions) and Google Sign-In. No payment or AI services.

TESTED ON
DEVICE MODELS AND iOS VERSIONS TESTED (for example: iPhone 16 Pro with iOS 27.0, and the iPad and iPhone Duo simulators). The app works the same everywhere; it is offered in the United States.

Contact during review: CONTACT NAME, CONTACT EMAIL, CONTACT PHONE (US Eastern time).
```

## If Apple answers with guideline 4.8

Reply once, from the same message in App Store Connect. If Apple still asks for another sign-in after this, see
[docs/publishing.md](../publishing.md), "Sign in with Apple", for the two ways out (the quickest: email and password
only in the iPhone app).

```
Thank you for the review. Sky Arc is the app of one academy's staff, and nobody can use it without an account the academy has already created: the academy adds the person's email address on its website, and only that address can open the app. The app has no sign-up. Google sign-in and email-and-password sign-in are two ways for that person to prove they own the address the academy added; any other account sees "No access yet" and nothing else (signing in with your own Google account shows this). We believe this falls under guideline 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account". A sign-in that hides the email address could not open the app either, because access follows the address the academy holds. If you still find another sign-in option necessary, please tell us and we will change the app.
```

## If Apple answers with guideline 3.2

Apple may find that an app for one academy's staff doesn't belong in public search. Decide first: unlisted is for good
([docs/publishing.md](../publishing.md), "Public or unlisted"). To go unlisted: request it at
https://developer.apple.com/contact/request/unlisted-app/, add this line at the top of the review notes:

```
This app is intended for unlisted distribution; we have submitted the request.
```

and reply from the same message:

```
Thank you for the review. Sky Arc serves the staff of Sky Arc Sports Academy, and later its students and their families. We have requested unlisted app distribution for it and added this to the review notes. Please let us know if anything else is needed.
```

## If Apple answers with guideline 5.2.1, 4.2.6 or 4.3

Reply from the same message, with the academy's written permission attached again ([docs/publishing.md](../publishing.md),
"Public or unlisted"). Check the details are still true before sending.

```
Thank you for the review. HyberTec LLC designed, built and operates the Sky Arc platform (this app, its website at skyarcacademy.web.app and its server) for Sky Arc Sports Academy, an air rifle academy, under a license to the academy's name and logo: the academy's written permission is attached. Sky Arc is not built from a commercialized template or an app generation service, and it is not a copy of another app: it is made for this one sport and academy (classes by coach, students and their families, and scoring paper air rifle targets from a photo with its own image analysis). Our other app serves a different business. We are glad to answer any question about it.
```

## Google Play: App access

Play Console → **App content → App access** → "All or some functionality is restricted" → **Add instructions**: name
`Review login`, the admin's email and password, and:

```
Every part of the app requires an account that Sky Arc Sports Academy has created. Sign in with the email and password (no Google needed). This is an admin of the academy who sees sample data only (made-up people; New York time). Home, Schedule (tap a class), Scan (photograph or choose a paper target, then save it for a student), Students (open a student and a file) and More are all open to it. More → Delete my account deletes the account.
```

**Add instructions** again for the coach: name `Coach login`, the coach's email and password, and:

```
A coach of the academy, with sample data only. A coach sees their own classes and the students without their families' contact details, and can scan cards and correct or delete scores.
```

## Google Play: other declarations

The app asks for the camera and for photos the person chooses (through the system's photo picker), for Scan only;
nothing else (no location, no contacts, no calls or SMS, no background work). If the Play Console asks about the
**advertising ID**: No (no ads, no analytics).
