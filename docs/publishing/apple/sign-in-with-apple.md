# Sign in with Apple, once (Goo)

Since 2026-11-03 people make their accounts in the phone app ([`DECISIONS.md`](../../DECISIONS.md) §31). An app that
offers Google for that must offer Sign in with Apple too (Apple's guideline 4.8), and an app with Sign in with Apple
revokes a person's Apple tokens when they delete their account in it (guideline 5.1.1(v)). The app does both
(`mobile/src/lib/appleSignIn.ts`); Apple's and Firebase's consoles need these settings once, **before the next store
update** (1.1.0). Nothing here changes the build Apple is reviewing now.

The app's identifier is `com.skyarcacademy.app`, HyberTec LLC's team. Checked against Apple's and Firebase's pages on
2026-11-03: https://developer.apple.com/help/account/configure-app-capabilities/configure-sign-in-with-apple-for-the-web
and https://firebase.google.com/docs/auth/ios/apple.

## 1. The capability on the app's identifier

1. https://developer.apple.com/account/resources/identifiers/list → **com.skyarcacademy.app**.
2. Tick **Sign In with Apple** → **Edit** → **Enable as a primary App ID** → **Save** → **Save** again (Apple warns that
   the app's provisioning profiles must be made again: the next build does it by itself).

## 2. A Services ID (Firebase needs it to revoke tokens)

1. Same page → **+** → **Services IDs** → **Continue**. Description `Sky Arc sign-in`, identifier
   `com.skyarcacademy.app.signin` → **Continue** → **Register**.
2. Open it → tick **Sign In with Apple** → **Configure**: Primary App ID **com.skyarcacademy.app**; Domains
   `skyarcacademy.firebaseapp.com`; Return URLs `https://skyarcacademy.firebaseapp.com/__/auth/handler` → **Next** →
   **Done** → **Continue** → **Save**.

## 3. A key for Sign in with Apple

1. https://developer.apple.com/account/resources/authkeys/list → **+**. Name `Sky Arc Sign in with Apple`, tick **Sign in
   with Apple** → **Configure** → Primary App ID **com.skyarcacademy.app** → **Save** → **Continue** → **Register**.
2. **Download** the `.p8` file (Apple lets you download it once) and note its **Key ID**. Keep it in your password
   manager: never in the repository (CLAUDE.md, "Secrets").
3. Your **Team ID** is on https://developer.apple.com/account → Membership details.

## 4. Apple in Firebase

1. https://console.firebase.google.com/project/skyarcacademy/authentication/providers → **Add new provider** → **Apple**
   → **Enable**.
2. **Services ID** `com.skyarcacademy.app.signin`; under **OAuth code flow configuration**: the **Apple team ID**, the
   **Key ID** and the **private key** (the whole text of the `.p8` file, opened in TextEdit) → **Save**.

## 5. Optional: email to hidden addresses

Someone who chooses **Hide My Email** gets an `…@privaterelay.appleid.com` address. Apple forwards mail to it only from
senders the team registered, and the app's account emails (password reset) come from HyberTec's Gmail: on
https://developer.apple.com/account/resources/services/configure → **Sign in with Apple for Email Communication** →
**+**, add that Gmail address. Such a person can't be found by their email on the academy's records anyway: they ask
the academy in the app, which approves them.

## Then

The next build (`npm run iphone:sim -- --rebuild` on the Mac, and 1.1.0 for the stores) carries the capability; on a
phone, **Continue with Apple** shows on the sign-in screen and on Create an account. A build signed by a free team
(Xcode's Personal Team) leaves it out, as it leaves out push notifications (`mobile/app.config.ts`).
