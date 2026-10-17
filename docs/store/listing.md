# Store listing texts

Paste these into App Store Connect and the Google Play Console ([docs/publishing.md](../publishing.md), parts 3 and 4)
when the app is published. Both stores count characters; the limits are given, and every text below fits. They're
written for the academy's staff (the office and the coaches) and work for a public or an unlisted listing alike
([docs/publishing.md](../publishing.md), "Public or unlisted").

Before pasting, read each paragraph against the app as it is on that day (it was still being built when this was
written): the stores reject a description that promises something the app doesn't do.

## Apple App Store

**Name** (30): `Sky Arc`. If App Store Connect says the name is taken: `Sky Arc Sports Academy`.

**Subtitle** (30): `The academy's staff app`

**Promotional text** (170; can be changed at any time, without a new version):
`For the staff of Sky Arc Sports Academy: today's classes, the schedule by coach, the students, and paper targets scored from a photo.`

**Description** (4000):

```
Sky Arc is the app of Sky Arc Sports Academy's staff, the office and the coaches: the day at the academy, its students and coaches, and its paper targets, in your pocket.

You need an account from the academy. When the academy adds your email address, sign in with that address, with Google or with a password.

TODAY
The day's classes in order, with each coach and student, and how many students and coaches are in today. Coaches see their own classes.

SCHEDULE
The academy's classes day by day, by coach, with the day's open hours. Open a class to see its students and call or text the coach.

SCAN
Photograph a paper target, or choose a photo of one. The app scores it, you check the shots, and it files the card, with the scores, in the student's folder.

STUDENTS
Every student, searchable: their next and last classes, their latest scores and their files, and for the office their family's phone and email. Open a score to correct or delete it.

MORE
The coaches with their contacts, the appearance, and the website for everything else.

Everything follows the academy's time zone, wherever you are.

Privacy: PRIVACY POLICY ADDRESS
```

**Keywords** (100, commas, no spaces after them; the name's own words are left out, as Apple counts them anyway):
`air rifle,shooting,target,score,scan,coach,class,schedule,students,staff`

**Support URL:** `https://skyarcacademy.web.app/help` (the website's Help page: whom to ask, signing in, deleting an
account, and HyberTec's email for problems with the app). It shows the academy's email and phone from the website's
Settings → Academy, so fill those in first. Apple checks: "A link to user support with up-to-date contact information …
is required for all apps" (guideline 1.5).
**Marketing URL:** `https://skyarcacademy.com`
**Copyright:** `2026 HyberTec LLC` (HyberTec publishes the app: [docs/publishing.md](../publishing.md), "Public or unlisted").
**Category:** Sports; secondary Education.
**What's New** (first version): `First release.`

## Apple: age rating

App Store Connect → Sky Arc → **App Information** → **Age Ratings** → **Set Up Age Ratings**. The questions as they were
on 2026-10-17 (Apple added some in 2025 and the social media ones in 2026); answer them honestly (guideline 2.3.6),
and read any new question against what the app does that day.

- **In-app controls:** Parental Controls **No**; Age Assurance **No**.
- **Capabilities:** Unrestricted Web Access **No** (the in-app browser opens only the academy's own website, with no
  address bar); User-Generated Content **No** (photos and scores stay in the academy's private records; nothing is
  published to other people); Social Media **No**; Messaging and Chat **No**; Advertising **No**.
- **Mature themes** (profanity or crude humor; horror or fear; alcohol, tobacco or drugs): **None**.
- **Medical or wellness** (medical or treatment information; health or wellness topics): **None**.
- **Sexuality or nudity:** **None** throughout.
- **Violence:** cartoon or fantasy, realistic, prolonged graphic: **None**. **Guns or Other Weapons: Infrequent**: the
  app is about air rifle target shooting, and results carry event names such as "Air Rifle 60", but it shows no
  pictures of guns.
- **Chance-based activities:** Gambling **No**; Simulated Gambling **None**; Contests **None** (training and match
  results; the app runs no competitions between its users); Loot Boxes **No**.
- **Age categories and override:** don't choose **Made for Kids**; no override; leave the Age Suitability URL empty.

Apple then works out **9+**, from "infrequent guns or other weapons". Change the answers if the app gains chat, posts or
comments, a web browser, or anything else these questions ask about.

## Google Play

**App name** (30): `Sky Arc`

**Short description** (80): `Sky Arc Sports Academy's staff app: classes, students and scanned targets.`

**Full description** (4000): the App Store description above, unchanged.

**App category:** Sports. **Tags:** choose those closest to Sports, Education and Productivity.
**Contact details:** the academy's email and website (a phone number only if it wants one shown publicly).
**Privacy policy:** the policy's address.

## Screenshots

`npm run publish:screenshots` (20–30 minutes) makes every image both stores need, from the practice copy (the sample
data's made-up people), signed in as the practice owner, on a simulator and an emulator of its own, into
`mobile/.publish/screenshots/`:

- `ios/`: five PNGs, 1320 × 2868 (the iPhone 6.9-inch size, "iPhone with Dynamic Island (large display)"). The app is
  iPhone-only, so no iPad set. Checked on 2026-10-17: App Store Connect's help now names the medium size (6.3-inch,
  1206 × 2622) as the one required, and accepts the large one too; if the version page still asks for the medium size,
  ask Claude Code to add it to the command. iPhone Duo screenshots become required from April 2027 for builds made with
  Xcode 27.1 or later.
- `android/`: the same five from a Pixel 9, given white margins to the 9:16 shape the Play Console accepts, plus
  `icon-512.png` (the app icon) and `feature-graphic-1024x500.png` (the official white logo on the logo's black). The
  Play Console requires both.

The five screens, named in the order to upload them:

1. `01-home`: Home, the day's classes.
2. `02-schedule`: Schedule, the day's classes by coach.
3. `03-scan`: Scan, photographing a paper target.
4. `04-students`: Students, the academy's students.
5. `05-more`: More, the coaches and the rest.

The pictures show whatever the practice copy holds that day, so take them on a day the academy is open (the sample
data follows the academy's real week). Look at each before uploading: the sample data's made-up names only, no real
student.
