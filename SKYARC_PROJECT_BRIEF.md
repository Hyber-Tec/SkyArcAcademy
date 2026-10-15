# Sky Arc Platform: Project Brief for Claude Code

> **Read this whole file before writing any code.**
> This is the full context for building the Sky Arc Sports Academy platform. It covers who the client is, what they asked for, what we already decided, and how to build it, starting from our existing product, **HyberCRM**.
>
> Owner: **Goo Choi** (HyberTec LLC). If anything here is unclear or conflicts with what you find in the code, **stop and ask Goo**. Don't guess.

---

## 0. TL;DR

- **Client:** Sky Arc Sports Academy (skyarcacademy.com), a youth shooting sports academy (air rifle: standing / kneeling / prone).
- **What we're building:** A **single-academy** CRM/platform: scheduling, students & parents, employees (directory, calendar, pay rates, payroll, time entries), **kiosk clock-in**, and **progress report management** (SIUS PDFs and paper-target photos shared with parents).
- **Starting point:** Our product **HyberCRM** at `/Users/goomini/Documents/HyberTec/HyberCRM`. It already has most of this, built for tutoring centers. **Review it fully first**, then fork/refactor it for Sky Arc. Reuse as much as possible; remove what Sky Arc doesn't need.
- **Web first. No mobile app yet. No landing page work** (just a simple homepage + login).
- **First priorities:** 1) Scheduling, 2) Payroll / time entries / kiosk, 3) Progress reports. Then everything else on the web.

---

## 1. Who's Who

| Person | Role |
|---|---|
| **Goo Choi** | HyberTec, project owner / lead dev |
| **HyberTec developers** | The rest of the team |
| **The manager** | Runs Sky Arc day to day and manages the coaches (doesn't teach classes). Our main contact. At the academy every day. |
| **The owner** | **Main boss.** Handles **payroll**. |
| **Coaches** | 4 part-time coaches (+ the manager = 5 staff). |
| **Students** | About 40, mostly middle school to early high school. Many families are **Korean**. |

This repository is public: the client's people are named by role here. Names and contacts stay in the local
`docs/internal/` (git-ignored).

**HyberTec** builds websites, custom platforms, CRMs, and iOS/Android apps.

---

## 2. Step 1: Review HyberCRM BEFORE Building Anything

**Path:** `/Users/goomini/Documents/HyberTec/HyberCRM` (on Goo's Mac mini, where all work runs)

This copy is the latest version. If anything looks out of date, check `git status` / `git log` there and ask Goo before pulling or changing anything. **Treat HyberCRM as read-only.** Never edit, commit, or push in that repo.

HyberCRM is our multi-branch CRM for tutoring centers. It was forked from and improved on the True Education CRM. We (the super admin) create **branches**, and each tutoring center gets its own CRM. It includes scheduling, students, an employee directory, a calendar, pay rates, payroll, time entries, announcements, access control, settings, a mobile app, and more. **Goo put a lot of work into it and loves how it works.** The Sky Arc platform should feel like HyberCRM: same quality, same patterns, same UX.

### What to do
1. **Read the whole codebase**, including its `CLAUDE.md`, README, docs, and any runbooks. Understand:
   - Tech stack, folder structure, and build/deploy setup
   - Firebase structure (collections, security rules, storage, functions)
   - Multi-branch / super-admin architecture: how deeply "branch" is wired into the data model, rules, and routes
   - Roles & access control
   - Every feature module and how it maps (or doesn't) to Sky Arc
   - Design system: shadcn/ui setup, theme tokens, layout, components
   - The mobile app: just understand how it shares code/data, since it comes later
2. **Write a review + fork plan** (`docs/HYBERCRM_REVIEW.md` in the new repo) that covers:
   - Feature-by-feature table: **Keep as-is / Adapt / Remove / New**
   - Terminology changes (see §4)
   - How you'll handle multi-branch (see below)
   - Data model changes
   - Risks and questions for Goo
3. **Show the plan to Goo and get a confirmation before large deletions or restructuring.**

### Fork strategy
- Goo's preference: **start from a copy of HyberCRM** and refactor it, rather than rebuilding from scratch. Delete what we don't need, adapt what we do. The final choice of *how* (full copy then strip, or selective port) is yours, but **the result must preserve HyberCRM's patterns, quality, and features we keep.**
- **New GitHub repo** and **new Firebase project** for Sky Arc. Never point at HyberCRM's Firebase. Never copy secrets, service-account files, or `.env` values from HyberCRM.
- **Single academy only.** Sky Arc doesn't need branch creation or a super-admin layer.
  - If "branch" is shallow in HyberCRM → remove it.
  - If it's deeply wired (rules, queries, paths) → it's acceptable to keep **one fixed branch** internally and hide all branch/super-admin UI, if that's safer than ripping it out. Explain your choice in the review doc.
- Remove HyberCRM / True Education / demo branding, names, and data.

---

## 3. Scope

### Phase 1: Web app (NOW)
| Priority | Module |
|---|---|
| 1 | **Schedule** (classes, recurring student slots, coach shifts, makeups, cancellations, trials) |
| 2 | **Employees**: Directory, Calendar, Pay Rates, **Payroll**, **Time Entries**, **Kiosk clock in/out** |
| 3 | **Progress Reports** (new for Sky Arc; see §6) |
| 4 | Students & Parents (roster, parent accounts, parent portal on web) |
| 5 | Everything else worth keeping from HyberCRM: Home/dashboard, Announcements, Account, Access Control, Settings, notifications |
| — | **Homepage:** minimal placeholder only (logo + short line + Login). **Don't design a landing page.** Goo will build it last. |

### Phase 2: Mobile app (LATER, don't start)
- Roles: **Admin, Coach, Parent, Student**
- Admin use case: **take a photo of a paper target → upload to the student's reports** from the phone
- Push notifications (announcements, cancellations, new reports)
- Goal for Phase 1: keep data models and APIs **mobile-ready**, the same way HyberCRM's web and app share data.

### Out of scope (decided)
- **Landing page design** (later, by Goo)
- **Mobile app** (Phase 2)
- **SIUS automation / integration.** We are **not** connecting to SIUS. Staff save the PDF from SIUS manually and upload it. No need to research SIUS internals.
- **Tutoring-style session logs** (HyberCRM's "Sessions"/session reports). Sky Arc doesn't need them unless the review finds a clear reuse.
- Tutoring-only features (subjects/curriculum, SAT diagnostics as-is, etc.). Reuse their *code/UX* where it helps, especially diagnostics **compare** for progress reports, but remove tutoring concepts.

---

## 4. Terminology (Tutoring → Sky Arc)

| HyberCRM | Sky Arc |
|---|---|
| Tutor / Teacher | **Coach** |
| Tutoring center / Branch | **Academy** (single) |
| Session (tutoring) | **Class** / lesson slot |
| Subject | Not needed. Sky Arc's equivalent dimension is **Position**: Standing / Kneeling / Prone (used in progress reports) |
| Diagnostics / test report | **Progress Report** (SIUS or paper target) |
| Makeup | **Makeup (MU)** class |

Confirm with Goo if any naming feels off.

---

## 5. Scheduling: Requirements

### How Sky Arc works today
- Managed in **Google Sheets**, duplicated every week. The manager says scheduling is the hardest part of the job.
- Very **structured**: the same kids come on the same days every week. Most students take **2 classes/week** (Mon/Wed or Tue/Thu).
- Lots of **new trial students** right now.
- **Real examples of their weekly sheets** are in the assets (§9). **Read all four PDFs** to understand the slot structure, capacity, how coaches are assigned, what "MU" looks like, trials, and Thursday hours. Use them to design the model and to **seed realistic data**.

### Operating hours (current; must be configurable because they'll expand)
| Day | Class hours |
|---|---|
| Mon | 4:30 – 8:00 PM |
| Tue | 5:00 – 8:00 PM |
| Wed | 5:00 – 8:00 PM |
| Thu | "A little different." **Check the schedule PDFs.** |
| Sun | 2:00 – 5:30 PM |
| Fri / Sat | Probably closed. **Confirm from the PDFs.** |

### Student scheduling
- **Recurring weekly slots** per student (e.g., every Mon & Wed 5:00).
- **Cancellations:** parents can cancel from the parent portal. **Admin gets notified** immediately (e.g., parent cancels at 9 PM the night before → the manager is notified). The owner specifically asked for cancel/reschedule notifications.
- **Cancellation rules** are configurable in Settings (e.g., "no cancelling within 24 hours"). Actual values are **pending from the academy**, so use sensible defaults and make them editable.
- **Makeup classes (MU):** a missed class can be made up. Parents can **see open slots and book a makeup themselves** (no more calling to ask "is this slot open?"). Rules (how many, how far ahead, which slots) are configurable; values pending.
- **Capacity:** max students per coach / per slot. Configurable; value pending (check the PDFs for current practice).
- **Trials:** currently the website form just emails the manager, who replies by hand. New: a **public trial booking page** that shows **real availability** and books a slot (with trial length and per-slot limits, configurable). It can live at a simple route like `/trial` and be linked from the placeholder homepage.
- Views: **Day / Week / Month**, by coach, with conflicts and pending items, same as HyberCRM's schedule screens.

### Coach scheduling
- All coaches are **part-time on fixed days** (e.g., one coach Tue/Wed, another Mon–Thu; the manager every day).
- **Shift = class time minus 30 minutes** (class 5–8 → coach 4:30–8).
- **Sunday rotation:** 2 coaches one Sunday, 2 different coaches the next (alternating). The schedule model must support **alternating-week recurrence**.
- Coaches can fill in their **own availability / time off** (as in HyberCRM).
- The manager and the owner are finalizing a fixed coach schedule. Real coach names and hours are **pending**.

---

## 6. Progress Reports: Requirements (NEW, core feature)

This was the **manager's #1 priority.** Parents currently never see their kids' results. Reports get saved to a local folder or printed into a file cabinet, and most are never looked at. Parents have asked to see how their kids improve.

### Sources
1. **SIUS electronic target PDFs.** Staff click Stop → Save in the SIUS software and get a PDF with scores and the target image. **Samples in §9** (Kneeling / Prone / Standing, all 20-shot).
2. **Paper targets.** Scored by eye, with the total written on the paper. Staff take a **photo with their phone**. **Samples in §9.**

### Frequency
- **Only official evaluations**, not daily practice. Around **1–3 per student per month.** They're restarting fresh with this system.

### Admin: upload
- **Manual upload** (decided). Must be fast:
  - **Bulk upload** several SIUS PDFs at once → a **review table** where each file is matched to a student, position, and date → confirm.
  - **Auto-fill from PDF content:** parse each SIUS PDF (they share the same format) to pull **student name, date/time, shot count, scores**, etc. **Do not trust filenames.** The samples are inconsistent (`<name> 20 Shot Prone 202.pdf`, `<name> 20 shot standi.pdf`, `<name> 20hot standing avg.pdf`). Use fuzzy name matching against the roster, and let the admin correct it.
  - **Position** (Standing / Kneeling / Prone) chosen from a **dropdown**. Pre-fill it if detectable.
- **Paper target upload:** upload a photo (JPEG/HEIC; auto-orient + compress), choose student, position, date, and **enter the total score manually**. Converting to PDF is not required; the goal is that parents can view it.
- Edit / replace / delete a report. Optional coach notes/comments on a report.
- **Draft vs. Published:** parents only see published reports. (Confirm with Goo; a reasonable default is to publish on upload.)

### What to extract from SIUS PDFs
- **Open and study every sample PDF first.** Document the exact structure in the review doc: which fields exist (total, series totals, decimal vs. integer scoring, averages, shot coordinates/plot, time, etc.).
- Store structured score data **and** the rendered pages/target image.
- Don't assume the format described in the kickoff meeting (10 shots out of 100). **The samples are 20-shot reports. Go by the real files.**

### Parent: view
- Per-student **report library ("folder")**, organized by **date**, filterable by **position** and **source** (electronic/paper).
- View **in the browser without downloading.** Render PDF pages and the target image as web content. Download can be an extra option.
- **Progress over time:** score trend chart per position.
- **Compare any two reports side by side** (e.g., lowest vs. latest, Oct 7 vs. Nov 7). Reuse HyberCRM/True Education's diagnostics **compare** UX.
- If the PDF data allows it: show **shot grouping / miss-direction tendencies**. An AI-generated summary or suggestions is a nice-to-have later (follow the "AI" naming rule).
- **Notify the parent** when a new report is published (in-app now; push in Phase 2).

### Permissions
- Parents see **only their own children's** reports. Reports concern **minors**, so storage and database rules must enforce this. Never use public URLs for report files.
- Coaches: confirm with Goo whether they see all students or only their own (default: all, read-only).

---

## 7. Employees, Time Entries & Payroll: Requirements

Keep HyberCRM's **Directory, Calendar, Pay Rates, Payroll, Time Entries** and adapt them to coaches.

- **Today:** the manager logs all coach hours **by hand** (hours are fixed).
- **Clock in/out (decided): kiosk.** A **kiosk page** runs on a device at the academy. The coach enters a **PIN** to clock in or out.
  - PINs are stored **hashed**. They're never logged and never committed.
  - The kiosk device is locked to kiosk mode (no access to the rest of the admin app).
  - If HyberCRM already has kiosk, location, or Wi-Fi clock-in, reuse its patterns. **Kiosk is the method for Sky Arc.**
- Admin can **review, edit, and approve time entries**. The system **calculates hours and pay**.
- **Payroll is run by the owner**, who needs admin/payroll access. Pay rates and pay period are **pending**; keep them configurable.
- Coaches can see their **own** hours, schedule, availability, and payroll history.

---

## 8. Other Modules & Requirements

- **Students & Parents:** roster (~40; real list pending from the academy), parent accounts linked to one or more children, emergency/contact info as in HyberCRM.
- **Announcements / News:** keep from HyberCRM. The academy wants **tournament/competition updates and important announcements** for parents. A public "News" feed for the future website should be able to reuse the same data.
- **Notifications:** cancellations/reschedules → admin; new report / announcements → parents.
- **Language: Korean + English.** Many families are Korean, and the academy said this is important. Required at minimum on **parent-facing** screens (parent portal, trial booking, homepage). Admin screens can stay English unless HyberCRM already has i18n. Check what HyberCRM supports and propose an approach.
- **Access Control & roles:** Admin (the manager), Owner with payroll (the owner), Coach, Parent. (Student role comes with mobile.)
- **Homepage:** simple placeholder: Sky Arc logo, one line, **Login**, and **Book a Trial** links. Use brand colors. **No landing-page design work.**

### Brand
- Colors: **red, black, white** (match the current skyarcacademy.com; pull exact values from the logo SVGs).
- Logos: `skyarc-logo.svg` (for light backgrounds) and `skyarc-logo-white.svg` (for dark backgrounds).
- App UI follows HyberCRM's design system (shadcn/ui + react-icons), themed with Sky Arc colors.

---

## 9. Assets (received from the academy)

Location: the **`SkyArcAcademy/`** folder on Goo's Mac mini. It's the folder this brief lives in, and Claude Code runs from there. Run `pwd` to get the absolute path. Folder names contain spaces, so **always quote paths** in shell commands.

**Never commit real student data or real report files** into the repo. Use them locally for analysis and for seeding a dev Firebase only, or create anonymized fixtures. If the new app repo is created inside this folder, add the asset folders to `.gitignore` before the first commit. A cleaner option is to create the repo as its own folder next to it (e.g. `/Users/goomini/Documents/HyberTec/SkyArc`); ask Goo which he prefers.

```
SkyArcAcademy
├── SkyArc_Meeting_Notes.md             → notes from the kickoff meeting (local only)
├── Google Sheets for Scheduling        → real weekly schedules (exported to PDF)
│   ├── 9_21-9_27, 2026.xlsx - Sheet1.pdf
│   ├── 9_28-10_4, 2026.xlsx - Sheet1.pdf
│   ├── 10_5-10_11, 2026.xlsx - Sheet1.pdf
│   └── 10_12-10_18, 2026.xlsx - Sheet 1.pdf
├── logo
│   ├── skyarc-logo-white.svg
│   └── skyarc-logo.svg
├── Sample paper target photos          → IMG_9505 … IMG_9514.jpeg (10 photos)
└── Sample SIUS PDFs                    → 10 real 20-shot reports, named by hand as "<student> <shots> <position>"
    ├── Kneeling  → 1 PDF
    ├── Prone     → 6 PDFs
    └── Standing  → 3 PDFs
```

(The file names carry real students' names, so they are not listed in this committed brief. Run `ls` in the folder.)

**Use them for:**
- Schedule PDFs → slot structure, hours, capacity, MU/trial patterns, seed data
- SIUS PDFs → parser design and tests (fixtures anonymized if committed)
- Paper photos → upload flow, orientation/compression, viewer
- Logos → app shell, homepage, favicon

---

## 10. Still Pending from the Academy (design for these, use placeholders)

- Full student roster + exact headcount
- Student class schedule (who's in which slot). Partly visible in the schedule PDFs.
- Coach names + working hours; finalized coach schedule incl. Sunday rotation
- Payroll details: pay rates, pay period (from the owner)
- Detailed operating hours
- Rules: max students per coach, cancellation, makeup, trial booking
- Website content (programs, tuition, about, gallery, news). Only needed for the landing page later.
- Domain access. Needed right before launch.

**Everything above must be configurable in Settings, not hard-coded.**

---

## 11. Suggested Order of Work

1. Review HyberCRM → write `docs/HYBERCRM_REVIEW.md` (feature map, fork plan, branch strategy, data model, SIUS PDF format, questions) → **confirm with Goo**
2. Set up the new repo + new Firebase project config (no secrets committed), CI, `CLAUDE.md`
3. Fork/strip: rebrand, terminology, single-academy, remove unused modules
4. **Scheduling** (hours, recurring slots, coach shifts + Sunday rotation, cancellations + notifications, makeups, trials)
5. **Employees / Time Entries / Kiosk / Payroll**
6. **Progress Reports** (SIUS parser, bulk upload review, paper photo upload, viewer, trend, compare, parent notifications)
7. Parent portal on web (reports, schedule, cancel, makeup booking), KR/EN on parent-facing screens
8. Announcements, dashboard, settings, access control cleanup
9. Placeholder homepage + login + trial link
10. Then stop. Mobile app is a separate phase.

Each of these is its own branch → PR (see `CLAUDE.md` rules).

---

## 12. Timeline Context

- The web app is what matters for the first launch. Building can go fast, but **going live (especially App Store
  publishing) takes longer**.
- Weekly check-ins with the academy. Dates live in the local `docs/internal/`.

---

## 13. Engineering Rules

See **`CLAUDE.md`** (these rules are strict). Also carry over every rule and convention from **HyberCRM's `CLAUDE.md`** that still applies.
