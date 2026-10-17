import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { space, useColors } from "@/theme";

/**
 * A tab's or a page's scrolling body, under the native header (which blurs what scrolls beneath it). On the grouped
 * background by default, as the phone's own list screens. `onRefresh`: pull to refresh. A field being typed in is kept
 * above the keyboard, and dragging the page down puts the keyboard away.
 */
export function Screen({
  children,
  grouped = true,
  onRefresh,
  contentStyle,
  testID,
  footer,
  scrollEnabled = true,
}: {
  children: ReactNode;
  grouped?: boolean;
  onRefresh?: () => Promise<unknown> | void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** Pinned under the scrolling content (a form's buttons). */
  footer?: ReactNode;
  /** False while a gesture inside needs the finger (a pinch, a drag): the page stops scrolling meanwhile. */
  scrollEnabled?: boolean;
}) {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={[styles.fill, { backgroundColor: grouped ? colors.grouped : colors.background }]}>
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        // The field being typed in stays above the keyboard, and dragging the page down puts the keyboard away.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        scrollEnabled={scrollEnabled}
        contentContainerStyle={[styles.content, contentStyle]}
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
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
});
