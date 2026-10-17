import { useIsFocused } from "expo-router";
import { useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBarScrim, TabHeader } from "./TabHeader";
import { ZoomScrollView } from "./ZoomScrollView";
import { space, useColors } from "@/theme";

/**
 * A tab's or a page's scrolling body. A page opened over the tabs sits under its native header (which blurs what
 * scrolls beneath it); a tab gives its `title` (and an action on its right, `titleRight`), shown at the very top of the
 * page as Home's greeting is, without an empty bar above it. On the grouped background by default, as the phone's own
 * list screens. `onRefresh`: pull to refresh. A field being typed in is kept above the keyboard, and dragging the page
 * down puts the keyboard away. `zoomable`: the page holds a zoomable picture (ZoomCanvas), which has the fingers first
 * (ZoomScrollView). `tab`: a tab whose top is its own (a greeting in place of a title), kept clear of the status bar
 * as a titled tab is. `typing={false}`: a page without fields; the keyboard leaves it alone (when a keyboard from the
 * screen before it goes away, React Native's keyboard insets would scroll the page under the status bar).
 */
export function Screen({
  children,
  title,
  titleRight,
  grouped = true,
  onRefresh,
  contentStyle,
  testID,
  footer,
  zoomable = false,
  tab = !!title,
  typing = true,
}: {
  children: ReactNode;
  /** A tab's own title, at the top of the page (the tab's header is hidden). */
  title?: string;
  titleRight?: ReactNode;
  grouped?: boolean;
  onRefresh?: () => Promise<unknown> | void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** Pinned under the scrolling content (a form's buttons). */
  footer?: ReactNode;
  zoomable?: boolean;
  tab?: boolean;
  typing?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  // Only the screen in front follows the keyboard: React Native would also scroll the tabs and pages behind it whenever
  // a keyboard opens and closes in front, leaving their tops under the status bar.
  const focused = useIsFocused();
  const follow = typing && focused;
  const Scroll = zoomable ? ZoomScrollView : ScrollView;
  const page = grouped ? colors.grouped : colors.background;
  // Without a header, Android doesn't keep the page clear of the status bar by itself (the iPhone does).
  const top = tab && Platform.OS === "android" ? { paddingTop: insets.top + space.lg } : null;
  return (
    // Not collapsed away, so the native tabs find the scroll view under it (tapping the tab again scrolls to the top).
    <View collapsable={false} style={[styles.fill, { backgroundColor: page }]}>
      <Scroll
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        // The field being typed in stays above the keyboard, and dragging the page down puts the keyboard away.
        automaticallyAdjustKeyboardInsets={follow}
        keyboardDismissMode={typing ? "interactive" : "none"}
        contentContainerStyle={[styles.content, top, contentStyle]}
        testID={testID}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          ) : undefined
        }
      >
        {title ? <TabHeader title={title} right={titleRight} testID={testID ? `${testID}-title` : undefined} /> : null}
        {children}
      </Scroll>
      {tab ? <StatusBarScrim color={page} /> : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
});
