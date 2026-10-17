# Notes for the reviewers

What to paste into App Store Connect's **App Review Information**, the replies to send if Apple answers with
guideline 4.8, or with 5.2.1, 4.2.6 or 4.3 (who publishes the app), and Google Play's **App access** instructions. Fill in the ALL CAPS parts. Keep them true: reviewers try what the
notes say.

**The review login doesn't exist yet.** Make it before submitting ([docs/publishing.md](../publishing.md), "A way in for
the reviewers"): an admin login that sees only the sample data, never real students. Its password is never written in
the repository.

## Apple: App Review Information

- **Sign-in required:** Yes
- **User name:** REVIEW LOGIN EMAIL
- **Password:** REVIEW LOGIN PASSWORD
- **Contact:** CONTACT NAME, CONTACT PHONE, CONTACT EMAIL
- **Notes:**

```
Sky Arc is the app of Sky Arc Sports Academy's office (an air rifle academy for young people). The academy runs its classes, coaches, students and results on our website; this app gives its owners and admins the day's classes, the schedule by coach, the students with their families' contacts, and scoring of paper targets from a photo. Coaches, parents and students who sign in see a screen saying their part comes to the app later, with a link to the website.

WHO PUBLISHES IT
HyberTec LLC designed, built and runs the Sky Arc platform (this app, its website and its server) for Sky Arc Sports Academy, which has licensed its name and logo to us for it: the academy's letter is attached. Sky Arc is not made from a template or an app generation service; it is its own product for one sport.

DEMO ACCOUNT
Sign in with the email and password (no Google needed):
  Email: REVIEW LOGIN EMAIL
  Password: REVIEW LOGIN PASSWORD
This is an admin of the academy who sees sample data only: made-up students, coaches and classes. The app follows the academy's time zone (New York).

WHAT TO TRY
- Today: the day's classes. Tap one to see its students and its coach.
- Schedule: another day or week; tap a class.
- Scan: take a photo of a paper target, or choose one from Photos. The app scores it; choose the student and save, and it's filed in the student's folder with the scores.
- Students: search for a student and open them: their family's contacts, classes, scores and files (open a file).
- More: the coaches, the appearance, the privacy policy, and Delete my account.

PERMISSIONS
The camera and the photo library are used only in Scan, to photograph or choose a paper target. Nothing is saved to the phone's photos.

SIGN-IN (guideline 4.8)
Sky Arc requires an account the academy has already created: the academy adds a person's email address, and only that address can open the app. Signing in with Google or with an email and a password are two ways of proving it is that address; an account the academy hasn't added sees "No access yet" and nothing else. We believe the app falls under 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account".

ACCOUNT DELETION (guideline 5.1.1(v))
More → Delete my account; the same link is on the "No access yet" screen. Deleting removes the sign-in and the person's profile at once. The academy's own records stay with the academy, as the privacy policy explains: PRIVACY POLICY ADDRESS

Contact during review: CONTACT NAME, CONTACT EMAIL, CONTACT PHONE (US Eastern time).
```

## If Apple answers with guideline 4.8

Reply once, from the same message in App Store Connect. If Apple still asks for it after this, ask Claude Code to add
Sign in with Apple ([docs/publishing.md](../publishing.md), "Sign in with Apple").

```
Thank you for the review. Sky Arc is the business app of one academy's office, and nobody can use it without an account the academy has created: the academy adds the person's email address, and only that address can open the app. Google sign-in and email-and-password sign-in are two ways for that person to prove they own the address the academy added; an account the academy hasn't added sees "No access yet" and nothing else. We believe this falls under guideline 4.8's exception for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account". If you still find Sign in with Apple necessary, please tell us and we will add it.
```

## If Apple answers with guideline 5.2.1, 4.2.6 or 4.3

Reply from the same message, with the academy's letter attached again ([docs/publishing.md](../publishing.md), "Public
or unlisted"). Check the details are still true before sending.

```
Thank you for the review. HyberTec LLC designed, built and operates the Sky Arc platform (this app, its website at skyarcacademy.web.app and its server) for Sky Arc Sports Academy, an air rifle academy, under a license to the academy's name and logo: the academy's signed letter is attached. Sky Arc is not built from a commercialized template or an app generation service, and it is not a copy of another app: it is made for this one sport and academy (classes by coach, students and their families, and scoring paper air rifle targets from a photo with its own image analysis). Our other app serves a different business. We are glad to answer any question about it.
```

## Google Play: App access

Play Console → **App content → App access** → "All or some functionality is restricted" → **Add instructions**: name
`Review login`, the email and password, and:

```
Every part of the app requires an account that Sky Arc Sports Academy has created. Sign in with the email and password (no Google needed). This is an admin of the academy who sees sample data only (made-up people; New York time). Today, Schedule (tap a class), Scan (photograph or choose a paper target, then save it for a student), Students (open a student and a file) and More are all open to it. More → Delete my account deletes the account.
```

## Google Play: other declarations

The app asks for the camera and for photos the person chooses (through the system's photo picker), for Scan only;
nothing else (no location, no contacts, no calls or SMS, no background work). If the Play Console asks about the
**advertising ID**: No (no ads, no analytics).
