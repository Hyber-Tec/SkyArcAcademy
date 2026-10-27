import { doc, serverTimestamp, setDoc, updateDoc } from "@react-native-firebase/firestore";
import { ACADEMY_ID, DEMO_ACADEMY_ID, showsDemo } from "@shared/academy";
import { COL, ROOT } from "@shared/paths";
import { type Portal, type Role, isAdminRole, portalOf } from "@shared/roles";
import { type BusinessRules, resolveBusinessRules } from "@shared/settings/businessRules";
import type { BranchSettings } from "@shared/settings/defaults";
import { resolveSettings } from "@shared/settings/resolve";
import type { Branch, Member, Staff } from "@shared/types";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import { useDoc } from "@/lib/firestore";
import { useAuth } from "./AuthProvider";

/** Who does something, as the audit log records it (web/src/lib/audit.ts). */
export interface Actor {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

export interface BranchState {
  /** The academy (`ACADEMY_ID`), or the demo academy for a member of it alone: the internal ID its data lives under. */
  branchId: string;
  /** The demo academy is shown (docs/DECISIONS.md §22): made-up people, no email or phone notification. */
  isDemo: boolean;
  branch: Branch & { id: string };
  /** The academy's name as Settings → Academy has it. */
  name: string;
  settings: BranchSettings;
  /** Core rules the owner sets (pay model, students per coach at once). */
  rules: BusinessRules;
  timezone: string;
  member: Member & { id: string };
  role: Role;
  portal: Portal;
  /** Owners and admins. */
  isAdmin: boolean;
  /** Coaches: what the rules let them see (their own classes, no family contacts). */
  isCoach: boolean;
  /** Owners, admins and coaches: the staff's tabs (parents and students get the family's). */
  isStaff: boolean;
  /** Employees: their staff record. */
  staffId: string | null;
  staff: (Staff & { id: string }) | null;
  /** Student: their own record. Parent: their children. */
  studentId: string | null;
  studentIds: string[];
  actor: Actor;
}

const BranchContext = createContext<BranchState | null>(null);

/** How often the member doc's last sign-in is refreshed, as the website does. */
const RELINK_AFTER_MS = 6 * 60 * 60 * 1000;
/** Opening the academy taking longer than this says so, with a way out (no connection, or a sign-in the server forgot). */
const SLOW_MS = 15_000;

/**
 * The academy as the signed-in person sees it, kept live: its settings and rules, their member doc (keyed by their
 * verified email, as on the website; a paused access closes the app at once) and, for employees, their staff record.
 * Children render only once all of it is known. On the first sign-in the account is linked to the member doc (uid,
 * last sign-in), which the website's Account page shows; the rules let a member change only those fields.
 *
 * Which academy, as the website decides it (docs/DECISIONS.md §22): a member of the academy sees it; a member of the
 * demo academy alone sees the demo. The phone has no switch: someone in both sees the academy here, and picks the demo
 * in the website's account menu.
 */
export function BranchProvider({
  children,
  fallback,
  noAccess,
  paused,
}: {
  children: ReactNode;
  fallback: ReactNode;
  /** No member doc for this email: the academy hasn't added it. */
  noAccess: ReactNode;
  /** The person can't use the app now: their access was paused, or the academy can't be opened. */
  paused: (why: "paused" | "unavailable") => ReactNode;
}) {
  const { user, email } = useAuth();
  // The person's own member docs in the academy and the demo academy (theirs to read, paused too). The academy's decides
  // as soon as it's there (from the phone's copy too, so the app opens offline); the demo's counts only once the server
  // says there's none in the academy, so a moment's error never shows the demo to the academy's own people.
  const realState = useDoc<Member>(email ? `${ROOT.branches}/${ACADEMY_ID}/${COL.members}/${email}` : null);
  const demoState = useDoc<Member>(email ? `${ROOT.branches}/${DEMO_ACADEMY_ID}/${COL.members}/${email}` : null);
  const realKnown = !realState.loading && (!realState.error || refused(realState.error));
  const isDemo = realKnown && showsDemo(realState.data, demoState.data);
  const branchId = isDemo ? DEMO_ACADEMY_ID : ACADEMY_ID;
  const memberState = isDemo ? demoState : realState;
  // Not in the academy: wait for the demo's answer before saying there's no access.
  const deciding = realState.loading || (realKnown && !realState.data && demoState.loading);
  const active = memberState.data?.status === "active";
  // The academy's own document is open to its members only: read once the member doc says so.
  const branchState = useDoc<Branch>(active ? `${ROOT.branches}/${branchId}` : null);
  const staffId = memberState.data?.staffId ?? null;
  const staffState = useDoc<Staff>(active && staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}` : null);

  const member = memberState.data;
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !email || !member || linked.current === `${branchId}/${user.uid}`) return;
    linked.current = `${branchId}/${user.uid}`;
    // One profile per account, as the website keeps it.
    void setDoc(doc(db, ROOT.users, user.uid), { uid: user.uid, email, displayName: user.displayName ?? "", photoURL: user.photoURL ?? null, lastLoginAt: serverTimestamp() }, { merge: true }).catch(() => undefined);
    const lastLogin = (member.lastLoginAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
    if (member.uid === user.uid && Date.now() - lastLogin < RELINK_AFTER_MS) return;
    const patch: Record<string, unknown> = { uid: user.uid, displayName: member.displayName || user.displayName || "", photoURL: user.photoURL ?? null, lastLoginAt: serverTimestamp() };
    if (!member.firstLoginAt) patch.firstLoginAt = serverTimestamp();
    void updateDoc(doc(db, ROOT.branches, branchId, COL.members, email), patch).catch(() => undefined);
  }, [user, email, member, branchId]);

  const value = useMemo<BranchState | null>(() => {
    const branch = branchState.data;
    if (!branch || !member || !user || !email || member.status !== "active") return null;
    const role = member.role;
    return {
      branchId,
      isDemo,
      branch,
      name: branch.name || "Sky Arc",
      settings: resolveSettings(branch.settings),
      rules: resolveBusinessRules(branch.businessRules),
      timezone: branch.timezone || "America/New_York",
      member,
      role,
      portal: portalOf(role),
      isAdmin: isAdminRole(role),
      isCoach: role === "coach",
      isStaff: isAdminRole(role) || role === "coach",
      staffId: member.staffId ?? null,
      staff: staffState.data,
      studentId: member.studentId ?? null,
      studentIds: member.studentIds ?? [],
      actor: { uid: user.uid, email, name: member.displayName || user.displayName || email, role },
    };
  }, [branchState.data, member, staffState.data, user, email, branchId, isDemo]);

  // Still opening after a while: say so, with a way to sign out (the screen opens the app by itself if it gets through).
  const opening = deciding || (member?.status === "active" && (!branchState.data || (!!staffId && staffState.loading)) && !branchState.error);
  const [slowFor, setSlowFor] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setSlowFor(email ?? ""), SLOW_MS);
    return () => clearTimeout(t);
  }, [opening, email]);
  const waiting = opening && slowFor === (email ?? "") ? paused("unavailable") : fallback;

  if (deciding) return waiting;
  // The server says there's no member doc for this email in either academy (or the rules refused it): the academy
  // hasn't added it.
  if (!member) {
    const failed = [realState.error, realKnown ? demoState.error : null].some((e) => e && !refused(e));
    return failed ? paused("unavailable") : noAccess;
  }
  if (member.status !== "active") return paused("paused");
  if (branchState.error) return paused("unavailable");
  if (!value || (staffId && staffState.loading)) return waiting;
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

/** The rules refused a read: for a person's own member doc, they aren't signed in with a confirmed email. */
const refused = (e: Error) => /permission-denied/.test(String((e as { code?: string }).code ?? ""));

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}

/** The academy on the signed-in screens, otherwise null (the sign-in screens). */
export function useOptionalBranch(): BranchState | null {
  return useContext(BranchContext);
}
