import { useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBarScrim, TabHeader } from "./TabHeader";
import { ZoomScrollView } from "./ZoomScrollView";
import { space, useColors } from "@/theme";

/**
 * A tab's or a page's scrolling body. A page opened over the tabs sits under its native header (which blurs what
 * scrolls beneath it); a tab gives its `title` (and an action on its right, `titleRight`), shown at the very top of the
 * page as Today's greeting is, without an empty bar above it. On the grouped background by default, as the phone's own
 * list screens. `onRefresh`: pull to refresh. A field being typed in is kept above the keyboard, and dragging the page
 * down puts the keyboard away. `zoomable`: the page holds a zoomable picture (ZoomCanvas), which has the fingers first
 * (ZoomScrollView).
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
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const Scroll = zoomable ? ZoomScrollView : ScrollView;
  const page = grouped ? colors.grouped : colors.background;
  // Without a header, Android doesn't keep the page clear of the status bar by itself (the iPhone does).
  const top = title && Platform.OS === "android" ? { paddingTop: insets.top + space.lg } : null;
  return (
    <View style={[styles.fill, { backgroundColor: page }]}>
      <Scroll
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        // The field being typed in stays above the keyboard, and dragging the page down puts the keyboard away.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
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
      {title ? <StatusBarScrim color={page} /> : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
});
