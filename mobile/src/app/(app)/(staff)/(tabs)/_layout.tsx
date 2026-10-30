import { NativeTabs } from "expo-router/unstable-native-tabs";
import { usePendingRequests } from "@/features/requests/data";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * The staff's five tabs (owner, 2026-10-16: the website is the main thing; the app helps the office see things and do
 * a few things). The office: Home (the day at a glance), Schedule, Scan, Students and More. Coaches (2026-10-18: "I
 * should have availability part … coaches are the main one who's using the phone"): Home, Schedule, Availability, Scan
 * and More, where Students comes first (a phone's tab bar holds five). Android shows every tab's name and the same
 * pictures as the iPhone. For owners and admins, Schedule's badge counts the families' requests waiting on them.
 */
export default function StaffTabs() {
  const colors = useColors();
  const { isCoach, isAdmin } = useBranch();
  const waiting = usePendingRequests(isAdmin).data.length;
  return (
    <NativeTabs tintColor={colors.foreground} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="tab-today">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" testID="tab-schedule">
        <NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
        {/* No text when nothing waits: the native tabs show any text they're given, "0" too, whatever `hidden` says. */}
        <NativeTabs.Trigger.Badge hidden={!waiting}>{waiting ? String(waiting) : undefined}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="availability" hidden={!isCoach} testID="tab-availability">
        <NativeTabs.Trigger.Label>Availability</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "clock", selected: "clock.fill" }} md="schedule" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan" testID="tab-scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "camera", selected: "camera.fill" }} md="photo_camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="students" hidden={isCoach} testID="tab-students">
        <NativeTabs.Trigger.Label>Students</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more" testID="tab-more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "ellipsis.circle", selected: "ellipsis.circle.fill" }} md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
