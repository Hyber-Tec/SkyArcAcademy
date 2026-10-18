import AsyncStorage from "@react-native-async-storage/async-storage";
import { type DocumentData, type Query, collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "@react-native-firebase/firestore";
import { COL, DOC, ROOT } from "@shared/paths";
import type { ProgressReportDoc } from "@shared/reports/types";
import { type Evaluation, inOrder } from "@shared/shooting/evaluation";
import type { DateKey } from "@shared/time";
import type { BranchContact, BranchPublicProfile, Session, Student } from "@shared/types";
import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import type { EvaluationDoc, SessionDoc, StudentDoc } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { MAX_RETRIES, type QueryState, isRetryable, refreshTokenOnce, useDoc } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * What a family reads, as the website's family pages read it (web/src/features/family/data.ts): their linked students'
 * records, those students' classes, scores and shared progress reports, one query per student as the rules require (a
 * query the rules would refuse fails whole), and a score's own file by its ID; never the staff's records or the Drive's
 * lists. Everything is live.
 */

export type ReportDoc = ProgressReportDoc & { id: string };

const col = (branchId: string, name: string) => collection(db, ROOT.branches, branchId, name);

type Source = { kind: "query"; ref: Query<DocumentData> } | { kind: "doc"; path: string };

/**
 * Several live queries or documents as one list (de-duplicated by ID), with useQuery's cache and retry behaviour
 * (src/lib/firestore.ts): an empty answer from the phone's copy waits for the server, and a refused one refreshes the
 * sign-in token and listens again a few times. `key` names the sources (at least one); a null key pauses them.
 * `keep`: when the key changes (a longer stretch of time), the list stays as it was until every source has answered.
 */
function useMerged<T>(key: string | null, build: () => Source[], keep = false): QueryState<T & { id: string }> {
  type D = T & { id: string };
  const [state, setState] = useState<QueryState<D> & { key: string | null }>({ key, data: [], loading: !!key, error: null });
  const [attempt, setAttempt] = useState(0);
  if (state.key !== key) {
    setState({ key, data: keep && key ? state.data : [], loading: !!key, error: null });
    setAttempt(0);
  }
  const makeSources = useEffectEvent(build);
  useEffect(() => {
    if (!key) return;
    const sources = makeSources();
    const parts = new Map<number, D[]>();
    let failed: Error | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const emit = () => {
      // Kept data is replaced only once all of the new sources have answered.
      if (keep && parts.size < sources.length) return;
      const byId = new Map<string, D>();
      for (const list of parts.values()) for (const d of list) byId.set(d.id, d);
      setState({ key, data: [...byId.values()], loading: parts.size < sources.length, error: failed });
    };
    const onError = (i: number) => (error: Error) => {
      failed = error;
      parts.set(i, []);
      emit();
      if (isRetryable(error) && attempt < MAX_RETRIES && !timer) {
        refreshTokenOnce();
        timer = setTimeout(() => setAttempt((a) => a + 1), 2000 * (attempt + 1));
      }
    };
    const unsubs = sources.map((src, i) =>
      src.kind === "query"
        ? onSnapshot(
            src.ref,
            { includeMetadataChanges: true },
            (snap) => {
              if (snap.metadata.fromCache && snap.empty) return;
              parts.set(
                i,
                snap.docs.map((d) => ({ id: d.id, ...d.data() }) as D),
              );
              emit();
            },
            onError(i),
          )
        : onSnapshot(
            doc(db, src.path),
            { includeMetadataChanges: true },
            (snap) => {
              if (snap.metadata.fromCache && !snap.exists()) return;
              parts.set(i, snap.exists() ? [{ id: snap.id, ...snap.data() } as D] : []);
              emit();
            },
            onError(i),
          ),
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [key, attempt, keep]);
  return { data: state.data, loading: state.loading, error: state.error };
}

/** Ids in one order whatever order they come in, so the listeners keyed on them don't start again. */
const stable = (ids: readonly string[]) => [...new Set(ids)].sort();

/** The students this person may see: a parent's children, or the student themself (as the academy linked them). */
export function useLinkedIds(): string[] {
  const { role, studentId, studentIds } = useBranch();
  const key = role === "student" ? (studentId ?? "") : studentIds.join(",");
  return useMemo(() => (key ? [...new Set(key.split(","))] : []), [key]);
}

/** The linked students' records, live (one listener each: the rules let a family read only its own). */
export function useLinkedStudents(ids: readonly string[]) {
  const { branchId } = useBranch();
  const list = stable(ids);
  return useMerged<Student>(list.length ? `family-students-${branchId}-${list.join(",")}` : null, () =>
    list.map((id) => ({ kind: "doc", path: `${ROOT.branches}/${branchId}/${COL.students}/${id}` })),
  );
}

/**
 * The classes of the given students between two dates (inclusive), deleted ones left out, in time order. `keep`: a
 * list whose dates grow ("Show more") keeps what it shows until the longer stretch is in.
 */
export function useFamilySessions(ids: readonly string[], from: DateKey, to: DateKey, keep = false) {
  const { branchId } = useBranch();
  const list = stable(ids);
  const state = useMerged<Session>(
    list.length ? `family-sessions-${branchId}-${list.join(",")}-${from}-${to}` : null,
    () => list.map((id) => ({ kind: "query", ref: query(col(branchId, COL.sessions), where("studentId", "==", id), where("dateKey", ">=", from), where("dateKey", "<=", to)) })),
    keep,
  );
  const data = useMemo<SessionDoc[]>(
    () =>
      state.data
        .filter((s) => !s.isDeleted)
        // Brothers and sisters in the same class, A to Z.
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName)),
    [state.data],
  );
  return { ...state, data };
}

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;

/** The given students' shared progress reports, newest first (by the end of their period, then when they were made). */
export function useFamilyReports(ids: readonly string[]) {
  const { branchId } = useBranch();
  const list = stable(ids);
  const state = useMerged<ProgressReportDoc>(list.length ? `family-reports-${branchId}-${list.join(",")}` : null, () =>
    list.map((id) => ({ kind: "query", ref: query(col(branchId, COL.progressReports), where("studentId", "==", id), where("sharedWithParents", "==", true)) })),
  );
  const data = useMemo<ReportDoc[]>(() => [...state.data].sort((a, b) => b.endDate.localeCompare(a.endDate) || millis(b.generatedAt) - millis(a.generatedAt) || a.id.localeCompare(b.id)), [state.data]);
  return { ...state, data };
}

/**
 * The given students' scores (SIUS results and paper cards), newest first: every one, as the staff see them (the rules
 * give a family its own children's, one student at a time).
 */
export function useFamilyEvaluations(ids: readonly string[]) {
  const { branchId } = useBranch();
  const list = stable(ids);
  const state = useMerged<Evaluation>(list.length ? `family-evaluations-${branchId}-${list.join(",")}` : null, () =>
    list.map((id) => ({ kind: "query", ref: query(col(branchId, COL.evaluations), where("studentId", "==", id)) })),
  );
  // The reverse of the charts' order (shared/src/shooting/evaluation.ts), so ties read the same way everywhere.
  const data = useMemo<EvaluationDoc[]>(() => inOrder(state.data).reverse(), [state.data]);
  return { ...state, data };
}

/** One progress report (the rules give a family only its own children's shared ones). */
export function useReport(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<ProgressReportDoc>(id ? `${ROOT.branches}/${branchId}/${COL.progressReports}/${id}` : null);
}

/** One class of one student (a session), for its sheet. */
export function useFamilySession(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Session>(id ? `${ROOT.branches}/${branchId}/${COL.sessions}/${id}` : null);
}

const hasContact = (c: BranchContact | null | undefined): c is BranchContact => !!c && !!(c.phone?.trim() || c.email?.trim() || c.address?.trim() || c.website?.trim());

/**
 * How to reach the academy: its contact details from Settings → Academy (the academy's document), or its public
 * profile's copy; null when none are set.
 */
export function useAcademyContact(): BranchContact | null {
  const { branch, branchId } = useBranch();
  const profile = useDoc<BranchPublicProfile>(hasContact(branch.contact) ? null : `${ROOT.branches}/${branchId}/${COL.public}/${DOC.publicProfile}`);
  if (hasContact(branch.contact)) return branch.contact;
  return hasContact(profile.data?.contact) ? profile.data.contact : null;
}

// ---------------------------------------------------------------- reports opened

/**
 * The reports this person opened on this phone, so "New" goes at once (their "report ready" notice, read as they open
 * it, follows) and the opening is recorded only once. Kept on the phone.
 */
let opened: { email: string; ids: Set<string> } | null = null;
const listeners = new Set<() => void>();
let version = 0;
const openedKey = (email: string) => `skyarc.reports-opened.${email}`;

function changed() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function openedBy(email: string): Set<string> {
  if (opened?.email === email) return opened.ids;
  const mine = { email, ids: new Set<string>() };
  opened = mine;
  void AsyncStorage.getItem(openedKey(email))
    .then((v) => {
      const ids = JSON.parse(v ?? "[]") as unknown;
      if (Array.isArray(ids)) ids.forEach((id) => typeof id === "string" && mine.ids.add(id));
      changed();
    })
    .catch(() => undefined);
  return mine.ids;
}

type ReportNotice = { type: string; refs?: { reportId?: string } | null; readAt?: unknown };

/**
 * Whether a report is new to this person, as on the website (web/src/features/family/data.ts): each family member gets
 * their own "report ready" notice when it's shared, read once they open the report here or on the website, so a parent
 * opening it doesn't clear it for the student. A report without one (shared before their account existed, say) is new
 * until anyone in the family opens it (`firstViewedAt`) or they open it on this phone.
 */
export function useIsNew(): (r: Pick<ReportDoc, "id" | "firstViewedAt">) => boolean {
  const { branchId, actor } = useBranch();
  useSyncExternalStore(subscribe, () => version);
  const ids = useMemo(() => openedBy(actor.email), [actor.email]);
  const notices = useMerged<ReportNotice>(`report-notices-${branchId}-${actor.email}`, () => [
    { kind: "query", ref: query(col(branchId, COL.notifications), where("recipientKey", "==", actor.email), where("type", "==", "report_shared")) },
  ]);
  const unread = useMemo(() => {
    const told = new Map<string, boolean>();
    for (const n of notices.data) {
      const id = n.refs?.reportId;
      if (id) told.set(id, (told.get(id) ?? false) || !n.readAt);
    }
    return told;
  }, [notices.data]);
  return (r) => !ids.has(r.id) && (unread.get(r.id) ?? !r.firstViewedAt);
}

/**
 * A family member's opening of a shared report, as the website records it: their own "report ready" notices for it are
 * read (it stops being "New" for them), and the opening is recorded once (`progressReports/{id}/views/{email}`; the
 * rules refuse a second), so the academy sees "Viewed".
 */
export async function recordReportView(branchId: string, reportId: string, email: string, role: string): Promise<void> {
  void getDocs(query(col(branchId, COL.notifications), where("recipientKey", "==", email), where("refs.reportId", "==", reportId)))
    .then((snap) => Promise.all(snap.docs.filter((d) => !d.data().readAt).map((d) => updateDoc(d.ref, { readAt: serverTimestamp() }))))
    .catch(() => undefined);
  const ids = openedBy(email);
  if (ids.has(reportId)) return;
  ids.add(reportId);
  changed();
  await setDoc(doc(db, ROOT.branches, branchId, COL.progressReports, reportId, "views", email), { viewedAt: serverTimestamp(), role }).catch(() => undefined);
  await AsyncStorage.setItem(openedKey(email), JSON.stringify([...ids])).catch(() => undefined);
}

export type { EvaluationDoc, SessionDoc, StudentDoc };
