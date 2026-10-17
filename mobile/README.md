# Sky Arc phone app

The iPhone and Android app for Sky Arc, built with [Expo](https://expo.dev) (SDK 57) and React Native, forked from
HyberCRM's phone app. For now it is the **academy office's app** (owners and admins): five tabs, **Today, Schedule,
Scan, Students and More**. The website stays the main thing; the app helps the office see the day and do a few things
on the go, above all scanning paper targets. Coaches, parents and students who sign in see a screen saying their part
comes to the app later, with a button to the website. It uses the same Firebase project (`skyarcacademy`), the same
Cloud Functions and the same security rules as the website, and the business logic in `../shared`.

How to run it, step by step, is in [docs/running-the-apps.md](../docs/running-the-apps.md); publishing to the stores is
[docs/publishing.md](../docs/publishing.md). Rules for changing the code: [AGENTS.md](AGENTS.md).

## What it does

- **Signing in**, as on the website: **Google** (the recommended way) or an **email and a password**, with Forgot
  password. A password account reaches nothing until its email is confirmed, because the rules trust confirmed emails
  only. There is no "create an account": the academy invites people on the website.
- **Access** follows the academy's member doc for the email (`branches/skyarc/members/{email}`), live: an owner or an
  admin gets the office's tabs; a coach, a parent or a student gets "Coming to the app"; an email the academy hasn't
  added gets "No access yet", which opens the app by itself once an admin adds it; paused access says so. The first
  sign-in links the account to the member doc, as the website does.
- **Today:** the date in the academy's zone with its open hours, today's numbers (classes, students, coaches), the way
  to Scan, and today's classes in time order. A class (one coach's students at one time) opens a sheet with the coach a
  call or a text away and each student with their status and the class's note.
- **Schedule:** the week's days, then the chosen day's classes by coach (coaches as rows, as on the website), with the
  day's open hours; any date through a month calendar that scrolls like the iPhone's. Read-only: changes are made on
  the website.
- **Scan:** a paper card from the camera (a frame the card's shape to fill) or from Photos (several at once, read one
  after the other). The phone reads it (`src/features/scan/photo.ts`, with the engine in `../shared/src/targets`): it
  finds the card's twelve bulls whichever way up the photo is, measures each bull, finds the holes and scores them by
  ISSF's rule, one or two shots per bull. The check screen shows it as a score's screen does: the total, the shots
  played back one by one as soon as the card is read, and the card flattened with every bull's score (two fingers
  pinch to zoom, and the page holds still meanwhile). A bull worth a look (unsure, a second mark, no hole, or a hole
  that only just touches a ring's line) opens up close, where a finger dragged anywhere on the picture moves the
  shot nearest it (the finger never hides it; zoomed in, finer), and a shot is added, removed, swapped for another
  mark or typed.
  Then who shot it, the position and the date, and **Save**, which doesn't wait: the scores, with each shot's place,
  become a paper result for the reports at once, with an audit entry, and the flattened card uploads to the student's
  Drive folder in the background (`YYYY-MM-DD Position paper card.jpg`; `src/features/scan/save.ts`). A photo without a
  card says why and offers to type the scores instead.
- **Students:** every student, searchable; a student's page has their family's phone and email (call, text, email),
  their next and last classes, their latest scores and the files in their Drive folder, which open full screen
  (pictures, PDFs). A score swipes left to be deleted, or is held for Open and Delete.
- **A score** (`score/[id]`, opened from the student's page): its total, group and where the group sits, and its shots
  played back one by one on the target (`src/features/scores/ShotReplay.tsx`, the same playback as the website's). A
  SIUS result also shows each shot as a dart, series by series, following the replay; a dart opens the shot large,
  with how far from the centre it hit and which way (`src/features/scores/ShotDarts.tsx`). A
  scanned card comes back on its picture, to change bull by bull as when it was checked; a typed card's bulls take new
  scores; the position, the date and the note change; **Save changes** keeps them, with an audit entry
  (`src/features/scores/api.ts`), and **Delete this score** removes it (its file stays in the Drive). A SIUS result's
  scores stay as its PDF gives them.
- **More:** the account, the coaches and the office with their contacts, the appearance (system, light, dark), the
  website, the privacy policy, the version, signing out, and deleting the account.
- **Which build this is:** More → Version shows the version and build number (`release.json`) and, for a copy built on
  this Mac, from which commit and when it was built (`EXPO_PUBLIC_BUILT_AT`, `EXPO_PUBLIC_BUILD_COMMIT`, which
  `scripts/phone.mjs` sets; `src/lib/env.ts`).
- **The audit log:** every change the app makes adds an entry in the same batch, with `via: "app"`
  (`src/lib/audit.ts`), as the website does.

## Running it

The app needs a **development build**: a version of the app with its native parts (Firebase, Google sign-in, the
camera and the image tools) compiled in, installed once on each simulator or phone. Expo Go can't run it: opened there,
it says so and which app to open instead.

**The quickest way**, from the repository root (every step in [docs/running-the-apps.md](../docs/running-the-apps.md)):

- `npm run iphone` or `npm run android` builds a Release build of the real app for the phone plugged into the Mac and
  installs it. An iPhone's is signed by **HyberTec LLC's Apple team**, always (the Apple ID on a Mac may also belong
  to other teams, which never sign Sky Arc).
- `npm run iphone:sim` or `npm run android:sim` does all of the steps below by itself, on simulators of their own: the
  practice copy (the emulators as `demo-skyarc`, the academy with its sample data as of today, the practice logins,
  today's `firestore.rules`), the practice website (http://127.0.0.1:5174), a build when something native changed, and
  the development server on port 8081. `npm run iphone:sim:live` and `npm run android:sim:live` do the same on the real
  project (port 8082).
- `npm run phone:test` runs the Maestro flows ([Checks](#checks)) on a simulator a practice copy runs on.

Those commands choose the practice copy or the real project themselves, so a `.env.local` used with them must not set
`EXPO_PUBLIC_USE_EMULATORS`: in a development build, Expo gives the app that file's values over the command's
(`.env.example` says the same).

### The practice logins

The practice copy has three logins, all made up (reserved `.test` addresses), with one password made at random on
each Mac (kept in `mobile/.expo/practice-login.json`, never in git; the commands print it):

| Login | Who | What the app shows |
| --- | --- | --- |
| `owner@example.test` | The academy's owner (made by `npm run seed`) | The office's tabs |
| `daniel.reed@skyarc-sample.test` | A sample coach | "Coming to the app" |
| `jiyeon.hwang@skyarc-sample.test` | A sample parent | "Coming to the app" |

There is no Google sign-in on the practice copy.

### By hand, against the local emulators

1. Start the emulators from the repository root (Java 21): `npm run emulators`.
2. In another window, fill them (the academy, its owner and its sample data):

   ```bash
   SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 npm run seed -- --owner owner@example.test --owner-name "Test Owner"
   SKYARC_PROJECT=demo-skyarc FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 npm run seed:sample
   ```

   A password for `owner@example.test` in the Auth emulator: `npm run iphone:sim` makes the practice logins by
   itself; by hand, add the user in the Auth emulator with a password and its email confirmed.
3. Install the app's packages, then build and install the development build (the first time, and again whenever a
   package with native code changes):

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_USE_EMULATORS=true npx expo run:ios        # iPhone Simulator
   EXPO_PUBLIC_USE_EMULATORS=true npx expo run:android    # Android emulator
   ```

4. From then on, start the app with `EXPO_PUBLIC_USE_EMULATORS=true npx expo start` and open Sky Arc on the simulator
   (or press `i` or `a`).
5. The website on the emulators, where the app's links lead on the practice copy: `npm run dev:emulators`
   (http://127.0.0.1:5174; sign in from its browser console with `__skyarcSignIn('owner@example.test')`).

The iPhone Simulator reaches the emulators at 127.0.0.1; on the Android emulator React Native Firebase turns 127.0.0.1
into 10.0.2.2 (the Mac) by itself. Against the emulators Firestore keeps no copy on the phone (`src/lib/firebase.ts`),
so the practice copy's data never mixes with the real project's.

A development build's developer menu never opens by itself and has no floating button (`app.config.ts`): shake the
device (⌃⌘Z in the iPhone Simulator, ⌘M on the Android emulator) or press `m` where the development server runs. On the
iPhone Simulator, opening the development server's link may ask "Open in “Sky Arc”?" (click Open);
`maestro/dev-connect.yaml` handles it. After restarting the emulators, sign out, then close and reopen the app: a phone
still signed in holds an account they no longer know.

### Against the real project

- The Firebase project has the app registered: the iOS app and the Android app `com.skyarcacademy.app`, the Android
  one with the SHA-1 and SHA-256 of the standard debug key that every `expo prebuild` project signs its builds with.
  Google Play's upload key and app signing key need adding when the first store build comes
  ([docs/publishing.md](../docs/publishing.md), part 4).
- Their files, `GoogleService-Info.plist` and `google-services.json`, go in `mobile/firebase/` (git-ignored: they
  hold the project's API key); `npm run phone:setup` downloads them with the Firebase CLI. EAS builds would get them
  from the file environment variables `GOOGLE_SERVICES_PLIST` and `GOOGLE_SERVICES_JSON`.
- Google sign-in needs the project's web client, which `app.config.ts` reads from `google-services.json`
  (`client_type` 3; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` overrides it), and on iPhone the reversed client id from
  `GoogleService-Info.plist`, its return address.
- A build without the project's Firebase files uses the placeholders in `firebase/emulator/`, which hold no keys and
  only work against the emulators; such a build says so on its first screen.

## Checks

```bash
npm run typecheck    # the app, with the shared code it uses
npm run lint
```

CI runs both on every pull request ("Phone app typecheck and lint").

`maestro/` holds [Maestro](https://maestro.dev) flows that drive the app on the iPhone Simulator or the Android
emulator, against the practice copy:

- `dev-connect.yaml` (development builds): opens the development server on `PORT` from Expo's launcher, accepts "Open
  in “Sky Arc”?", and puts away the developer menu.
- `sign-in.yaml`: signs in with `EMAIL` and `PASSWORD` (the practice owner) and waits for Today.
- `today.yaml`, `schedule.yaml`, `students.yaml`, `more.yaml`: each tab and the screens that open from it (a class's
  sheet, a student's page and a file, the coaches and a coach's sheet). They change nothing.
- `scan.yaml` (iPhone only for now): a made-up card that `npm run phone:test` draws (`scripts/practice-card.ts`, all
  tens) and puts in the simulator's Photos first, chosen in Scan, read, checked up close and saved for a sample student
  as a prone card. It adds that paper result and the card's copy to the practice copy.
- `screenshots/tab.yaml`: opens the tab `TAB` for the stores' screenshots (`npm run publish:screenshots`).
- `steps/`: steps the flows run, not tests of their own: `tab.yaml` opens a tab (`TAB` and its name `LABEL`),
  `back.yaml` goes back a page.

With `npm run iphone:sim` (or `android:sim`) running in one window, run `npm run phone:test` in another. It signs the
app out, runs `dev-connect.yaml` and `sign-in.yaml`, then every other flow in `maestro/` (or those named:
`npm run phone:test -- students`), each starting from the signed-in app.

## How it is put together

```
app.config.ts          native configuration: ids, version and build (release.json), Firebase files, the camera and photo
                       library permissions, plugins (the iOS 27 scene life cycle, no developer-menu introduction, Google
                       Play's upload key, plain HTTP to the emulators in Release builds)
metro.config.js        builds ../shared into the app (imported as @shared/...)
firebase/emulator/     keyless Firebase files for builds that only talk to the emulators (project demo-skyarc)
src/app/               screens (Expo Router): sign-in, forgot-password, verify-email; (app)/ with the office's tabs and
                       the screens over them, coming-soon, no-access
src/state/             Auth, Branch (the academy) and Appearance providers
src/features/<area>/   each area's data hooks and components
src/components/        the shared building blocks, in the website's neutral look, light and dark; brand/ the logos
src/lib/               Firebase, Firestore hooks, callables, audit, links, toast, Google sign-in, env
src/theme/             colors, spacing and type sizes
maestro/               the test flows (above)
```

`ios/` and `android/` are made from `app.config.ts` by `npx expo prebuild` (`scripts/phone.mjs` does it when something
native changed: the packages, `app.config.ts`, `release.json`, the Firebase files, the upload key, the icons). They
are git-ignored and never edited by hand. `scripts/publish.mjs` builds the stores' versions from the same project;
`eas.json` is there for Expo's cloud builds, which the commands don't use.
