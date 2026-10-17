# TestFlight: the test information and "What to Test"

What to paste into App Store Connect when the app goes to TestFlight ([docs/publishing.md](../publishing.md), part 2).
Testers see both in the TestFlight app. Fill in the ALL CAPS parts.

## Test Information (needed before inviting external testers)

App Store Connect → Sky Arc → **TestFlight** → **Test Information**. Apple's beta review reads it too, so the review
login goes here as well ([docs/store/review-notes.md](review-notes.md)).

- **Beta App Description** (required):

```
Sky Arc is the app of Sky Arc Sports Academy's staff, the office and the coaches: the day's classes, the schedule by coach, the students, and paper targets scored from a photo. You need an account from the academy: sign in with the email the academy has for you.
```

- **Feedback Email:** CONTACT EMAIL
- **Beta App Review Information:** sign-in required, with the admin review login, and the same notes as for the App
  Store.

## What to Test

Paste into the build's **What to Test** box (App Store Connect → TestFlight → the build → Test Details).

```
Thanks for testing Sky Arc, the app of Sky Arc Sports Academy's staff.

BEFORE YOU START
- Sign in with the email the academy has for you (Google, or email and password), as on the website.
- When Scan asks for the camera, allow it (it's only for paper targets).

PLEASE TRY
1. Today: are today's classes right, in the academy's time? (Coaches see their own.)
2. Schedule: another day and week; open a class and call or text its coach.
3. Scan: photograph a paper target flat and whole, or choose a photo of one. Are the scores right? Save it for the student, then find it in their files.
4. Students: search for a student; open their classes, scores and a file (the office also sees the family's contacts). Open a score and correct it.
5. More: the coaches, the appearance, the version.
6. Anything that looked wrong, was slow, or confused you.

HOW TO REPORT
In the TestFlight app: Sky Arc → Send Beta Feedback (you can attach a screenshot), or write to CONTACT EMAIL. Say what you did, what happened, and the time.
```
