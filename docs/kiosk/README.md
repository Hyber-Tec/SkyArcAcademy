# The kiosk tablet

The time clock at the front desk: a Samsung Android tablet on a wall mount, always on and charging, running **Sky Arc
Kiosk** (`kiosk/`). Coaches tap the screen, type their PIN, and clock in or out, exactly as on the website's kiosk
(`/kiosk`), which stays as a backup. It works without the internet: what it records waits on the tablet and goes to
the academy when the Wi-Fi is back. Goo's call, 2026-11-07: an app of its own, installed from a file over USB (never
from a store), and a "simple kiosk": the app is the tablet's home screen, pinned with Android's "pin app", and keeps
the screen on and bright by itself.

## The rules it follows

The same as every clock-in (`docs/DECISIONS.md` §23, the second meeting's `K1`–`K6`):

- **One PIN per coach** (Employees → the coach → Kiosk PIN, 4 digits by default: Settings → Pay & time clock → Kiosk).
  A tap on the big button clocks in, or out when they're in.
- **Clock times stay as clocked.** Paid time starts 30 minutes before the coach's first class (never earlier) and
  ends at the end of their last class; anyone still clocked in at midnight is clocked out then, and Home lists them.
  The payroll works this out; the tablet only records the times.
- **Nobody signs in on the tablet.** It's registered once with the **setup PIN**, which an admin sets on the website
  (Settings → Pay & time clock → Kiosk tablets, `docs/DECISIONS.md` §6, Q9). Five wrong tries lock it for 15 minutes.
  The tablet then has its own key; removing it on the website stops it at once.

## How it works without the internet

- **Who's who:** at every sync the server sends the coaches who have a PIN, each PIN only as its fingerprint (the
  same SHA-256 the server keeps), so the tablet recognizes a PIN offline. The PINs themselves never leave the website.
- **Each clock-in or clock-out is saved on the tablet first** (an "op", with its own id and the time it happened),
  then sent. The tablet syncs every minute, right after each tap, and the moment the internet comes back.
- **The time** is the tablet's clock, corrected by how far it was from the server's at the last sync.
- **The server applies each op once** (`shared/src/kiosk/ops.ts`, `functions/src/kiosk.ts`), in order:
  - **A clock-in** starts a shift, unless the coach is already in, or the time falls inside a shift they already have
    that day: time is never counted twice.
  - **A clock-out** closes the shift it belongs to, found by the tablet's clock-in even when both were recorded offline.
  - **A clock-out recorded offline before midnight**, arriving after the midnight automatic clock-out closed the shift,
    replaces the automatic one with the real time.
  - **Refused, and listed in Settings → Activity:** a time more than 5 minutes ahead of the server's (a wrong tablet
    clock), more than 14 days old, in a locked pay period, or a clock-out with no clock-in.
- **Time entries** show "Kiosk tablet" for its shifts, and "Recorded offline" when a time was sent later.
- **Settings → Pay & time clock → Kiosk tablets** shows each tablet's last sync. "Offline" there means its newest
  clock-ins may not be in yet: they come in when it's back.

## Setting up the tablet (once)

1. **The website:** Settings → Pay & time clock → **Kiosk tablets** → choose the **setup PIN** (4 to 8 digits).
2. **The tablet** (a Samsung, after a factory reset):
   - **Setup wizard:** connect the academy's Wi-Fi. Skip the Google and Samsung accounts. **Set a screen lock PIN**,
     kept by Goo: it's what stops anyone unpinning the app.
   - **Developer options:** Settings → About tablet → Software information → tap **Build number** 7 times.
   - **Settings → Developer options:** **USB debugging** on (for installing), and **Stay awake** on (never sleeps
     while charging).
   - **Display:**
     - **Screen timeout:** the longest.
     - **Adaptive brightness:** off, with the brightness high.
     - **Eye comfort shield** and **Extra dim:** off.
   - **Battery:**
     - **Battery protection** on (stops charging at 80%), for a tablet that's always plugged in.
     - **Power saving:** off.
   - **Device care → Auto optimization:** **Auto restart** off.
   - **Software update:** **Auto download over Wi-Fi** off, so it never restarts itself for an update during a class.
3. **Install** (the Mac with this repository):
   - Plug the tablet into the Mac with USB-C, and allow USB debugging on the tablet when it asks.
   - Run `npm run kiosk:build` (once per version), then `npm run kiosk:install`.
4. **Register:** the app opens on "Set up this tablet". Name it (Front desk), then type the setup PIN.
5. **Make it the home screen:** press the tablet's Home button and choose **Sky Arc Kiosk** → **Always** (or Settings →
   Apps → Choose default apps → **Home app** → Sky Arc Kiosk). After a restart or a power cut, it opens by itself.
6. **Pin it:**
   - Settings → Security and privacy → More security settings → **Pin app**: on, with **Ask for PIN before unpinning**.
   - Then open Recents, tap the kiosk's icon at the top of its card, and choose **Pin this app**.
   - To unpin: hold Back and Recents together, then type the tablet's screen lock PIN.
7. **Mount it, plugged in.**

The app keeps the screen on and at full brightness while it's open, hides Android's bars, and moves its welcome screen
a few pixels every minute so an always-on screen never burns in.

## The admin menu

Hold the logo at the top left for 3 seconds, then type the setup PIN the tablet was registered with. It shows the last
sync, what's waiting, and anything the academy refused, with three buttons:

- **Sync now.**
- **Android settings** (unpin first: a pinned app can't open them).
- **Register again**, after the website removed the tablet. Clock-ins still waiting are kept and sent after.

## Updating the app

Change `kiosk/`, raise `android.versionCode` (and `version`) in `kiosk/app.config.ts`, then run `npm run kiosk:build`
and `npm run kiosk:install` with the tablet plugged in (unpin it first). It installs over the old one and keeps its
registration and anything waiting.

The install file is signed with the kiosk's own key, made at the first build, valid for 100 years. It's in
`kiosk/.publish/` on the Mac that built it, never in git. Keep a copy: without it, a new version can't install over the
old one, and the tablet would need uninstalling (losing anything not sent) and registering again.

## Trying it on the practice copy

1. Start the emulators and seed them (CLAUDE.md, "Commands"). Give sample coaches PINs on the website (Employees), and
   set a setup PIN in Settings.
2. Run `npm run kiosk:build -- --practice`: the app talks to the functions emulator at `10.0.2.2:5001`, as the
   Android emulator reaches the Mac.
3. Run `npm run kiosk:install -- --practice` with an Android emulator running (a Pixel Tablet suits it).
4. Turn the emulator's Wi-Fi off and on to try offline: `adb shell svc wifi disable` / `enable`, and the same with
   `svc data`.
