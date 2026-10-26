# Store listing texts

What to paste into App Store Connect ([apple/app-store.md](../publishing/apple/app-store.md), steps 11–20) and the Play
Console ([google-play/production.md](../publishing/google-play/production.md)). Both stores count characters; each
limit is given, and every text fits. Written on 2026-10-20 for the app as it is (families, coaches and the office),
and brought up to date on 2026-10-26 for the update with classes taught together.
Before pasting a later version, read each paragraph against the app that day: the stores reject a description that
promises something the app doesn't do.

## App Store

**Name** (30): `Sky Arc`. If App Store Connect says it's taken: `Sky Arc Sports Academy`.

**Subtitle** (30): `Classes, scores and progress`

**Promotional text** (170; can be changed at any time, with no new version and no review):

```
Sky Arc Sports Academy's app: your classes, every score from the range, and progress reports with a note from the coach. For the academy's families and staff.
```

**Description** (4000):

```
Sky Arc is the app of Sky Arc Sports Academy, an air rifle academy: classes, scores and progress for its families, and the day's work for its coaches and office.

You need an account from the academy. When the academy adds your email address, sign in with that address, with Google or with a password.

FOR FAMILIES
• Home: each student's next class and the rest of the week, the academy's news, the latest scores and progress report, and attendance.
• Classes: what's coming and what's past, as a list or month by month.
• Scores: every result, from the range's electronic scoring and from paper targets, with each position's figures, the scores over time and where the shots went.
• Reports: the progress reports the academy shares, with the coach's words, the period's shots played back on the target, and the goals.
A parent with more than one child sees them together or one at a time.

FOR COACHES
• Home: the classes in your hours today with the coaches in with you, your hours this week and what's left to do.
• Schedule: every class, day by day, laid out like the academy's sheets, with yours marked and who's in.
• Availability: the days and times you can teach.
• Scan: photograph a paper target, or choose a photo of one. The app reads and scores the shots, you check them, and it files the card with its scores in the student's folder.
• The students, with their classes, scores and files; the academy's news; your pay, by pay period.

FOR THE OFFICE
• Today's classes with the coaches in, the schedule laid out like the academy's sheets, and marking who's here.
• Every student, with their classes, scores, files and family contacts.
• Scan, the academy's Drive, progress reports, the coaches and the academy's news.

Everything follows the academy's time zone, wherever you are.
```

**Keywords** (100, commas without spaces; the name's words are left out, as Apple counts them anyway; if the name ends
up `Sky Arc Sports Academy`, swap `academy` for `range`):

```
air rifle,shooting,target,score,scan,coach,class,schedule,progress,report,parent,training,academy
```

**Support URL:** `https://skyarcacademy.web.app/help` (whom to ask, signing in, deleting an account, with the academy's
email and phone from the website's Settings → Academy; guideline 1.5).
**Marketing URL:** `https://skyarcacademy.web.app` (the academy's website; `https://skyarcacademy.com` once the domain
moves there, `docs/DEPLOY.md`).
**Copyright:** `2026 HyberTec LLC` (HyberTec publishes the app).
**Category:** Sports; secondary Education.
**What's New:** App Store Connect doesn't ask for it on the first version. For the update with classes taught together
(4000; Apple refuses vague notes, guideline 2.3.12):

```
Classes now work as they do at the academy: every coach in at a class's time teaches it together.
• Schedule: each class laid out like the academy's sheets, with its seats, every student in their level's colour with their rifle, make-ups, practice and trials in their own colours, and the coaches in.
• Coaches see every class, with theirs marked, and who's in with them.
• The office marks students here, a no-show or canceled from a class.
• Home: today's classes with the coaches in; for a coach, the classes in their hours.
• The week runs Monday to Sunday; calendars start on Sunday.
```

The words "for kids" or "for children" stay out of every text: Apple keeps them for its Kids category (guideline
2.3.8).

## App Store: age rating

App Store Connect → Sky Arc → **App Information** → **Age Rating** → **Set Up Age Rating** (or **Edit**). The
questions as they were on 2026-10-20 (Apple added the social media ones in July 2026). Answer them honestly (guideline
2.3.6); read any new question against what the app does that day. Apple's definitions:
https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/

- **In-app controls:** Parental Controls **No**; Age Assurance **No**.
- **Capabilities:**
  - Unrestricted Web Access **No** (the app opens only the academy's own website, without an address bar).
  - User-Generated Content **Yes**, and Messaging and Chat **Yes**: the academy's staff comment on its announcements.
    Only the staff see the comments; families can't post anything. Neither answer changes the rating in the United
    States.
  - Social Media **No** (no feed, likes, shares or following); Social Media Disabled for Users Under 13 **No** (there
    is no social media to disable).
  - Advertising **No**.
- **Mature themes** (profanity or crude humor; horror or fear; alcohol, tobacco or drugs): **None**.
- **Medical or wellness** (medical or treatment information; health or wellness topics): **None**.
- **Sexuality or nudity:** **None** throughout.
- **Violence:** cartoon or fantasy, realistic, prolonged graphic: **None**. **Guns or Other Weapons: Infrequent**: the
  app is about air rifle target shooting; results carry event names such as "Air Rifle 60", and the academy's news may
  show the range.
- **Chance-based activities:** Gambling **No**; Simulated Gambling **None**; Contests **None** (training and match
  results; the app runs no competitions between its users); Loot Boxes **No**.
- **Age categories and override:** don't choose **Made for Kids**; **Not Applicable**; leave the Age Suitability URL
  empty.

Apple then works out **9+**, from "infrequent guns or other weapons" (frequent would be 13+).

## Google Play

**App name** (30): `Sky Arc`

**Short description** (80): `Sky Arc Sports Academy's app: classes, scores and progress reports.`

**Full description** (4000): the App Store description above, unchanged.

**App category:** Sports. **Tags:** those closest to Sports and Education.
**Contact details:** the academy's email (the website's Settings → Academy) and website `https://skyarcacademy.web.app`;
a phone only if the academy wants one public.
**Privacy policy:** `https://skyarcacademy.web.app/privacy`.

## Google Play: content rating

Play Console → **App content** → **Content rating** → category **All other app types**. Google doesn't publish its
questions; answer by these facts:

- **Violence, blood, sexual content, bad language, drugs, alcohol or tobacco, crude humor, gambling, horror:** No.
- **Weapons**, if asked: the app is about sport air rifle target shooting (event names, paper targets, the academy's
  news), with no violence.
- **Users interact or exchange content:** Yes: the academy's staff comment on its announcements; families can't post.
- **Shares the user's location with others:** No. **Purchases of digital goods:** No. **Unrestricted internet access:**
  No.

## Screenshots

In `mobile/.publish/screenshots/` on this Mac (never in git: `open mobile/.publish/screenshots`), showing only the
sample academy's made-up people:

- `ios/`: the eight the owner took on their iPhone on 2026-10-20, 1179 × 2556, the 6.3-inch size App Store Connect
  requires ("iPhone with Dynamic Island (medium display)").
- `ios-6.9-inch/`: the same eight at 1290 × 2796, only if App Store Connect also asks for the 6.9-inch display.
- `android/`: not yet. When Android is ready, take the same eight screens on an Android phone and give them to Claude
  Code: it frames them to Google's shape (no taller than twice their width, no transparency) and adds `icon-512.png` and
  `feature-graphic-1024x500.jpg` (the official white logo on black), which the Play Console requires.

Upload them in this order (the families' first: most people who look the app up are parents):

1. `01-report`: a progress report, as a parent sees it.
2. `02-report-shots`: the report's target, where the shots went.
3. `03-scores`: Scores, every result by position.
4. `04-family-home`: the family's Home, the next class and the week.
5. `05-today`: the office's Home, the day's classes.
6. `06-schedule`: Schedule, the day's classes by coach.
7. `07-scan`: Scan, photographing a paper target.
8. `08-students`: Students, the academy's students.

`npm run publish:screenshots` makes the same set on a simulator and an emulator from the practice copy, if they ever
need to be taken again (about 20 GB of simulators the first time). Screenshots taken on a real iPhone 15, 16 or 17, or
their Pro models (not the Plus, Pro Max or Air), are already the right size.
