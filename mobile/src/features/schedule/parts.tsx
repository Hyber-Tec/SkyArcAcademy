import { coachColor } from "@shared/colors";
import { seatKind } from "@shared/schedule/classes";
import { KIND_COLORS, type SeatColor, levelColor } from "@shared/schedule/seatColors";
import type { SessionStatus } from "@shared/settings/defaults";
import { Ban, Check, UserX } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { T } from "@/components/Text";
import { type AvailabilityDoc, useStaffList } from "@/features/data/hooks";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useIsDark } from "@/theme";
import { type ClassView, firstName, partOf } from "./classes";
import { shortRange, timeRange } from "./format";

/**
 * The schedule's small parts, as the website draws them (web/src/features/schedule/seatParts.tsx): a student's level in
 * its colour with their rifle code, a seat's label in the sheets' colour, the seats taken, the coaches in, the marks.
 * The colours are the shared ones (`@shared/schedule/seatColors`), in light and dark mode.
 */

export interface Fill {
  bg: string;
  ink: string;
  /** A stronger tone, for thin marks (a seat's edge). */
  dot: string;
}

/** A seat colour in the phone's appearance: the sheets' tint and its ink, or in dark mode the dark wash of it. */
export function useSeatFill(): (c: SeatColor) => Fill {
  const dark = useIsDark();
  return useCallback((c: SeatColor) => (dark ? { bg: c.darkBg, ink: c.darkInk, dot: c.dot } : { bg: c.bg, ink: c.ink, dot: c.dot }), [dark]);
}

/** A level's colour on the academy's own list of levels (Settings). */
export function useLevelFill(): (level: string | null | undefined) => Fill {
  const { settings } = useBranch();
  const fill = useSeatFill();
  const levels = settings.students.levels;
  return useCallback((level: string | null | undefined) => fill(levelColor(level, levels)), [fill, levels]);
}

/** How the schedule names and colours staff (`useStaffLook`). */
export interface StaffLook {
  nameOf: (staffId: string, fallback?: string) => string;
  colorOf: (staffId: string) => string;
}

/**
 * Staff as the schedule names and colours them: the office from the staff list, a coach (who can't read it) from who's
 * in, where each day's record keeps the name; a coach's colour is their own, or one picked from their ID. A screen asks
 * once and hands it to its classes.
 */
export function useStaffLook(): StaffLook {
  const { isAdmin } = useBranch();
  const staff = useStaffList();
  const byId = useMemo(() => new Map(staff.data.map((s) => [s.id, s])), [staff.data]);
  const nameOf = useCallback((id: string, fallback?: string) => byId.get(id)?.name || fallback || (isAdmin ? "Former staff" : "A coach"), [byId, isAdmin]);
  const colorOf = useCallback((id: string) => coachColor(id, byId.get(id)?.color), [byId]);
  return useMemo(() => ({ nameOf, colorOf }), [nameOf, colorOf]);
}

/** The level in its colour, with the rifle code beside it ("Marksman · C7"); "New" before one is set. */
export function LevelChip({ level, rifle }: { level: string | null | undefined; rifle?: string | null }) {
  const fill = useLevelFill()(level);
  return (
    <View style={[styles.chip, { backgroundColor: fill.bg }]}>
      <T variant="tiny" style={[styles.chipText, { color: fill.ink }]} numberOfLines={1}>
        {level || "New"}
        {rifle ? <T variant="tiny" style={{ color: fill.ink, fontWeight: "700" }}>{` · ${rifle}`}</T> : null}
      </T>
    </View>
  );
}

/** A seat's label in the sheets' colour: a make-up red, extra practice light blue, a trial green; nothing for a regular seat. */
export function KindTag({ note }: { note: string | null | undefined }) {
  const fill = useSeatFill();
  const kind = seatKind(note);
  if (kind === "regular") return null;
  const f = fill(KIND_COLORS[kind]);
  return (
    <View style={[styles.chip, { backgroundColor: f.bg }]}>
      <T variant="tiny" style={[styles.chipText, { color: f.ink, fontWeight: "700" }]} numberOfLines={1}>
        {(note ?? "").trim() || KIND_COLORS[kind].name}
      </T>
    </View>
  );
}

/** A note that isn't one of the sheets' labels ("Stayed 15 minutes extra"), as typed; null for a label or nothing. */
export function plainNote(note: string | null | undefined): string | null {
  const n = (note ?? "").trim();
  return n && seatKind(n) === "regular" ? n : null;
}

/** "4/6" with a small bar per seat. */
export function SeatCount({ used, of }: { used: number; of: number }) {
  const colors = useColors();
  return (
    <View style={styles.count} accessible accessibilityLabel={`${used} of ${of} seats taken`}>
      <View style={styles.bars}>
        {Array.from({ length: of }, (_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: colors.foreground, opacity: i < used ? 0.55 : 0.14 }]} />
        ))}
      </View>
      <T variant="tiny" style={[styles.figure, { color: used >= of ? colors.foreground : colors.mutedForeground }]}>
        {used}/{of}
      </T>
    </View>
  );
}

/** "NOW", on the class that's on. */
export function NowPill() {
  const colors = useColors();
  return (
    <View style={[styles.now, { backgroundColor: colors.brandTint }]}>
      <View style={[styles.nowDot, { backgroundColor: colors.brand }]} />
      <T variant="tiny" style={{ color: colors.brandText, fontWeight: "700" }}>
        NOW
      </T>
    </View>
  );
}

/** A seat's mark once it's set: here, a no-show, or canceled (nothing while they're coming). */
export function StatusMark({ status, size = 15 }: { status: SessionStatus; size?: number }) {
  const colors = useColors();
  if (status !== "present" && status !== "no_show" && status !== "canceled") return null;
  const Icon = status === "present" ? Check : status === "no_show" ? UserX : Ban;
  const color = status === "present" ? colors.success : status === "no_show" ? colors.mutedForeground : colors.destructive;
  return (
    <View style={[styles.mark, { width: size, height: size, backgroundColor: colors.card }]} accessibilityLabel={status === "present" ? "Here" : status === "no_show" ? "No-show" : "Canceled"}>
      <Icon size={size - 5} color={color} strokeWidth={3} />
    </View>
  );
}

/**
 * Who teaches a class: each coach in at its time, their initials in their colour and their first name ("You" for the
 * coach looking), with "until 6:00 PM" or "from 5:00 PM" when they're in for only part of it; "No coach in" in amber
 * when nobody is.
 */
export function CoachesIn({ v, look, me, hour12, testID }: { v: ClassView; look: StaffLook; me?: string | null; hour12: boolean; testID?: string }) {
  const colors = useColors();
  const { nameOf, colorOf } = look;
  if (!v.coaches.length) {
    return (
      <T variant="small" style={[styles.none, { color: colors.warning }]} testID={testID}>
        No coach in
      </T>
    );
  }
  return (
    <View style={styles.coaches} testID={testID}>
      {v.coaches.map((k) => {
        const name = nameOf(k.staffId, k.name);
        const mine = k.staffId === me;
        const part = partOf(k, v, hour12);
        return (
          <View key={k.staffId} style={[styles.coach, mine && { backgroundColor: colors.brandTint }]}>
            <Avatar name={name} size={18} color={colorOf(k.staffId)} />
            <T variant="small" style={[styles.personName, mine && { color: colors.brandText }]} numberOfLines={1}>
              {mine ? "You" : firstName(name)}
            </T>
            {part ? (
              <T variant="tiny" style={{ color: colors.warning, fontWeight: "600" }} numberOfLines={1}>
                {part}
              </T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Who's in on a day: everyone with hours that day (the coaches, and the manager, who's in without teaching), earliest
 * first, each with their hours, as the website's schedule lists them. `me` (a coach looking) reads "You".
 */
export function WhosIn({ people, look, me, hour12, testID }: { people: readonly AvailabilityDoc[]; look: StaffLook; me?: string | null; hour12: boolean; testID?: string }) {
  const colors = useColors();
  return (
    <View style={styles.people} testID={testID}>
      {people.map((a) => {
        const name = look.nameOf(a.staffId, a.staffName);
        const mine = a.staffId === me;
        const role = a.staffRole && a.staffRole !== "coach" ? (a.staffRole === "owner" ? "Owner" : "Admin") : null;
        return (
          <View
            key={a.id}
            style={[styles.person, { backgroundColor: mine ? colors.brandTint : colors.card, borderColor: colors.border }]}
            accessible
            accessibilityLabel={`${mine ? "You" : name}${role ? `, ${role}` : ""}, in ${a.ranges.map((r) => timeRange(r.startMin, r.endMin, hour12)).join(" and ")}`}
          >
            <Avatar name={name} size={18} color={look.colorOf(a.staffId)} />
            <T variant="small" style={[styles.personName, mine && { color: colors.brandText }]} numberOfLines={1}>
              {mine ? "You" : firstName(name)}
            </T>
            <T variant="tiny" tone="muted" style={styles.hours} numberOfLines={1}>
              {[role, a.ranges.map((r) => shortRange(r.startMin, r.endMin, hour12)).join(", ")].filter(Boolean).join(" · ")}
            </T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  people: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  person: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 3, paddingRight: 9, paddingVertical: 3, maxWidth: "100%" },
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, maxWidth: "100%" },
  chipText: { fontWeight: "600" },
  count: { flexDirection: "row", alignItems: "center", gap: 6 },
  bars: { flexDirection: "row", gap: 1.5 },
  bar: { width: 5, height: 10, borderRadius: 1.5 },
  figure: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  hours: { flexShrink: 1, fontVariant: ["tabular-nums"] },
  now: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  nowDot: { width: 6, height: 6, borderRadius: radius.full },
  mark: { borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  coaches: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.xs, rowGap: 4 },
  coach: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, paddingLeft: 2, paddingRight: 8, paddingVertical: 2, maxWidth: "100%" },
  personName: { fontWeight: "500", flexShrink: 1 },
  none: { fontWeight: "600" },
});
