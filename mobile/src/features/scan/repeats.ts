import { collection, getDocs, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { type ResultPrint, printOf, repeatOf, resultWords } from "@shared/scores/duplicates";
import type { Evaluation } from "@shared/shooting/evaluation";
import { confirmAsync } from "@/components/Confirm";
import { db } from "@/lib/firebase";

/**
 * Before a scanned card or a competition is saved: is it already in the student's scores? (The manager's third
 * meeting, CP2: the same result added twice.) The student's results that day are read and each new one compared, as
 * the website does (shared/src/scores/duplicates.ts); a repeat is asked about, never saved without a word.
 */

async function savedThatDay(branchId: string, studentId: string, dateKey: string): Promise<Evaluation[]> {
  const snap = await getDocs(query(collection(db, ROOT.branches, branchId, COL.evaluations), where("studentId", "==", studentId), where("dateKey", "==", dateKey)));
  return snap.docs.map((d) => d.data() as Evaluation);
}

/**
 * Whether to go on and save: true when none of the results is in the student's scores already, or when the person
 * chose to save it anyway. When the scores can't be read (no connection), the save goes on: the check never blocks.
 */
export async function clearToSave(branchId: string, studentName: string, prints: readonly ResultPrint[]): Promise<boolean> {
  if (!prints.length) return true;
  let saved: Evaluation[];
  try {
    saved = await savedThatDay(branchId, prints[0].studentId, prints[0].dateKey);
  } catch {
    return true;
  }
  const known = saved.map((e) => ({ ...printOf(e), e }));
  const repeats = prints.map((p) => repeatOf(p, known)?.e).filter((e): e is Evaluation => !!e);
  if (!repeats.length) return true;
  const one = repeats.length === 1;
  return confirmAsync({
    title: "Already saved?",
    message: one
      ? `${studentName}’s scores already have ${resultWords(repeats[0])}, with the same scores. Save it again?`
      : `${studentName}’s scores already have results with the same scores: ${repeats.map(resultWords).join("; ")}. Save these again?`,
    confirmLabel: "Save anyway",
    cancelLabel: "Don’t save",
  });
}
