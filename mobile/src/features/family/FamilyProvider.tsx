import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useBranch } from "@/state/BranchProvider";
import { type StudentDoc, useLinkedIds, useLinkedStudents } from "./data";

export type FamilyChoice = "all" | string;

export interface FamilyState {
  /** A parent (their children) or a student (themself). */
  who: "parent" | "student";
  /** The linked students, A to Z by first name once their records are in (the order the academy linked them before). */
  ids: string[];
  students: Map<string, StudentDoc>;
  loading: boolean;
  /** A parent with more than one child: the switcher shows (All, then each child). */
  several: boolean;
  /** "all", or the child the parent chose (the same on every tab). */
  child: FamilyChoice;
  setChild: (child: FamilyChoice) => void;
  /** The students the screens show: every linked one, or the chosen child. */
  shown: string[];
  /** A student's first name ("Jiwoo"), from their record or the class's copy of their name. */
  firstName: (id: string, fallback?: string) => string;
}

const FamilyContext = createContext<FamilyState | null>(null);

/**
 * The family's part of the app: whose classes and reports it shows (a parent's children, or the student themself), and
 * which child a parent chose, kept as they move between the tabs.
 */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { role } = useBranch();
  const linked = useLinkedIds();
  const records = useLinkedStudents(linked);
  const [choice, setChoice] = useState<FamilyChoice>("all");

  const value = useMemo<FamilyState>(() => {
    const students = new Map(records.data.map((s) => [s.id, s]));
    const firstName = (id: string, fallback?: string) => {
      const s = students.get(id);
      return (s?.firstName || s?.name.split(/\s+/)[0] || fallback?.split(/\s+/)[0] || "").trim() || "Your child";
    };
    const ids = [...linked].sort((a, b) => firstName(a).localeCompare(firstName(b)));
    const several = role === "parent" && ids.length > 1;
    // A child no longer linked (or a choice made for another account) shows everyone again.
    const child = several && ids.includes(choice) ? choice : "all";
    return {
      who: role === "student" ? "student" : "parent",
      ids,
      students,
      loading: records.loading,
      several,
      child,
      setChild: setChoice,
      shown: child === "all" ? ids : [child],
      firstName,
    };
  }, [records.data, records.loading, linked, role, choice]);

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily(): FamilyState {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily outside FamilyProvider");
  return ctx;
}

/** The child switcher's choices: All, then each child by first name. */
export function useChildChoices(): { value: FamilyChoice; label: string; testID: string }[] {
  const { ids, firstName } = useFamily();
  return useMemo(() => [{ value: "all", label: "All", testID: "family-child-all" }, ...ids.map((id) => ({ value: id, label: firstName(id), testID: `family-child-${id}` }))], [ids, firstName]);
}
