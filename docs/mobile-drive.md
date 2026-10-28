# The phone app: admin-only Drive folders, and contracts (F4–F6)

What the phone app (`mobile/`) needs after the second meeting's `F4`–`F6` (`docs/MEETING2_FEEDBACK.md`,
`docs/DECISIONS.md` §23), for the Claude Code session on Goo's MacBook Pro. The server, the rules and the website are
done.

## Required: coaches' Drive asks only for what they may see

Every Drive folder and file now has `access: 'staff' | 'admins'` (`shared/src/drive/types.ts`). Owners and admins see
everything; coaches see only `access == 'staff'`, and the rules refuse a coach's query that could return anything else.
So until the phone's coach queries say so, **a coach's Drive screen on the phone fails to load** (scans and a student's
own file list keep working).

- `src/features/drive/useDriveIndex.ts`, lines 65 and 74: for coaches, add `where("access", "==", "staff")` to the
  folders' and the files' queries (owners and admins keep asking for everything), as the website's
  `web/src/features/drive/useDriveIndex.ts` does.

## Recommended (a server function fills these in meanwhile)

- `src/features/drive/api.ts`: write `access` on new folders and files (lines 51, 62 and 178), inherited from the folder
  they're in (`shared/src/drive`'s helpers, as the website's `web/src/features/drive/api.ts`); use `plan.folders`
  instead of line 101; refuse the Contracts folder as a destination (line 109).
- `src/features/scan/save.ts`, lines 84–85: write `access: "staff"` on a scanned card's file (students' folders are
  always staff).
- Show a lock and "Owners and admins" on admin-only folders and files, for owners and admins.

## Optional

- A `contract_signed` notice (to owners and admins when a family signs): an icon in `src/features/notifications/InboxRow.tsx`,
  and opening it on the website from `src/features/notifications/inbox.ts` (line 69), as website messages do.
