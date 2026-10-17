# Privacy questionnaires: the answers

What the phone app collects, as Apple's **App Privacy** section and Google's **Data safety** form ask for it. Both are
answered the same way, because both describe the same app, and both must agree with the privacy policy
(https://skyarcacademy.web.app/privacy; it must mention the phone app before submitting:
[docs/publishing.md](../publishing.md)). If the app ever starts collecting something new, change these, the policy and
the stores' forms together.

Both stores ask about what **the app** sends off the phone, including what the outside code inside it collects (Apple:
"You must include information about your app's privacy practices and those of third-party partners whose code you
integrate into your app"). Records the academy enters on the website (students' contact details, the schedule, pay) are
not collected by the app, even when the app shows them to the staff; the privacy policy covers them.

Checked on 2026-10-17 against Apple's App Privacy pages, Firebase's and Google Sign-In's own statements of what their
code collects, and the privacy manifests inside the app's build.

## What the app actually collects (the facts behind every answer)

| Data | When | Why | Linked to a person | Shared with |
| --- | --- | --- | --- | --- |
| Name, email address | Signing in (Google, or email and password) | The account; who the person is at the academy | Yes | Nobody; stored with Google Firebase (our host) |
| Profile picture (its web address) | Signing in with a Google account that has one | Shown next to the person's name | Yes | Nobody |
| Account id | Signing in | What the person does in the app is theirs (the audit log) | Yes | Nobody |
| Photos of paper targets | When the staff photographs a target or chooses a photo of one in Scan | Scoring the target, and keeping it in the student's folder of the academy's Drive | Yes (to the student it's filed for) | Nobody; stored with Google Firebase |
| Scores read from those photos | When the staff saves a scanned target | The student's results and progress reports | Yes (the student) | Nobody |
| IP address (the general area it points to) | Signing in with Google; every request to the server | Google's sign-in uses it to spot fraud ("IP address, which may be used to estimate the general location of a device for fraud prevention"); the server's logs keep it for security and troubleshooting | Yes | Nobody; Google provides the sign-in and the hosting |
| Device, system, app and Firebase versions | When the app talks to Firebase | Firebase's own statistics on which versions are in use ("never linked to a user or device identifier") | No | Google (Firebase) |
| Nothing else | | No precise location, contacts, microphone, notifications, analytics, advertising identifiers, crash reporting service, or tracking across other apps or websites | | |

Everything travels encrypted (HTTPS) and is stored with Google Firebase in the United States. People can delete their
account in the app (More → Delete my account) or by asking the academy; the academy's own records stay with it.

## Apple: App Privacy (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

Data types to tick, and their answers (every one: *Used for tracking: No*):

| Data type | Linked to the user's identity | Purpose |
| --- | --- | --- |
| Contact Info → **Name** | Yes | App Functionality |
| Contact Info → **Email Address** | Yes | App Functionality |
| User Content → **Photos or Videos** (photos of paper targets; the Google profile picture) | Yes | App Functionality |
| User Content → **Other User Content** (scores read from the photos) | Yes | App Functionality |
| Identifiers → **User ID** | Yes | App Functionality |
| Location → **Coarse Location** (the general area of the IP address: Google's sign-in, against fraud; the server's logs) | Yes | App Functionality |
| Diagnostics → **Other Diagnostic Data** (device, system, app and Firebase versions) | No | Analytics |

Not collected: Phone Number, Physical Address, Other Contact Info, Health & Fitness, Financial Info, Precise Location,
Sensitive Info, Contacts, Emails or Text Messages, Audio Data, Gameplay Content, Customer Support, Browsing History,
Search History, Device ID, Purchases, Usage Data, Crash Data, Performance Data, Surroundings, Body, Other Data.

**Tracking:** No. The app never links its data with other companies' data for advertising, or shares it with data
brokers, so it never asks for tracking permission.

**Check before publishing the answers:** Xcode's privacy report of the build you submit (Xcode → **Window** →
**Organizer** → the archive → **Generate Privacy Report**) lists what the outside code inside the app declares; it should
match this list. Google Sign-In's file declares more types than Google says it uses (Google's page names only "User
identifier" and "IP address"); go by Google's page, and ask Claude Code if the report shows something new.

**When push notifications come to the app:** add Identifiers → **Device ID** (the phone's notification token; Linked:
Yes; App Functionality).

## Google: Data safety (Play Console → App content → Data safety)

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Which account creation methods does your app support?** None in the app (the academy creates accounts on its
  website); sign-in with a username and password, and OAuth (Google).
- **Do you provide a way for users to request that their data is deleted?** Yes: in the app, and the privacy policy's
  "Your choices".
- **Data types:**

| Category → type | Collected | Shared | Processed ephemerally | Required or optional | Purposes |
| --- | --- | --- | --- | --- | --- |
| Personal info → **Name** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **Email address** | Yes | No | No | Required | App functionality, Account management |
| Personal info → **User IDs** | Yes | No | No | Required | App functionality, Account management |
| Photos and videos → **Photos** (paper targets; the Google profile picture) | Yes | No | No | Optional | App functionality |
| App activity → **Other user-generated content** (scores from the photos) | Yes | No | No | Optional | App functionality |

Everything else: not collected. **Shared** is No everywhere: Google's form does not count service providers working
for us (Firebase) as sharing.

**Check before submitting to Google Play:** the facts above now include the IP address's general area and Firebase's
version statistics (added for Apple on 2026-10-17). Google's form may want them too (Location → **Approximate
location**; App info and performance → **Diagnostics**): answer as Google's own guidance for Google Sign-In and Firebase
says on that day.
