# Running the phone app

How to open the Sky Arc phone app in the iPhone Simulator and the Android emulator, put the newest version on your real
iPhone (and an Android phone) over the cable, tell which version a device has, and get past a build that fails.
Written for someone who has never done mobile development and remembers nothing from last time: every command is
written out, and every step that only a person can do (unlock a phone, tap Trust) says so.

The website needs none of this: GitHub deploys it from `main` (docs/DEPLOY.md), and you open it at
https://skyarcacademy.web.app. Nothing here goes to TestFlight or the App Store; that's [docs/publishing.md](publishing.md).

## Before anything else: the three things to know

1. **There are two copies of Sky Arc.** The **real one** is skyarcacademy.web.app and its data. The **practice copy**
   is a whole Sky Arc running only on this Mac (Firebase's emulators, as the project `demo-skyarc`) with the academy and
   its **sample data**: made-up coaches, students, families and classes around the day it starts. Nothing you do there
   reaches anyone, and it forgets everything when it stops. Real phones only ever use the real one (they can't reach a
   copy that lives on your Mac). Simulators can use either.
2. **A simulator is a phone in a window on your Mac.** Apple's is called the *iPhone Simulator*; Android's is called
   the *emulator*. Both run the real phone software, so the app looks and behaves as on a phone, with a few limits
   listed further down (no camera in the iPhone Simulator).
3. **Every command is typed in Terminal, in the Sky Arc folder.** Press **⌘ Space**, type `Terminal`, press
   **Return**, then `cd` into the folder where you keep the Sky Arc repository (the one with `package.json` and
   `mobile/`). You do that once per Terminal window. The easiest way of all is to ask Claude Code in that folder ("put
   the app on my iPhone", "open the iPhone Simulator", "stop the app"): it runs the same commands.

## Who is who in the app

An **owner** or an **admin** who signs in gets the office's five tabs (Home, Schedule, Scan, Students, More). A **coach**
gets Home, Schedule, Availability, Scan and More (Students is More's first row, with News, the Drive, Reports and
Payroll): their own classes, their availability, every student without the family's contacts, scanning cards and
changing scores. A **parent** or a **student** who signs in gets the family's five tabs (Home, Classes, Scores, Reports,
More): a parent their children's classes, scores and shared progress reports, a student their own. An email the
academy hasn't added sees "No access yet".

On the **real Sky Arc**, sign in as yourself: with **Google** (the account you use on the website), or the email and
password you use there.

On the **practice copy**, there's no Google: sign in with one of its four made-up logins. They share one password,
made at random on this Mac the first time (in `mobile/.expo/practice-login.json`, never in git); the command prints it
when the app opens.

| Login | Who | What the app shows |
| --- | --- | --- |
| `owner@example.test` | The academy's owner | The staff's tabs, everything |
| `daniel.reed@skyarc-sample.test` | A sample coach | The staff's tabs, a coach's view |
| `jiyeon.hwang@skyarc-sample.test` | A sample parent | The family's tabs, with her two children |
| `seoyeon.lim@skyarc-sample.test` | A sample student (her parent has a login too; a shared report) | The family's tabs, her own |

## The commands

| Command | What it does |
| --- | --- |
| `npm run iphone` | Builds the app and puts it on **your iPhone**, plugged into the Mac with its cable. The real Sky Arc. |
| `npm run android` | The same for **an Android phone**, plugged in with its cable. The real Sky Arc. |
| `npm run iphone:sim` | Opens the **iPhone Simulator** with the app on the **practice copy**. |
| `npm run android:sim` | Opens the **Android emulator** with the app on the **practice copy**. |
| `npm run iphone:sim:live` | The iPhone Simulator on the **real** Sky Arc. |
| `npm run android:sim:live` | The Android emulator on the **real** Sky Arc. |
| `npm run phone:test` | Runs the app's automatic test flows on the simulator a `:sim` command has open (`mobile/README.md`, "Checks"). |
| `npm run phone:setup` | Gets a Mac ready and lists what is left for you to do by hand. For a new computer, or when something is missing. |

Each command first checks and does whatever is needed (the app's packages, the Firebase files, a new build when
something in the app changed, for the simulators the practice copy itself), then opens the app. **The first build takes
10 to 20 minutes**; after that a phone gets a new version in a few minutes and a simulator opens in about a minute. The
command prints a line starting with **✓** when the app is open or installed, and says in plain words what is wrong when
something is.

Two options can be added after `--`:

- `npm run iphone:sim -- --fresh` fills the practice copy again (as of today) and signs the app out first, as on a new
  install.
- `npm run iphone -- --rebuild` (or any other command) builds the app again from scratch, for when a build is broken.
  It takes as long as the first time.

For a phone, the command finishes by itself once the app is installed. For a simulator, **leave the Terminal window
open** while you use the app: it feeds the app its code. When you are done, click in that window and press **Ctrl+C**:
it stops the practice copy too, when this window started it (one started elsewhere, by another window or by Claude
Code, keeps running and is shared). The simulator window stays open; close it or leave it.

## Your real iPhone

`npm run iphone` puts the **real Sky Arc** on the iPhone plugged into the Mac, as a finished app: it runs on its own
afterwards, with no cable and no Mac, until you install a newer version. It is signed by **HyberTec LLC's** Apple
Developer team, so **an install keeps opening for a year**; the command prints the exact day it stops. Before that day,
plug in and run the command again. Nothing goes through TestFlight or the App Store.

### The first time on a new iPhone (or a new Mac)

Step 1 is done once per Mac; 2 and 3 once per iPhone. A Mac and an iPhone that already run HyberTec's other app this
way are ready: skip to [Every time](#every-time).

1. **Xcode signs for HyberTec LLC.** In Xcode: **Xcode → Settings… → Accounts**. If the Apple ID that is on HyberTec
   LLC's team is not listed, click **+**, choose **Apple Account**, **Continue**, sign in. Click the Apple ID, then the
   **HyberTec LLC** line, then **Manage Certificates… → + → Apple Development → Done**. If your Apple ID also belongs
   to other teams (another company's, or your personal team), that's fine: the command always picks HyberTec LLC for
   Sky Arc, and never the others.
2. **On the iPhone, turn on Developer Mode:** Settings → Privacy & Security → **Developer Mode** (at the very bottom)
   → on → **Restart** → after the restart, **Turn On**.
3. **Plug the iPhone into the Mac** with its cable and **unlock it**. If it asks "Trust This Computer?", tap **Trust**
   and enter the passcode. Keep it unlocked while the command runs.

The first `npm run iphone` also registers the iPhone with HyberTec LLC's team and creates the app's identity
(`com.skyarcacademy.app`) in HyberTec's Apple account, by itself.

### Every time

1. Plug the iPhone in, unlock it, leave it unlocked.
2. Run:

   ```bash
   npm run iphone
   ```

   It says what it is doing step by step (`▸ …`), builds only what changed (a few minutes; 10 to 20 the first time),
   installs the app, opens it, and ends with `✓ Sky Arc is on <your iPhone>, and runs without the Mac.` plus the day
   this install stops opening. Unplug.
3. On the phone: **sign in** with Google or your email and password, as on the website. The first time you open Scan,
   the iPhone asks whether Sky Arc may use the camera, and when you choose a photo, whether it may see your photos:
   allow both (the app uses them only for paper targets).

## The iPhone Simulator

1. Run:

   ```bash
   npm run iphone:sim
   ```

   The first time it makes a simulator called **Sky Arc Practice** (an iPhone 17 on the newest iOS), starts the
   practice copy, builds the app and opens it. Later runs take about a minute. Wait for the line
   `✓ Sky Arc is open on the simulator "Sky Arc Practice", on the practice copy (the sample academy, on this Mac).`
   and the practice logins under it. The simulator's window is the **Simulator** app up to Xcode 26 and **Device Hub**
   from Xcode 27 (this Mac's); the command opens whichever this Mac has.
2. If the simulator asks **"Open in “Sky Arc”?"**, click **Open**. A simulator's copy also has a developer menu
   (Reload, and tools Claude Code uses), which never opens by itself: **⌃⌘Z** in the iPhone Simulator (**⌘M** in the
   Android emulator), or press **m** in the Terminal window, opens it. Your phones and the stores never have it.
3. **Sign in** with `owner@example.test` and the password the command printed.
4. Useful keys: **⌘S** takes a screenshot (saved on the Desktop). **⇧⌘H** is the Home button. **⇧⌘A** switches between
   light and dark. If typing does not reach the iPhone: menu bar **I/O → Keyboard → Connect Hardware Keyboard**.
5. **Photos for Scan:** the iPhone Simulator has no camera; drag a photo of a paper target from Finder onto the
   simulator's window to put it in its Photos, then choose it in Scan. `npm run phone:test -- scan` does all of it with
   a made-up card (`scripts/practice-card.ts`). From Terminal (`xcrun simctl addmedia`), use a photo outside Documents,
   Desktop and Downloads: macOS protects those folders, the simulator can't read them, and its Photos then waits until
   the simulator restarts (`xcrun simctl shutdown "Sky Arc Practice"`, then `npm run iphone:sim` again).
6. **Stop:** click in the Terminal window and press **Ctrl+C**.

The same on the real Sky Arc: `npm run iphone:sim:live` makes a second simulator, **Sky Arc Live**, where you sign in
with Google or an email and a password, and everything is real.

## The Android emulator

1. Run:

   ```bash
   npm run android:sim
   ```

   The first time it makes an emulator called **SkyArc_Practice** (a Pixel 9 on Android 16 with Google Play), builds
   the app and opens it. Wait for the `✓ Sky Arc is open on …` line. If the emulator's window stays black for more than
   a couple of minutes, close it and run the command again.
2. **Sign in** with a practice login, as on the iPhone Simulator.
3. **Stop:** **Ctrl+C** in the Terminal window. The emulator stays open; close its window when you like.

`npm run android:sim:live` is the same on the real Sky Arc (emulator **SkyArc_Live**). Android needs Android Studio on
the Mac ([A brand new Mac](#a-brand-new-mac-from-scratch)).

## The practice website

While a `:sim` command runs on the practice copy, the website runs on it too, at **http://127.0.0.1:5174** (open it in
Chrome, and type the numbers rather than `localhost`). That's where the rest of the office's work is on the practice
copy (changing classes, people, the Drive): the app shows those changes at once. To sign in there as the practice owner,
open Chrome's console (**⌥⌘J**) on that page and type `__skyarcSignIn('owner@example.test')`, then Return.

## Your Android phone

`npm run android` does the same for an Android phone plugged in with its cable. An Android phone keeps the app for good
(no yearly reinstall, no Apple account).

The first time: on the phone, **Settings → About phone → Software information**, tap **Build number** seven times (on
other Android phones, Build number is right under About phone); back in Settings, **Developer options → USB debugging:
on**; plug the phone into the Mac and, on "Allow USB debugging?", tick **Always allow from this computer** and tap
**Allow**. Then `npm run android`, which ends with `✓ Sky Arc is on <your phone>, and runs without the Mac.`

## Which version is on a device

- **The app:** **More → Version** shows the version and the build number (`mobile/release.json`, which every store
  release raises) and, for a copy built on this Mac, from which commit and when it was built (seven characters such as
  `f716af7`; in Terminal, `git log -1 --format=%h` shows the one your folder is on).
- **A simulator:** the same. A simulator's app also reloads by itself when the code changes while the command runs, so
  it is always the code in your folder.

## When a build fails

The commands say in plain words what is wrong when they know it, and what to do. Otherwise, in this order:

1. **Run the same command again.** A download that failed halfway is the most common cause.
2. **Read the last lines** the command printed. "No iPhone is plugged in", "Developer Mode is off", "needs Java 21" and
   the like say exactly what to do.
3. **Ask Claude Code**, for example "npm run iphone fails, please fix it". It reads the full logs, which are in
   `mobile/.expo/logs/`.
4. **Build from scratch:** `npm run iphone -- --rebuild` (or the command that failed, with `-- --rebuild`).
5. **After Xcode updated itself** (the App Store updates it): open Xcode once, let it install what it asks for, then run
   the command again.

| What you see | What to do |
| --- | --- |
| Sky Arc on the iPhone no longer opens, about a year after it was installed | Expected: plug in and run `npm run iphone`. |
| "Xcode can't sign for HyberTec LLC" | Step 1 of [The first time on a new iPhone](#the-first-time-on-a-new-iphone-or-a-new-mac), then run it again. |
| "No iPhone is plugged in" although it is | Unlock the phone, use a data cable (some charge-only cables carry no data), tap **Trust** if it asks. |
| "Untrusted Developer" when opening the app | On the iPhone: Settings → General → VPN & Device Management → **HyberTec LLC** → **Trust**. |
| The app keeps loading after the practice copy was stopped and started | In the app: More → Sign out, close the app (swipe it away) and open it again. Or `npm run iphone:sim -- --fresh`. |
| A red screen with an error in the app | A mistake in the app's code. Take a screenshot (⌘S in the Simulator, or the phone's own) and give it to Claude Code. |
| "Port 8081 … is taken by another program" | Another Terminal window already runs a development server. Press Ctrl+C there, or close that program. |
| "Port 8080 (or 9099, 5001, 9199, 9000) … is taken" | An old practice copy (`npm run emulators`) is still running somewhere: press Ctrl+C in its window. If you don't know where: ask Claude Code. |
| "The practice copy didn't start" | Run it again. If it still fails: "the practice copy won't start" to Claude Code. |
| The Android emulator stays black, or "didn't finish starting" | Close its window and run the command again. |
| "signed differently" when installing on an Android phone | Delete Sky Arc from the phone, then run `npm run android` again. |

## What a simulator cannot do

- **No camera in the iPhone Simulator.** Scan from the photo library instead (drag a photo onto the simulator first).
  Try the camera on your iPhone.
- **No Google sign-in on the practice copy**: it has no Google. Sign in there with a practice login.
- No real phone calls or texts: the Call and Text buttons do nothing in a simulator.

## A brand new Mac, from scratch

What a Mac needs, in this order. Each is a download and a few clicks; allow an afternoon, mostly waiting.

1. **Xcode**, from the Mac App Store (sign in with your Apple ID; it is large). Open it once, click **Agree**, and let
   it install its extra parts. In Terminal afterwards: `sudo xcode-select -s /Applications/Xcode.app` (it asks for your
   Mac password).
2. **Homebrew**, from https://brew.sh: copy the one line it shows into Terminal and press Return.
3. **Node.js**, the "LTS" version from https://nodejs.org (a normal installer).
4. **Android Studio**, from https://developer.android.com/studio (only for Android): drag it into Applications, open it
   once, choose the **Standard** setup and let it download.
5. **The Firebase CLI:** in Terminal, `npm install -g firebase-tools`, then `firebase login` (it opens the browser:
   sign in with the Google account that can open the `skyarcacademy` Firebase project). It lets the setup download the
   app's Firebase files and runs the practice copy.
6. **The repository:** `git clone https://github.com/Hyber-Tec/SkyArcAcademy.git`, then `cd SkyArcAcademy` and
   `npm ci`. Copy from the old Mac the files that are never in git: `web/.env.local` (the website's settings) and, only
   for publishing, the folder `mobile/.publish/`.
7. **`npm run phone:setup`.** It installs the rest by itself (packages, CocoaPods, Java 17 and 21, the Android phone
   image and the emulators), downloads the app's Firebase files into `mobile/firebase/`, and ends with a numbered list
   of anything left for you to do by hand, with the exact steps. For the test flows it also wants **Maestro**:
   `curl -Ls "https://get.maestro.mobile.dev" | bash`.
8. **For your iPhone:** step 1 of [The first time on a new iPhone](#the-first-time-on-a-new-iphone-or-a-new-mac).

If the Firebase CLI cannot be used, the two Firebase files can be downloaded by hand: Firebase console → project
**skyarcacademy** → ⚙ **Project settings** → **Your apps** → the iOS app (`com.skyarcacademy.app`) →
**GoogleService-Info.plist**, and the Android app → **google-services.json**. Save both in `mobile/firebase/`.

## Where things are

| | |
| --- | --- |
| `mobile/` | The app's code. How it is built: [mobile/README.md](../mobile/README.md). |
| `scripts/phone.mjs` | The commands above. `scripts/publish.mjs`: the publishing commands ([docs/publishing.md](publishing.md)); `scripts/review-logins.ts`: the stores' reviewers' logins. |
| `mobile/release.json` | The version and build number the app shows and the stores get. |
| `mobile/firebase/GoogleService-Info.plist`, `mobile/firebase/google-services.json` | The skyarcacademy project's Firebase settings for the iPhone and Android apps. Never in git (they hold the project's API key); `npm run phone:setup` downloads them. |
| `mobile/.expo/practice-login.json` | The practice logins' password, on this Mac only. |
| `mobile/.expo/logs/` | What the practice copy, its website, the emulator and the phone builds printed, for when something goes wrong. |
| `mobile/ios/`, `mobile/android/` | The native projects, made by the commands from `mobile/app.config.ts`. Never edited by hand, never in git. |
