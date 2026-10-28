# TestFlight: the test information and "What to Test"

What to paste into App Store Connect if you use TestFlight ([apple/testflight.md](../publishing/apple/testflight.md));
it's optional. Testers see both texts in the TestFlight app.

## Test Information (needed before inviting external testers)

App Store Connect → Sky Arc → **TestFlight** → **Test Information**. Apple's beta review reads it too, so the review
login and notes go here as well ([review-notes.md](review-notes.md)).

- **Beta App Description** (required):

```
Sky Arc is the app of Sky Arc Sports Academy: classes, scores and progress reports for its families, and the day's classes, availability, students and paper targets scored from a photo for its coaches and office. You need an account from the academy: sign in with the email the academy has for you.
```

- **Feedback Email:** your email (or the academy's).
- **Beta App Review Information:** sign-in required, with the office review login, your name, phone (`+1 …`) and
  email, and the same notes as for the App Store.

## What to Test

Paste into the build's **What to Test** box (TestFlight → the group → **Builds** → the build).

```
Thanks for testing Sky Arc, the app of Sky Arc Sports Academy.

BEFORE YOU START
- Sign in with the email the academy has for you (Google, or email and password), as on the website.
- Coaches: when Scan asks for the camera, allow it (it's only for paper targets and match results sheets).

PLEASE TRY
Families:
1. Home: is the next class right, in the academy's time?
2. Classes, Scores and Reports: open a score and a report. Does everything match the website?
Coaches and the office:
3. Home and Schedule: are today's classes right? Open a class.
4. Availability (coaches): set a day, then check it on the website.
5. Scan: photograph a paper target flat and whole, or choose a photo of one. Are the scores right? Save it for the student, then find it in their files.
6. Students: open a student's classes, scores and a file.
Everyone:
7. Anything that looked wrong, was slow, or confused you.

HOW TO REPORT
In the TestFlight app: Sky Arc → Send Beta Feedback (you can attach a screenshot), or write to the feedback email TestFlight shows. Say what you did, what happened, and the time.
```
