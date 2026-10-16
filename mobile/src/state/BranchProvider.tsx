import { doc, serverTimestamp, setDoc, updateDoc } from "@react-native-firebase/firestore";
import { ACADEMY_ID } from "@shared/academy";
import { COL, ROOT } from "@shared/paths";
import { type Portal, type Role, isAdminRole, portalOf } from "@shared/roles";
import { type BusinessRules, resolveBusinessRules } from "@shared/settings/businessRules";
import type { BranchSettings } from "@shared/settings/defaults";
import { resolveSettings } from "@shared/settings/resolve";
import type { Branch, Member, Staff } from "@shared/types";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
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
  /** Always the academy (`ACADEMY_ID`): the internal ID its data lives under. */
  branchId: string;
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
  /** Owners and admins: the app's office portal. */
  isAdmin: boolean;
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

/**
 * The academy as the signed-in person sees it, kept live: its settings and rules, their member doc (keyed by their
 * verified email, as on the website; a paused access closes the app at once) and, for employees, their staff record.
 * Children render only once all of it is known. On the first sign-in the account is linked to the member doc (uid,
 * last sign-in), which the website's Account page shows; the rules let a member change only those fields.
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
  const branchId = ACADEMY_ID;
  const memberState = useDoc<Member>(email ? `${ROOT.branches}/${branchId}/${COL.members}/${email}` : null);
  const active = memberState.data?.status === "active";
  // The academy's own document is open to its members only: read once the member doc says so.
  const branchState = useDoc<Branch>(active ? `${ROOT.branches}/${branchId}` : null);
  const staffId = memberState.data?.staffId ?? null;
  const staffState = useDoc<Staff>(active && staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}` : null);

  const member = memberState.data;
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !email || !member || linked.current === user.uid) return;
    linked.current = user.uid;
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
      branch,
      name: branch.name || "Sky Arc",
      settings: resolveSettings(branch.settings),
      rules: resolveBusinessRules(branch.businessRules),
      timezone: branch.timezone || "America/New_York",
      member,
      role,
      portal: portalOf(role),
      isAdmin: isAdminRole(role),
      staffId: member.staffId ?? null,
      staff: staffState.data,
      studentId: member.studentId ?? null,
      studentIds: member.studentIds ?? [],
      actor: { uid: user.uid, email, name: member.displayName || user.displayName || email, role },
    };
  }, [branchState.data, member, staffState.data, user, email, branchId]);

  if (memberState.loading) return fallback;
  // The server says there's no member doc for this email (or the rules refused it): the academy hasn't added it.
  if (!member) return memberState.error && !/permission-denied/.test(String((memberState.error as { code?: string }).code ?? "")) ? paused("unavailable") : noAccess;
  if (member.status !== "active") return paused("paused");
  if (branchState.error) return paused("unavailable");
  if (!value || (staffId && staffState.loading)) return fallback;
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}
