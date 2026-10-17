import type { EvaluationPoint } from "@shared/reports/types";
import { type Evaluation, pointOf } from "@shared/shooting/evaluation";
import { replayShots } from "@shared/shooting/replay";
import type { ShotPoint } from "@shared/shooting/target";
import { monthDay } from "@/features/schedule/format";

/**
 * What the shot replay plays (ShotReplay.tsx): one result's shots in the order they were fired
 * (shared/src/shooting/replay.ts), or a report's results one after another, as the website's replay does
 * (web/src/features/scores/playback.ts).
 */
export interface PlayShot {
  /** 1, 2, 3… in the order it plays. */
  n: number;
  /** Its number on its own result, drawn beside it on the target. */
  number: number;
  value: number;
  point: ShotPoint | null;
  /** How many shots its result has ("Shot 7 of 20"). */
  of: number;
  /** What it belongs to: "Series 2" (SIUS), or its result's date when several results play together. */
  context: string | null;
  /** The total so far on its result, this shot included; null when several results play together. */
  running: number | null;
  /** A SIUS score, with its decimal. */
  decimal: boolean;
}

/** One result's shots (SIUS series by series, a paper card bull by bull), with the running total. */
export function evaluationShots(e: Pick<Evaluation, "source" | "series">): PlayShot[] {
  const decimal = e.source === "sius";
  const shots = replayShots(e);
  return shots.map((s) => ({
    n: s.n,
    number: s.n,
    value: s.value,
    point: s.point,
    of: shots.length,
    context: s.series !== null ? `Series ${s.series}` : null,
    running: s.running,
    decimal,
  }));
}

/**
 * A report's results (oldest first), each one's shots in the order they were fired. One result plays as itself (a
 * report keeps no series, so none are named); several play one after another under their dates.
 */
export function playPoints(points: readonly EvaluationPoint[]): PlayShot[] {
  const several = points.length > 1;
  const out: PlayShot[] = [];
  for (const p of points) {
    const decimal = p.source === "sius";
    let running = 0;
    p.marks.forEach((m, i) => {
      running = Math.round((running + m.v) * 10) / 10;
      out.push({
        n: out.length + 1,
        number: i + 1,
        value: m.v,
        point: pointOf(m),
        of: p.marks.length,
        context: several ? monthDay(p.dateKey) : null,
        running: several ? null : running,
        decimal,
      });
    });
  }
  return out;
}

/** A report result with shots that have a place on the target (SIUS, or a card scanned with the app). */
export const hasPlacedShots = (p: Pick<EvaluationPoint, "marks">) => p.marks.some((m) => pointOf(m) !== null);
