import { collection, query, where } from "@react-native-firebase/firestore";
import { ACADEMY_ID, DEMO_ACADEMY_ID } from "@shared/academy";
import { COL, ROOT } from "@shared/paths";
import { ROLE_LABELS } from "@shared/roles";
import type { Member } from "@shared/types";
import { router } from "expo-router";
import { Check, Eye } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection } from "@/components/List";
import { SearchField } from "@/components/SearchField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";
import { type ViewAs, type ViewAsPerson, isViewAsRole } from "@/state/viewAs";
import { space, useColors } from "@/theme";

type MemberDoc = Member & { id: string };

/** The groups, in the order the office thinks of them. */
const GROUPS: { title: string; roles: ViewAsPerson["role"][] }[] = [
  { title: "Owners and admins", roles: ["owner", "admin"] },
  { title: "Coaches", roles: ["coach"] },
  { title: "Parents", roles: ["parent"] },
  { title: "Students", roles: ["student"] },
];

/** A member as the person the app is shown as. */
function personOf(m: MemberDoc): ViewAsPerson | null {
  const name = m.displayName?.trim() || m.email;
  if (!isViewAsRole(m.role)) return null;
  if (m.role === "coach") return m.staffId ? { role: "coach", email: m.email, name, staffId: m.staffId } : null;
  if (m.role === "parent") return { role: "parent", email: m.email, name, studentIds: m.studentIds ?? [] };
  if (m.role === "student") return m.studentId ? { role: "student", email: m.email, name, studentId: m.studentId } : null;
  return { role: m.role, email: m.email, name };
}

/**
 * "View the app as" (the owner, 2026-10-29, as the website's account menu has it), for super admins only: pick the
 * academy (or the demo one) and anyone in it, and the app shows their tabs and what they see, until "Yourself". Only what
 * is shown changes: the data stays reached with the super admin's own access, and what they change is recorded as theirs.
 */
export default function ViewAsScreen() {
  const { canViewAs, viewAs, setViewAs, canSwitchDemo, isDemo, member } = useBranch();
  const colors = useColors();
  const [demo, setDemo] = useState(isDemo);
  const [q, setQ] = useState("");
  const academy = demo ? DEMO_ACADEMY_ID : ACADEMY_ID;
  const members = useQuery<Member>(canViewAs ? `view-as-${academy}` : null, () => query(collection(db, ROOT.branches, academy, COL.members), where("status", "==", "active")));

  const groups = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = members.data.filter((m) => m.email !== member.email && words.every((w) => `${m.displayName ?? ""} ${m.email}`.toLowerCase().includes(w)));
    return GROUPS.map((g) => ({
      ...g,
      people: found
        .filter((m) => (g.roles as string[]).includes(m.role))
        .map((m) => ({ m, person: personOf(m) }))
        .filter((x): x is { m: MemberDoc; person: ViewAsPerson } => !!x.person)
        .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    })).filter((g) => g.people.length);
  }, [members.data, member.email, q]);

  const choose = (next: ViewAs | null) => {
    router.back();
    // Once the sheet is away: the app then shows the other part (the staff's tabs or the family's) at once.
    setTimeout(() => setViewAs(next), 60);
  };
  const current = viewAs?.person?.email ?? null;

  if (!canViewAs) {
    return (
      <View style={[styles.page, { backgroundColor: colors.grouped }]}>
        <EmptyState icon={<Eye size={26} color={colors.mutedForeground} />} title="Only for super admins" text="Viewing the app as someone else is for the app's super admins." />
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" testID="view-as">
      <T tone="muted">See the app as one of the academy’s people sees it. Your own access stays: what you change is really changed, and recorded as yours.</T>
      {canSwitchDemo ? (
        <SegmentedControl
          value={demo ? "demo" : "real"}
          onChange={(v) => setDemo(v === "demo")}
          options={[
            { value: "real", label: "Sky Arc" },
            { value: "demo", label: "Demo" },
          ]}
          testID="view-as-academy"
        />
      ) : null}
      <ListSection>
        <ListRow
          icon={<Avatar name={member.displayName || member.email} url={member.photoURL} size={36} />}
          title="Yourself"
          subtitle={`${ROLE_LABELS[member.role]}${demo ? " · the demo academy" : ""}`}
          right={!current && demo === isDemo ? <Check size={18} color={colors.foreground} /> : undefined}
          chevron={false}
          onPress={() => choose(demo === (canSwitchDemo ? false : isDemo) ? null : { demo, person: null })}
          testID="view-as-self"
        />
      </ListSection>
      <SearchField value={q} onChangeText={setQ} placeholder="Search by name or email" testID="view-as-search" />
      {members.loading ? (
        <SkeletonCards count={4} height={56} />
      ) : groups.length ? (
        groups.map((g) => (
          <ListSection key={g.title} title={g.title} detail={String(g.people.length)}>
            {g.people.map(({ m, person }) => (
              <ListRow
                key={m.id}
                icon={<Avatar name={person.name} url={m.photoURL} size={36} />}
                title={person.name}
                subtitle={person.role === "parent" ? `${m.email} · ${person.studentIds.length === 1 ? "1 child" : `${person.studentIds.length} children`}` : m.email}
                right={current === m.email && demo === isDemo ? <Check size={18} color={colors.foreground} /> : undefined}
                chevron={false}
                onPress={() => choose({ demo, person })}
                testID={`view-as-${m.id}`}
              />
            ))}
          </ListSection>
        ))
      ) : (
        <T tone="muted" style={styles.none}>
          {q ? "Nobody by that name." : "Nobody else here yet."}
        </T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center" },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  none: { textAlign: "center", paddingVertical: space.lg },
});
