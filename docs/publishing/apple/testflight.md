# TestFlight, step by step (optional)

TestFlight puts the exact build Apple will review on phones before it reaches the App Store. **Sky Arc doesn't need
it**: Apple reviews a build as soon as it's uploaded and processed
(https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses). Use it when you want to
try the store build on your own iPhone first, or to let the academy's staff try a version before families get it.

Do it after [app-store.md](app-store.md), part 4 (the build is uploaded), and before part 7 (submitting). Checked
against Apple's pages on 2026-10-20.

## Two kinds of testers

| | Internal testers | External testers |
|---|---|---|
| Who | People in HyberTec's App Store Connect team (up to 100) | Anyone with an email address, or a public link (up to 10,000) |
| Apple's review first | No: the build is there in minutes | Yes: a short **Beta App Review** for the first build of each version, usually about a day |
| Good for | You and HyberTec, trying the build at once | The academy's staff, or a few families |

A build stays testable for 90 days. The copy TestFlight installs replaces the one `npm run iphone` installed (it is the
same app); the App Store's copy replaces TestFlight's later.

## You, in minutes (internal testing)

1. **Make the group.** App Store Connect → https://appstoreconnect.apple.com/apps → Sky Arc → **TestFlight** tab → **+**
   next to **Internal Testing** → name `HyberTec` → tick **Enable automatic distribution** (every new build reaches the
   group by itself) → **Create**.
2. **Add yourself.** In the group: **+** next to **Testers** → tick yourself (and anyone else at HyberTec) → **Add**.
   Only people already in HyberTec's App Store Connect team (**Users and Access**) can be internal testers.
3. **Install.** On the iPhone, install **TestFlight** from the App Store
   (https://apps.apple.com/app/testflight/id899247664), open Apple's invitation email → **View in TestFlight** →
   **Install**.
4. **Try it** with your own account or the review logins (`open -e mobile/.publish/review-logins.json`). Report a
   problem from the TestFlight app (**Send Beta Feedback**, with a screenshot) or tell Claude Code.

## The academy's staff (external testing)

1. **Test Information** (once). **TestFlight** tab → **Test Information** (left sidebar): from
   [testflight-notes.md](../../store/testflight-notes.md), the **Beta App Description** and the **Feedback Email**;
   under **Beta App Review Information**, tick **Sign-in required** with the **office** login, your name, phone (`+1 …`)
   and email, and the review notes ([review-notes.md](../../store/review-notes.md)). **Save.**
2. **Make the group.** **+** next to **External Testing** → name `Sky Arc staff` → **Create**.
3. **Add the build.** In the group: **Builds** → **+** → the build → **What to Test**: paste from
   [testflight-notes.md](../../store/testflight-notes.md) → **Submit for Review**. Apple's Beta App Review answers
   within about a day; later builds of the same version usually skip it.
4. **Add testers.** **Testers** → **+** → **Add New Testers** → their names and emails (the emails the academy has for
   them, so the app lets them in). Or **Create Public Link** to share one link instead.
5. **They install.** Each tester gets Apple's email: install TestFlight, then **View in TestFlight** → **Install**.

## Then

When the build is the one to ship, go back to [app-store.md](app-store.md), part 5. A tester's TestFlight copy turns
into the App Store's copy once they install Sky Arc from the App Store.

Apple's guide: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
