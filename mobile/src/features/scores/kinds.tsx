import { type Evaluation, RESULT_KINDS, RESULT_KIND_LABELS, type ResultKind, kindOf } from "@shared/shooting/evaluation";
import { useMemo } from "react";
import { Badge } from "@/components/Badge";
import { FilterChips } from "@/components/FilterChips";
import { useIsDark } from "@/theme";

/**
 * Practice, Competition or Evaluation on every result (the manager's second meeting, docs/DECISIONS.md §23), as the
 * website shows them (web/src/features/scores/kinds.tsx): a chip on a competition's or an evaluation's row (practice,
 * the usual, has none), and a filter over a list of results.
 */

const CHIP: Record<Exclude<ResultKind, "practice">, { light: { bg: string; fg: string }; dark: { bg: string; fg: string } }> = {
  competition: { light: { bg: "#ede9fe", fg: "#4c1d95" }, dark: { bg: "#2e1065", fg: "#ddd6fe" } },
  evaluation: { light: { bg: "#fef3c7", fg: "#78350f" }, dark: { bg: "#451a03", fg: "#fde68a" } },
};

/** A competition's or an evaluation's chip; practice has none. */
export function ResultKindChip({ e }: { e: Pick<Evaluation, "kind"> }) {
  const dark = useIsDark();
  const kind = kindOf(e);
  if (kind === "practice") return null;
  const tone = CHIP[kind][dark ? "dark" : "light"];
  return (
    <Badge bg={tone.bg} fg={tone.fg}>
      {RESULT_KIND_LABELS[kind]}
    </Badge>
  );
}

/**
 * A filter over results: All, then each kind there is with its count ("Competitions 3"); nothing when the list holds
 * only one kind.
 */
export function ResultKindFilter({
  list,
  value,
  onChange,
  testID = "kind-filter",
}: {
  list: readonly Pick<Evaluation, "kind">[];
  value: ResultKind | "all";
  onChange: (k: ResultKind | "all") => void;
  testID?: string;
}) {
  const options = useMemo(() => {
    const counts = new Map<ResultKind, number>();
    for (const e of list) counts.set(kindOf(e), (counts.get(kindOf(e)) ?? 0) + 1);
    if (counts.size < 2) return null;
    return [
      { value: "all" as const, label: "All", count: list.length, testID: `${testID}-all` },
      ...RESULT_KINDS.filter((k) => counts.has(k)).map((k) => ({ value: k, label: `${RESULT_KIND_LABELS[k]}${k === "practice" ? "" : "s"}`, count: counts.get(k), testID: `${testID}-${k}` })),
    ];
  }, [list, testID]);
  if (!options) return null;
  return <FilterChips<ResultKind | "all"> value={value} onChange={onChange} options={options} testID={testID} />;
}
