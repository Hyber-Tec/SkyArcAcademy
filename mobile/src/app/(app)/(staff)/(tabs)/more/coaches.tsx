import { formatPhone } from "@shared/people";
import { ROLE_LABELS } from "@shared/roles";
import { router } from "expo-router";
import { UsersRound } from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { type StaffDoc, useStaffList } from "@/features/data/hooks";
import { useColors } from "@/theme";

/** The academy's current employees: the coaches first, then the office (owners and admins), each a tap from a call. */
export default function CoachesScreen() {
  const colors = useColors();
  const staff = useStaffList();
  const current = staff.data.filter((s) => s.status === "active");
  const coaches = current.filter((s) => s.role === "coach");
  const office = current.filter((s) => s.role !== "coach");
  const row = (s: StaffDoc) => (
    <ListRow
      key={s.id}
      testID={`coach-row-${s.id}`}
      icon={<Avatar name={s.name} size={38} color={s.color} />}
      title={s.name}
      subtitle={[s.role === "coach" ? null : ROLE_LABELS[s.role], s.phone ? formatPhone(s.phone) : s.email].filter(Boolean).join(" · ")}
      right={<ContactButtons phone={s.phone} email={s.email} name={s.name} />}
      chevron={false}
      onPress={() => router.push({ pathname: "/coach/[id]", params: { id: s.id } })}
    />
  );
  return (
    <Screen testID="coaches-screen">
      {staff.loading ? (
        <SkeletonCards count={4} height={60} />
      ) : current.length ? (
        <>
          {coaches.length ? <ListSection title="Coaches">{coaches.map(row)}</ListSection> : null}
          {office.length ? <ListSection title="Office">{office.map(row)}</ListSection> : null}
        </>
      ) : (
        <EmptyState icon={<UsersRound size={26} color={colors.mutedForeground} />} title="No coaches yet" text="Employees are added on the website." />
      )}
    </Screen>
  );
}
