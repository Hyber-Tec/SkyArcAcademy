import { router } from "expo-router";
import { CalendarClock, ChevronRight, CircleCheck, type LucideIcon, Megaphone } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SectionTitle } from "@/components/SectionTitle";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { postedDay } from "@/features/announcements/format";
import { useAcademyNow } from "@/features/data/hooks";
import { longDay, plural, timeRange } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { useCoachToDo } from "./useCoachToDo";

/** Lines shown in a group before "Show N more" (as the website). */
const SHOWN = 3;

interface Item {
  key: string;
  title: string;
  detail: string;
  onPress: () => void;
  testID: string;
}

/**
 * A coach's to-do on Home, as the website's coach Home has it: the open days in their notice still to answer on the
 * Availability tab, and the posts they haven't read. Each line opens the place to do it: that day of their
 * availability, the post. When there's nothing, it says they're all caught up.
 */
export function ToDoCard() {
  const { settings, timezone, name } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const t = useCoachToDo();
  const hour12 = settings.general.timeFormat !== "24h";
  const { gaps, unread, total } = t;
  const lead = settings.availability.leadTimeDays;
  const lock = settings.availability.lockWindowDays;

  return (
    <View style={styles.section} testID="today-todo">
      <SectionTitle title="To do" detail={total ? String(total) : undefined} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {t.loading ? (
          <View style={styles.head} testID="today-todo-loading">
            <Skeleton width={32} height={32} rounded={radius.sm} />
            <View style={styles.grow}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="85%" height={12} />
            </View>
          </View>
        ) : total === 0 ? (
          <View style={styles.head} testID="today-todo-done">
            <CircleCheck size={22} color={colors.success} />
            <View style={styles.grow}>
              <T variant="label">You’re all caught up</T>
              <T variant="small" tone="muted">
                {settings.availability.leadTimeEnforcement === "off" ? "You’ve read every post." : "Your availability is set and you’ve read every post."}
              </T>
            </View>
          </View>
        ) : (
          <>
            {gaps.length ? (
              <Group
                icon={CalendarClock}
                tint={colors.warningTint}
                color={colors.warning}
                title={`Set your availability for ${plural(gaps.length, "day")}`}
                subtitle={`Give your times, or mark the day not available. Open days inside your ${lead}-day notice; each locks ${lock} days ahead.`}
                items={gaps.map((d) => {
                  const h = t.hoursOf(d);
                  return {
                    key: d,
                    title: longDay(d),
                    detail: h.isOpen ? `Open ${timeRange(h.openMin, h.closeMin, hour12)}` : "Open",
                    // That day's availability, in a sheet over Home.
                    onPress: () => router.push({ pathname: "/availability-day", params: { date: d } }),
                    testID: `today-todo-day-${d}`,
                  };
                })}
                more={{ label: "Open Availability", onPress: () => router.navigate("/availability"), testID: "today-todo-availability-all" }}
                testID="today-todo-availability"
              />
            ) : null}
            {unread.length ? (
              <Group
                divider={gaps.length > 0}
                icon={Megaphone}
                tint={colors.infoTint}
                color={colors.info}
                title={plural(unread.length, "unread announcement")}
                items={unread.map((a) => ({
                  key: a.id,
                  title: a.title,
                  detail: `${a.authorName?.trim() || name} · ${postedDay(a, timezone, today)}${a.pinned ? " · Pinned" : ""}`,
                  onPress: () => router.push({ pathname: "/news/[id]", params: { id: a.id } }),
                  testID: `today-todo-post-${a.id}`,
                }))}
                more={{ label: "All news", onPress: () => router.push("/news"), testID: "today-todo-news-all" }}
                testID="today-todo-news"
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

/** One kind of thing to do: its picture and title (and a line on what to do), then a line for each, a few at first. */
function Group({
  icon: Icon,
  tint,
  color,
  title,
  subtitle,
  items,
  more,
  divider = false,
  testID,
}: {
  icon: LucideIcon;
  tint: string;
  color: string;
  title: string;
  subtitle?: string;
  items: Item[];
  /** A link to where all of them are. */
  more?: { label: string; onPress: () => void; testID: string };
  divider?: boolean;
  testID: string;
}) {
  const colors = useColors();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  const hidden = items.length - shown.length;
  return (
    <View style={divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: tint }]}>
          <Icon size={17} color={color} />
        </View>
        <View style={styles.grow}>
          <T variant="label" accessibilityRole="header">
            {title}
          </T>
          {subtitle ? (
            <T variant="small" tone="muted">
              {subtitle}
            </T>
          ) : null}
        </View>
      </View>
      {shown.map((i) => (
        <Pressable
          key={i.key}
          onPress={i.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${i.title}, ${i.detail}`}
          style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.accent }]}
          testID={i.testID}
        >
          <View style={styles.grow}>
            <T numberOfLines={1}>{i.title}</T>
            <T variant="small" tone="muted" numberOfLines={2}>
              {i.detail}
            </T>
          </View>
          <ChevronRight size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
      {hidden > 0 || more ? (
        <View style={styles.links}>
          {hidden > 0 ? (
            <Pressable onPress={() => setAll(true)} hitSlop={8} accessibilityRole="button" testID={`${testID}-more`}>
              {({ pressed }) => (
                <T variant="small" tone="muted" style={[styles.link, pressed && styles.pressed]}>
                  {`Show ${hidden} more`}
                </T>
              )}
            </Pressable>
          ) : null}
          {more ? (
            <Pressable onPress={more.onPress} hitSlop={8} accessibilityRole="button" testID={more.testID}>
              {({ pressed }) => (
                <T variant="small" tone="muted" style={[styles.link, pressed && styles.pressed]}>
                  {`${more.label} →`}
                </T>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Lines start under the group's title, past its picture. */
const INDENT = space.lg + 32 + space.md;

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  icon: { width: 32, height: 32, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: INDENT, paddingRight: space.lg, paddingVertical: space.sm, minHeight: 48 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs, paddingLeft: INDENT, paddingRight: space.lg, paddingTop: space.xs, paddingBottom: space.md },
  link: { fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
