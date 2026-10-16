import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColors } from "@/theme";

/**
 * The office's five tabs (owner, 2026-10-16: the website is the main thing; the app helps the office see things and do
 * a few things): Today, Schedule, Scan, Students and More. Android shows every tab's name and the same pictures as the
 * iPhone: a sun, a calendar, a camera, two people and three dots.
 */
export default function AdminTabs() {
  const colors = useColors();
  return (
    <NativeTabs tintColor={colors.foreground} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="tab-today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} md="light_mode" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" testID="tab-schedule">
        <NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan" testID="tab-scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "camera", selected: "camera.fill" }} md="photo_camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="students" testID="tab-students">
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
