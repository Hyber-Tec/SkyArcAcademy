import { createContext, useContext, useMemo } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";

const ScrollGesture = createContext<NativeGesture | null>(null);

/** The scrolling of the page around a zoomable picture (null outside a ZoomScrollView), for the picture to hold back. */
export function useScrollGesture(): NativeGesture | null {
  return useContext(ScrollGesture);
}

/**
 * A ScrollView that lets a zoomable picture inside it (ZoomCanvas) have the fingers first, decided on the phone's own
 * gesture thread rather than after a round trip through the app's code: a pinch, a drag on the picture or a pan of a
 * zoomed one never scrolls the page, and a finger that moves on a picture that isn't zoomed in scrolls the page a
 * moment later (unless a second finger lands first and makes it a pinch).
 */
export function ZoomScrollView({ children, ...props }: ScrollViewProps) {
  const gesture = useMemo(() => Gesture.Native(), []);
  return (
    <ScrollGesture.Provider value={gesture}>
      <GestureDetector gesture={gesture}>
        <ScrollView {...props}>{children}</ScrollView>
      </GestureDetector>
    </ScrollGesture.Provider>
  );
}
