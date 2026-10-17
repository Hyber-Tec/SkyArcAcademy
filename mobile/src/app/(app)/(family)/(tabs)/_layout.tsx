import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColors } from "@/theme";

/**
 * The family's four tabs, as the website's family portal (owner, 2026-10-17: Home first, then Classes, Reports and
 * More): a house, a calendar, a chart and three dots, with every tab's name on Android too.
 */
export default function FamilyTabs() {
  const colors = useColors();
  return (
    <NativeTabs tintColor={colors.foreground} labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="family-tab-home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="classes" testID="family-tab-classes">
        <NativeTabs.Trigger.Label>Classes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports" testID="family-tab-reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.line.uptrend.xyaxis", selected: "chart.line.uptrend.xyaxis" }} md="monitoring" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more" testID="family-tab-more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "ellipsis.circle", selected: "ellipsis.circle.fill" }} md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
