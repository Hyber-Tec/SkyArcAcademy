# The phone app: families cancel and ask for classes, and everyone's notices (M1, M2, M4)

What the phone app (`mobile/`) needs to match the website, for the Claude Code session that builds it on Goo's MacBook
Pro. The decisions are `docs/DECISIONS.md` §23 and the tasks `docs/MEETING2_FEEDBACK.md` (`S1`–`S8`, `M1`, `M2`, `M4`).
The server and the website's side are built: families never write the schedule themselves, they call the server,
which checks each step with the shared rules, writes it with its audit entry, and tells whoever needs to know.

## The rules (shared/src/schedule/requests.ts)

- **Cancel:** a parent (any parent linked to the student) or the student cancels an upcoming class until it's
  confirmed: `settings.schedule.autoConfirm.hoursBefore` (24 hours by default) before it starts. After that the button
  is off, with `cancelRuleText(settings)` saying why. `familyCancelCheck(seat, now, settings)` decides.
- **Ask for a class:** a makeup for a missed class still owed (`makeupsOwed` in `shared/src/schedule/classes.ts`: a
  class canceled or missed in the last six weeks, `MAKEUP_LOOKBACK_DAYS`, with no makeup booked; a missed makeup is
  lost, `makeupsLost`), a class moved to another time (one of the student's upcoming classes; it stays booked until the
  office approves), or an extra class (the sheets' "Practice"). Only classes with seats open, from now to
  `settings.schedule.requests.daysAhead` days ahead (`requestHorizon`). `requestCheck(...)` says whether a request can
  be made and why not.
- **Families see how many seats are open, never who's in a class.** They read `classSeats`, not `classes`.

## The server (functions/src/requests.ts), callable functions

Every call takes `branchId` (the academy the app shows, `useBranch().branchId`, the demo academy too) and an optional
`via: 'app'` for the audit log. Errors come back as `HttpsError` with the message to show as is.

| Callable | Who | Input | Result |
| --- | --- | --- | --- |
| `cancelClass` | A parent of the student, or the student | `{ branchId, sessionId, via }` | `{ ok: true }`; the seat is `canceled` with `canceled: { at, by, via: 'family' }` |
| `requestClass` | A parent of the student, or the student | `{ branchId, studentId, kind: 'makeup' \| 'reschedule' \| 'extra', classId, forSessionId (null for extra), message }` | `{ requestId }` |
| `withdrawClassRequest` | The family | `{ branchId, requestId }` | `{ ok: true }` |
| `decideClassRequest` | Owners and admins | `{ branchId, requestId, decision: 'approve' \| 'reject', note, via }` | `{ ok: true, sessionId }`: the seat booked, labelled `seatLabelFor(kind, forDateKey)` ("MU for 10/26", "Practice"), and a moved class canceled |

## The data

- `branches/{b}/classSeats/{classId}` (`ClassSeats`): a class's `dateKey`, `startMin`, `endMin`, `startAt`, `seats`,
  `taken` and `isDeleted`, kept by the server. Every active member reads it. Query by `dateKey` range; show
  `isRequestable(...)` ones.
- `branches/{b}/classRequests/{id}` (`ClassRequest`): the office reads all; a family reads its own children's (query
  `where('studentId', '==', id)`, one per child, as for sessions). Nobody writes them but the server. `status`:
  `pending`, `approved`, `rejected` (with `decisionNote`), `withdrawn`. `requestLine(r)` writes one in a line, and
  `REQUEST_STATUS_LABELS` its status in the family's words.
- `branches/{b}/notificationPrefs/{email}` (`NoticePrefs` in `shared/src/notices.ts`): a parent's, a student's or an
  owner's or admin's switches (`classChanges`, `requests`, `scores`, `reports`, `announcements`, `websiteMessages`),
  each on unless set to `false`, with `updatedAt: serverTimestamp()`. Each person writes only their own.
  `noticeSwitchesFor(role)` lists the switches a role sees, with their labels and help. Coaches keep their four on
  their staff record, as now.

## The notices

Every notice is an inbox item, pushed to the person's phones (`docs/mobile-push.md`), following their switches:

| To | When | `type` | Link (website path) |
| --- | --- | --- | --- |
| The office | A family cancels | `class_canceled_by_family` | `admin/schedule?date=…` |
| The office | A family asks | `class_requested` | `admin/schedule?date=…&request=…` |
| The family | The office answers | `request_approved`, `request_rejected` | `parent/classes?date=…` (`student/…`) |
| The family | The academy cancels, moves, removes or restores a class, or marks it missed | `session_canceled`, `session_date_changed`, `session_time_changed`, `session_deleted`, `session_restored`, `session_no_show` | `parent/classes?date=…` |
| The family | The office books a makeup or an extra class itself | `session_created` | `parent/classes?date=…` |
| The family | A new score (dated in the last week) | `score_added` | `parent/scores?score=…` |
| The family | A post shown to families, sent with Notify | `announcement`, `announcement_updated` | `parent/news/…` |
| The family | A shared progress report (as before) | `report_shared` | `report/…` |

`appTargetOf(link, refs)` in `shared/src/push.ts` now also returns `classes` (a family's classes on a day), `scores`
and `report`, and a family's `news/…` opens the post.

## What the phone needs

- **M1, families:** on a class's sheet (`(family)/session/[id]`), **Cancel** (with the app's confirmation; off after
  the deadline with the reason) and **Move to another time**; **Ask for a class** from Classes (the kinds above, the
  open seats by day from `classSeats`, an optional message); the makeups owed and the requests with their answers at
  the top of Classes, with Withdraw for one still waiting. The website's version: `web/src/features/requests/`
  (`AskForClassDialog`, `FamilyRequestsPanel`) and `web/src/features/family/FamilyWidgets.tsx` (`ClassDetails`).
- **M2, the office:** the requests waiting (Home and the schedule, with their count), each opened to **Approve** or
  **Decline** with a note, through `decideClassRequest`. The website's: `web/src/features/requests/OfficeRequests.tsx`.
- **M4, switches:** More → Notifications for parents, students and the office from `noticeSwitchesFor(role)`, saved
  to `notificationPrefs/{email}`; coaches keep theirs.
- **The inbox for families:** the family's part has no inbox yet; their notices are in `notifications` like everyone's
  (`recipientKey` their email).
