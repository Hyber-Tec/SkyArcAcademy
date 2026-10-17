# Store listing texts

Paste these into App Store Connect and the Google Play Console ([docs/publishing.md](../publishing.md), parts 3 and 4)
when the app is published. Both stores count characters; the limits are given, and every text below fits. They're
written for the academy's office and work for a public or an unlisted listing alike
([docs/publishing.md](../publishing.md), "Public or unlisted").

Before pasting, read each paragraph against the app as it is on that day (it was still being built when this was
written): the stores reject a description that promises something the app doesn't do.

## Apple App Store

**Name** (30): `Sky Arc`. If App Store Connect says the name is taken: `Sky Arc Sports Academy`.

**Subtitle** (30): `The academy's office app`

**Promotional text** (170; can be changed at any time, without a new version):
`For the office of Sky Arc Sports Academy: today's classes, the schedule by coach, students and families, and paper targets scored from a photo.`

**Description** (4000):

```
Sky Arc is the app of Sky Arc Sports Academy's office: the day at the academy, its students and coaches, and its paper targets, in your pocket.

You need an account from the academy. When the academy adds your email address, sign in with that address, with Google or with a password.

TODAY
The day's classes in order, with each coach and student, and how many students and coaches are in today.

SCHEDULE
The academy's classes day by day, by coach, with the day's open hours. Open a class to see its students and call or text the coach.

SCAN
Photograph a paper target, or choose a photo of one. The app scores it and files it, with the scores, in the student's folder.

STUDENTS
Every student, searchable: their family's phone and email, their next and last classes, their latest scores and their files.

MORE
The coaches with their contacts, the appearance, and the website for everything else.

Everything follows the academy's time zone, wherever you are.

Privacy: PRIVACY POLICY ADDRESS
```

**Keywords** (100, commas, no spaces after them; the name's own words are left out, as Apple counts them anyway):
`air rifle,shooting,target,score,scan,coach,class,schedule,students,office`

**Support URL:** `https://skyarcacademy.com`
**Marketing URL:** `https://skyarcacademy.com`
**Copyright:** `2026 HyberTec LLC` (HyberTec publishes the app: [docs/publishing.md](../publishing.md), "Public or unlisted").
**Category:** Sports; secondary Education.
**What's New** (first version): `First release.`

## Google Play

**App name** (30): `Sky Arc`

**Short description** (80): `Sky Arc Sports Academy's office app: classes, students and scanned targets.`

**Full description** (4000): the App Store description above, unchanged.

**App category:** Sports. **Tags:** choose those closest to Sports, Education and Productivity.
**Contact details:** the academy's email and website (a phone number only if it wants one shown publicly).
**Privacy policy:** the policy's address.

## Screenshots

`npm run publish:screenshots` (20–30 minutes) makes every image both stores need, from the practice copy (the sample
data's made-up people), signed in as the practice owner, on a simulator and an emulator of its own, into
`mobile/.publish/screenshots/`:

- `ios/`: five PNGs, 1320 × 2868 (the "iPhone 6.9-inch" size App Store Connect requires). The app is iPhone-only, so no
  iPad set.
- `android/`: the same five from a Pixel 9, given white margins to the 9:16 shape the Play Console accepts, plus
  `icon-512.png` (the app icon) and `feature-graphic-1024x500.png` (the official white logo on the logo's black). The
  Play Console requires both.

The five screens, named in the order to upload them:

1. `01-today`: Today, the day's classes.
2. `02-schedule`: Schedule, the day's classes by coach.
3. `03-scan`: Scan, photographing a paper target.
4. `04-students`: Students, the academy's students.
5. `05-more`: More, the coaches and the rest.

The pictures show whatever the practice copy holds that day, so take them on a day the academy is open (the sample
data follows the academy's real week). Look at each before uploading: the sample data's made-up names only, no real
student.
