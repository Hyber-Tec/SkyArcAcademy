# Privacy questionnaires: the answers

What the phone app collects, as Apple's **App Privacy** section and Google's **Data safety** form ask for it. Both are
answered the same way, because both describe the same app, and both must agree with the privacy policy
(https://skyarcacademy.web.app/privacy; it must mention the phone app before submitting:
[docs/publishing.md](../publishing.md)). If the app ever starts collecting something new, change these, the policy and
the stores' forms together.

Both stores ask about what **the app** sends off the phone. Records the academy enters on the website (students'
contact details, the schedule, pay) are not collected by the app, even when the app shows them to the office; the
privacy policy covers them.

## What the app actually collects (the facts behind every answer)

| Data | When | Why | Linked to a person | Shared with |
| --- | --- | --- | --- | --- |
| Name, email address | Signing in (Google, or email and password) | The account; who the person is at the academy | Yes | Nobody; stored with Google Firebase (our host) |
| Profile picture (its web address) | Signing in with a Google account that has one | Shown next to the person's name | Yes | Nobody |
| Account id | Signing in | What the person does in the app is theirs (the audit log) | Yes | Nobody |
| Photos of paper targets | When the office photographs a target or chooses a photo of one in Scan | Scoring the target, and keeping it in the student's folder of the academy's Drive | Yes (to the student it's filed for) | Nobody; stored with Google Firebase |
| Scores read from those photos | When the office saves a scanned target | The student's results and progress reports | Yes (the student) | Nobody |
| Nothing else | | No location, contacts, microphone, notifications, analytics, advertising identifiers, crash reporting service, or tracking across other apps or websites | | |

Everything travels encrypted (HTTPS) and is stored with Google Firebase in the United States. People can delete their
account in the app (More → Delete my account) or by asking the academy; the academy's own records stay with it.

## Apple: App Privacy (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

Data types to tick, and their answers (every one: *Linked to the user's identity: Yes*; *Used for tracking: No*):

| Data type | Purpose |
| --- | --- |
| Contact Info → **Name** | App Functionality |
| Contact Info → **Email Address** | App Functionality |
| User Content → **Photos or Videos** (photos of paper targets; the Google profile picture) | App Functionality |
| User Content → **Other User Content** (scores read from the photos) | App Functionality |
| Identifiers → **User ID** | App Functionality |

Not collected: Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, Emails or Text Messages, Audio
Data, Gameplay Content, Customer Support, Browsing History, Search History, Purchases, Usage Data, Diagnostics, Device
ID, Other Data.

**Tracking:** No. The app never links its data with other companies' data for advertising, or shares it with data
brokers, so it never asks for tracking permission.

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
