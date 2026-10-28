# The phone app's push notifications (M3)

What the phone app (`mobile/`) needs for push notifications, for the Claude Code session that builds it on Goo's
MacBook Pro. It's `M3` in [`MEETING2_FEEDBACK.md`](MEETING2_FEEDBACK.md): the manager wants families, students,
coaches and the office told on their phones about everything that concerns them. Goo approved adding the push
packages on 2026-10-28: a new build, and **nothing uploaded to the stores** until Goo asks.

## What the server already does

Nothing on the server has to change for M3.

- **Every inbox item is pushed.** The Cloud Functions write a person's notices to `branches/{b}/notifications`
  (`sendNotifications` in `functions/src/notify.ts`), then push each new one to that person's phones (`pushItems` in
  `functions/src/push.ts`, through Firebase Cloud Messaging). The inbox, the website's bell and the phone always say
  the same thing, and each person's switches apply to all three.
- **A person's phones are found by email:** one document per app install, `users/{uid}/devices/{deviceId}`, shaped as
  `DeviceDoc` in `shared/src/push.ts`: `token` (the FCM registration token), `email` (the signed-in email, lower case),
  `platform` (`ios` or `android`), `appVersion` ("1.1.0 (5)"), `label` ("Apple iPhone 17 Pro, iOS 27.0"), `createdAt`,
  `updatedAt`. `firestore.rules` (`match /devices/{deviceId}`) lets a person write their own with exactly these fields
  and read or delete their own. The server deletes a document whose token FCM reports dead.
- **What a push carries:** `notification.title` and `body`; the iPhone badge (the person's unread count in that
  academy) and the thread; on Android the channel (`PUSH_CHANNELS`: `sessions` "Classes" and `announcements`
  "Announcements", `channelFor(type)`); and `data` (`PushData`, all strings): `type`, `branchId`, `notificationId`, `link`
  (the website's path below the site, `coach/schedule?date=…`), `url`, `sessionId`, `announcementId`, `dateKey`.
- **Where a tap goes:** `appTargetOf(link, refs)` in `shared/src/push.ts`, which the inbox rows already use: the
  schedule on a day, an announcement, the announcements, or Home. Notices it doesn't know yet open Home (or the inbox).
  New kinds of notices (family cancellations and requests, new scores) come from the Mac mini in Phase 1, with their
  targets in `appTargetOf`.
- **The demo academy never pushes** (its notices stay in the inbox): test with the real academy's notices or with a
  push sent to your own token (below).
- **Who gets what today:** coaches get announcements and their classes' changes (with their four switches, More →
  Notifications); parents and students get a shared progress report; owners and admins get the website's messages.
  Phase 1 adds the rest (`S4`, `P13`) and switches for every role (`M4`).

## What the phone needs

1. **The packages**, with `npx expo install` (they match SDK 57): `@react-native-firebase/messaging` (the app already
   uses React Native Firebase 26), plus whatever SDK 57 recommends for showing a notice while the app is open and for
   creating Android's channels (`expo-notifications` or Notifee; read the SDK 57 docs first, as `mobile/AGENTS.md`
   says). The config plugin adds the iPhone's push entitlement (`aps-environment`) and the background mode.
2. **Asking for permission at the right time:** not at launch, and never as a condition for using the app (Apple's
   guideline 4.5.4). After sign-in, once, with a line on why ("Get told when a class changes or a new score is
   in"), and a way to turn it on later from More → Notifications if the person said no. Android 13 and later ask for
   `POST_NOTIFICATIONS` too.
3. **Saving the token:** after sign-in and permission, write `users/{uid}/devices/{deviceId}` (`deviceId` a stable id
   kept per install), and again when FCM refreshes the token or the app version changes. On sign-out, delete it
   **before** signing out (the rules need the person signed in). Account deletion already removes the user's data on
   the server.
4. **Taps:** a tap on a push opens what `appTargetOf` says, from the app closed (the initial notification), in the
   background and open. In the demo academy and the real one alike, the `branchId` in the data must match the academy
   the app is showing; otherwise open Home.
5. **While the app is open:** show the notice as a banner (or refresh the inbox and Home's bell), never twice.
6. **Android's channels:** create `PUSH_CHANNELS` at start, with their names and descriptions.
7. **The badge:** the server sets it with each push; when the person reads their inbox, set it to the unread count
   (zero when all are read).

## What Goo does (once)

1. **Apple's push key:** [developer.apple.com/account](https://developer.apple.com/account) → Certificates, IDs &
   Profiles → **Keys** → **+** → name it "Sky Arc push" → tick **Apple Push Notifications service (APNs)** → Continue →
   Register → **Download** the `.p8` file (Apple lets you download it only once; keep it with the other keys) and note
   its **Key ID**.
2. **Into Firebase:** [console.firebase.google.com](https://console.firebase.google.com) → Sky Arc → ⚙ Project settings
   → **Cloud Messaging** → Apple app configuration → the iOS app → **APNs Authentication Key** → Upload: the `.p8`, its
   Key ID, and HyberTec's Team ID (top right of the Apple developer site).
3. **The app's identifier:** Certificates, IDs & Profiles → **Identifiers** → the Sky Arc app → make sure **Push
   Notifications** is ticked (the build's signing may do it by itself).

Android needs nothing from Goo: Firebase sends to Android directly.

## When it's released

- **The stores' privacy answers change** (`docs/store/privacy-answers.md`, "When the app changes"): Apple's App Privacy
  gets **Identifiers → Device ID** (the notification token; linked to the person; App Functionality). Google's Data
  safety already covers it (Device or other IDs).
- **What's New** names it ("Notifications for class changes and news"). The version is Goo's call at release time:
  1.1.0 (build 5) if 1.1.0 hasn't gone to Apple yet, otherwise 1.2.0 (`docs/publishing/updates.md`).

## Trying it

- **The iPhone Simulator** receives real pushes on an Apple-silicon Mac (iOS 16 and later), so a token from the
  Simulator works like a phone's. `xcrun simctl push` shows how a payload looks without the server.
- **A real push to yourself:** with your own token, from the Firebase console (Messaging → New campaign → Send test
  message), or a short local script with the admin SDK. Ask Goo before anything that writes to production.
- **The whole path:** a notice the real academy sends you (an announcement to coaches, if you're one) arrives as a push
  and opens the right screen. The demo academy doesn't push.
