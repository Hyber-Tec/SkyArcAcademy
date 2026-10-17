import { Canvas, Group } from "@shopify/react-native-skia";
import { type ReactNode, useEffect } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { type SharedValue, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/** How far in a pinch may go, and where a double tap goes. */
const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 3;

/**
 * Where the content is in the view: point (x, y) of the content shows at (tx + x·k, ty + y·k), with k = fit × zoom.
 * Shared with what draws over the content (labels that keep their size, a dragged shot).
 */
export interface ZoomState {
  zoom: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  /** Content units per view point at zoom 1 (the content fitted to the view). */
  fit: number;
}

/**
 * Content units drawn into a Skia canvas the person can pinch to zoom (up to 6×, around their fingers), drag to move
 * once zoomed in, and double-tap to zoom in or back out. Skia draws it again at each scale, so a photo stays sharp.
 * Taps and drags arrive in the content's own units; a drag that `grab` claims (it returns true where it starts, as on a
 * shot) goes to `onDrag` instead of moving the view.
 */
export function ZoomCanvas({
  width,
  height,
  contentWidth,
  contentHeight,
  children,
  overlay,
  onTap,
  grab,
  onDrag,
  state: given,
  style,
  testID,
}: {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  /** Drawn in content units. */
  children: ReactNode;
  /** Drawn in view points, over the content (for things that keep their size). */
  overlay?: ReactNode;
  onTap?: (x: number, y: number) => void;
  /** Worklet: whether a drag starting at content point (x, y) is the caller's (true) or moves the view (false). */
  grab?: (x: number, y: number) => boolean;
  /** Worklet: the claimed drag's content point, at each move and with `done` at the end (NaN when it never moved). */
  onDrag?: (x: number, y: number, done: boolean) => void;
  /** The zoom state, when the caller draws with it (see useZoomState). */
  state?: ZoomState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const own = useZoomState(width, height, contentWidth, contentHeight);
  const z = given ?? own;
  const fit = z.fit;
  // The content centred at zoom 1.
  const restX = (width - contentWidth * fit) / 2;
  const restY = (height - contentHeight * fit) / 2;
  const { zoom, tx, ty } = z;
  useEffect(() => {
    zoom.set(1);
    tx.set(restX);
    ty.set(restY);
  }, [zoom, tx, ty, restX, restY]);

  /** Keeps the content covering the view once zoomed in (no drifting off into the margins). */
  const clamp = (x: number, y: number, k: number) => {
    "worklet";
    const w = contentWidth * fit * k;
    const h = contentHeight * fit * k;
    const cx = w <= width ? (width - w) / 2 : Math.min(0, Math.max(width - w, x));
    const cy = h <= height ? (height - h) / 2 : Math.min(0, Math.max(height - h, y));
    return [cx, cy] as const;
  };

  const start = useSharedValue({ zoom: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      start.value = { zoom: zoom.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
    })
    .onUpdate((e) => {
      const s = start.value;
      const k = Math.min(MAX_ZOOM, Math.max(1, s.zoom * e.scale));
      // The content point under the fingers stays under them.
      const px = (s.fx - s.tx) / (fit * s.zoom);
      const py = (s.fy - s.ty) / (fit * s.zoom);
      const [x, y] = clamp(e.focalX - px * fit * k, e.focalY - py * fit * k, k);
      zoom.set(k);
      tx.set(x);
      ty.set(y);
    });

  // One finger moves the view only once zoomed in, or drags what `grab` claims; otherwise it scrolls the page around.
  const dragging = useSharedValue(false);
  const active = useSharedValue(false);
  const last = useSharedValue({ x: 0, y: 0 });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.changedTouches[0];
      const k = fit * zoom.value;
      dragging.value = !!grab && !!t && grab((t.x - tx.value) / k, (t.y - ty.value) / k);
    })
    .onTouchesMove((_e, manager) => {
      if (dragging.value || zoom.value > 1.01) manager.activate();
      else manager.fail();
    })
    .onStart((e) => {
      start.value = { zoom: zoom.value, tx: tx.value, ty: ty.value, fx: e.x, fy: e.y };
      active.value = true;
      const k = fit * zoom.value;
      last.value = { x: (e.x - tx.value) / k, y: (e.y - ty.value) / k };
    })
    .onUpdate((e) => {
      if (dragging.value) {
        const k = fit * zoom.value;
        last.value = { x: (e.x - tx.value) / k, y: (e.y - ty.value) / k };
        onDrag?.(last.value.x, last.value.y, false);
        return;
      }
      const s = start.value;
      const [x, y] = clamp(s.tx + e.translationX, s.ty + e.translationY, zoom.value);
      tx.set(x);
      ty.set(y);
    })
    // Ended or cancelled, a drag drops what it carried where it last was; a touch that never moved drops nothing (NaN).
    .onFinalize(() => {
      if (dragging.value) onDrag?.(active.value ? last.value.x : Number.NaN, active.value ? last.value.y : Number.NaN, true);
      dragging.value = false;
      active.value = false;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (zoom.value > 1.05) {
        zoom.set(withTiming(1));
        tx.set(withTiming(restX));
        ty.set(withTiming(restY));
        return;
      }
      const k = DOUBLE_TAP_ZOOM;
      const px = (e.x - tx.value) / fit;
      const py = (e.y - ty.value) / fit;
      const [x, y] = clamp(width / 2 - px * fit * k, height / 2 - py * fit * k, k);
      zoom.set(withTiming(k));
      tx.set(withTiming(x));
      ty.set(withTiming(y));
    });
  const tap = Gesture.Tap().onEnd((e) => {
    if (!onTap) return;
    const k = fit * zoom.value;
    scheduleOnRN(onTap, (e.x - tx.value) / k, (e.y - ty.value) / k);
  });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, tap));
  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: fit * zoom.value }]);
  return (
    <GestureDetector gesture={gesture}>
      <View style={[{ width, height, overflow: "hidden" }, style]} testID={testID} collapsable={false}>
        <Canvas style={{ width, height }}>
          <Group transform={transform}>{children}</Group>
          {overlay}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

/** A zoom state for a view of this size showing content of that size, for callers that draw with it. */
export function useZoomState(width: number, height: number, contentWidth: number, contentHeight: number): ZoomState {
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const fit = Math.min(width / contentWidth, height / contentHeight);
  return { zoom, tx, ty, fit };
}
