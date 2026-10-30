import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Role } from "@shared/roles";

/**
 * "View the app as" (the owner, 2026-10-29, as the website has it): a super admin sees the app as one of the academy's
 * people, or the demo academy, without signing out. It only changes what is shown: their access to the data, and the
 * name the audit log records, stay their own (the website's View as works the same: web/src/branch/BranchProvider.tsx).
 */
export type ViewAsPerson =
  | { role: "owner" | "admin"; email: string; name: string }
  | { role: "coach"; email: string; name: string; staffId: string }
  | { role: "parent"; email: string; name: string; studentIds: string[] }
  | { role: "student"; email: string; name: string; studentId: string };

export interface ViewAs {
  /** The demo academy instead of the academy (for someone who is a member of both). */
  demo: boolean;
  /** Who the app is shown as; null: themself. */
  person: ViewAsPerson | null;
}

/** The super admins (the owner's rule, 2026-10-29): top-level, one document per lower-cased email. */
export const SUPER_ADMINS = "superAdmins";

const key = (email: string) => `skyarc.viewAs.${email}`;

/** The choice is remembered on this phone for this account, so the app opens as it was left. */
export async function loadViewAs(email: string): Promise<ViewAs | null> {
  try {
    const raw = await AsyncStorage.getItem(key(email));
    const v = raw ? (JSON.parse(raw) as ViewAs) : null;
    return v && typeof v.demo === "boolean" ? v : null;
  } catch {
    return null;
  }
}

export function saveViewAs(email: string, v: ViewAs | null): void {
  void (v ? AsyncStorage.setItem(key(email), JSON.stringify(v)) : AsyncStorage.removeItem(key(email))).catch(() => undefined);
}

export const VIEW_AS_ROLE_LABELS: Record<ViewAsPerson["role"], string> = { owner: "Owner", admin: "Admin", coach: "Coach", parent: "Parent", student: "Student" };

export const isViewAsRole = (r: Role): r is ViewAsPerson["role"] => ["owner", "admin", "coach", "parent", "student"].includes(r);
