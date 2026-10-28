# Privacy questionnaires: the answers

What the phone app collects, as Apple's **App Privacy** section ([apple/app-store.md](../publishing/apple/app-store.md),
step 21) and Google's **Data safety** form ([google-play/production.md](../publishing/google-play/production.md), step
6) ask for it. Both must agree with the privacy policy (https://skyarcacademy.web.app/privacy). If the app starts
collecting something new, change these, the policy and the stores' forms together.

Both stores ask about what **the app** sends off the phone, including what the outside code inside it collects. Records
the academy enters on the website (students' details, families' contacts, the schedule, pay) are not collected by the
app, even when the app shows them; the privacy policy covers them.

Checked on 2026-10-20 against the app (families, coaches and the office), Apple's App Privacy pages, the privacy
manifests inside the App Store build, and Firebase's and Google Sign-In's own statements of what their code collects.

## What the app collects (the facts behind every answer)

| Data | When | Why | Linked to a person | Shared with |
| --- | --- | --- | --- | --- |
| Name, email address | Signing in (Google, or email and password) | The account; who the person is at the academy | Yes | Nobody; stored with Google Firebase (our host) |
| Profile picture (its web address) | Signing in with a Google account that has one | Shown next to the person's name | Yes | Nobody |
| Account id | Signing in | What the person does in the app is theirs (the audit log) | Yes | Nobody |
| A coach's phone, home address and date of birth | A coach fills them in on their own record (More → Account) | The academy's employee record (only admins see them) | Yes | Nobody |
| Photos of paper targets, and photos added to a student's folder | Staff photograph a target or choose a photo (Scan, the Drive) | Scoring the target; keeping it in the student's folder of the academy's Drive | Yes (the student it's filed for) | Nobody |
| Scores read from those photos, and corrections to scores | Staff save or correct a score | The student's results and progress reports | Yes (the student) | Nobody |
| Comments on the academy's announcements | Staff write one | Read by the academy's staff only | Yes | Nobody |
| A coach's availability | A coach sets the days and times they can teach | The academy's schedule | Yes | Nobody |
| What a person opened, and their notification choices | Opening a report or an announcement ("Viewed"); a coach's notification switches | The academy sees a report was read; what a coach is told about | Yes | Nobody |
| IP address (the general area it points to) | Signing in with Google; every request to the server | Google's sign-in uses it against fraud; the server's logs keep it for security and troubleshooting | Yes | Nobody; Google provides the sign-in and the hosting |
| Device, system, app and Firebase versions | When the app talks to Firebase | Firebase's statistics on the versions in use ("never linked to a user or device identifier") | No | Google (Firebase) |
| Firebase's installation id (Android) | When the app starts | Firebase's own identifier of the app's copy on a phone ("does not uniquely identify a user or physical device") | No | Google (Firebase) |
| The phone's notification token, with the install's own id, the phone's model and the app's version (from the build with push notifications) | Once the person allows notifications | Sending them their notifications; removed when they sign out | Yes | Nobody; Google (Firebase Cloud Messaging) and, on iPhone, Apple deliver them |
| Nothing else | | No precise location, contacts, microphone, analytics, advertising identifiers, crash reporting, or tracking across other apps or websites | | |

Everything travels encrypted (HTTPS) and is stored with Google Firebase in the United States. People delete their
account in the app (More → Delete my account) or by asking the academy; the academy's own records stay with it.

## Apple: App Privacy

App Store Connect → Sky Arc → **App Privacy** → **Get Started**. **Do you or your third-party partners collect data from
this app?** Yes. Tick these types, each *Used for tracking: No*:

| Data type | Linked to the user's identity | Purpose |
| --- | --- | --- |
| Contact Info → **Name** | Yes | App Functionality |
| Contact Info → **Email Address** | Yes | App Functionality |
| Contact Info → **Phone Number** (a coach's own) | Yes | App Functionality |
| Contact Info → **Physical Address** (a coach's own) | Yes | App Functionality |
| User Content → **Photos or Videos** (paper targets, photos in students' folders, the Google profile picture) | Yes | App Functionality |
| User Content → **Other User Content** (scores, staff comments, a coach's availability) | Yes | App Functionality |
| Identifiers → **User ID** | Yes | App Functionality |
| Identifiers → **Device ID** (the phone's notification token; from the build with push notifications) | Yes | App Functionality |
| Usage Data → **Product Interaction** (which reports and announcements a person opened) | Yes | App Functionality |
| Location → **Coarse Location** (the general area of the IP address: Google's sign-in, against fraud; the server's logs) | Yes | App Functionality |
| Diagnostics → **Other Diagnostic Data** (device, system, app and Firebase versions) | No | Analytics |
| Other Data → **Other Data Types** (a coach's date of birth; notification choices) | Yes | App Functionality |

Not collected: Other User Contact Info, Health and Fitness, Financial Info, Precise Location, Sensitive Info, Contacts,
Emails or Text Messages, Audio Data, Gameplay Content, Customer Support, Browsing History, Search History, Purchases,
Advertising Data, Other Usage Data, Crash Data, Performance Data, Surroundings, Body (and Device ID, for a build without
push notifications).

**Tracking:** No. The app never links its data with other companies' data for advertising and never shares it with
data brokers, so it never asks for tracking permission.

**Check before publishing the answers:** Xcode's privacy report of the build you submit (Xcode → **Window** →
**Organizer** → the archive → **Generate Privacy Report**) lists what the outside code declares. Google Sign-In's file
declares more types than Google says it uses (Google's page names only the user's identifier and the IP address); go by
Google's page, and ask Claude Code if the report shows anything else.

## Google: Data safety

Play Console → **App content** → **Data safety**.

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Which account creation methods does your app support?** None in the app (the academy creates accounts on its
  website); people sign in with an email and password, or with Google (OAuth).
- **Account deletion:** in the app (More → Delete my account), and on the web for people without the app:
  `https://skyarcacademy.web.app/help#delete` (ask the academy; it says what the academy keeps).
- **Data types** (none shared: Google's form doesn't count a service provider working for us, Firebase, as sharing):

| Category → type | Collected | Processed ephemerally | Required or optional | Purposes |
| --- | --- | --- | --- | --- |
| Personal info → **Name** | Yes | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | No | Required | App functionality, Account management |
| Personal info → **User IDs** | Yes | No | Required | App functionality, Account management |
| Personal info → **Phone number** (a coach's own) | Yes | No | Optional | App functionality |
| Personal info → **Address** (a coach's own) | Yes | No | Optional | App functionality |
| Personal info → **Other info** (a coach's date of birth) | Yes | No | Optional | App functionality |
| Photos and videos → **Photos** | Yes | No | Optional | App functionality |
| App activity → **App interactions** (reports and announcements opened) | Yes | No | Required | App functionality |
| App activity → **Other user-generated content** (scores, staff comments, a coach's availability) | Yes | No | Optional | App functionality |
| App info and performance → **Diagnostics** (Firebase's version statistics) | Yes | No | Required | Analytics |
| Device or other IDs → **Device or other IDs** (Firebase's installation id; the phone's notification token) | Yes | No | Required | App functionality |

Everything else: not collected. Firebase's own list of what its Android code collects, for checking on the day:
https://firebase.google.com/docs/android/play-data-disclosure. The families' part of the app collects only their names,
emails, account ids and what they opened; the camera and the photos are the staff's.

## When the app changes

- **Push notifications** (built 2026-10-28, `docs/mobile-push.md`): in the answers above. Update Apple's App Privacy
  (Identifiers → **Device ID**) when submitting the first build that has them; Google's **Device or other IDs** already
  covers the token. The privacy policy already says it ("If you allow notifications on a device, we keep a
  notification token for it").
- **A new permission or form:** a new line here, in the privacy policy, and in both stores' forms.
