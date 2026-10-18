import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * The staff's five tabs (owner, 2026-10-16: the website is the main thing; the app helps the office see things and do
 * a few things). The office: Home (the day at a glance), Schedule, Scan, Students and More. Coaches (2026-10-18: "I
 * should have availability part … coaches are the main one who's using the phone"): Home, Schedule, Availability, Scan
 * and More, where Students comes first (a phone's tab bar holds five). Android shows every tab's name and the same
 * pictures as the iPhone.
 */
export default function StaffTabs() {
  const colors = useColors();
  const { isCoach } = useBranch();
  return (
    <NativeTabs tintColor={colors.foreground} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="tab-today">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" testID="tab-schedule">
        <NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
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
