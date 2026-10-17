import { Canvas, Group } from "@shopify/react-native-skia";
import { type ReactNode, useEffect } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { type SharedValue, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/** How far in a pinch may go, and where a double tap goes. */
const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 3;
/** A finger moving this far (points) is a drag, not a tap. */
const DRAG_AFTER = 5;

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

/** A one-finger drag that moves something of the caller's (relative to the finger, so the finger never hides it). */
export interface Drag {
  /** Worklet: a finger went down at content point (x, y); true starts a drag of the caller's thing. */
  start: (x: number, y: number) => boolean;
  /** Worklet: the finger moved by (dx, dy) content units since the last call. */
  move: (dx: number, dy: number) => void;
  /** Worklet: the finger lifted (`moved` false when it never really moved). */
  end: (moved: boolean) => void;
}

/**
 * Content (in its own units) drawn into a Skia canvas the person can zoom: pinch with two fingers (which also move the
 * view), double-tap to zoom in or back out. Skia draws it again at each scale, so a photo stays sharp.
 *
 * One finger does one of two things. Without `drag` it moves the view once zoomed in, and otherwise leaves the touch to
 * the page around (which scrolls). With `drag` it moves the caller's thing anywhere on the canvas, by the finger's
 * movement, so the finger never covers what it moves; more zoom, finer moves.
 *
 * A tap (one finger, no movement) arrives in content units. `onLock` says when a touch here mustn't scroll the page
 * (a pinch, a drag, panning a zoomed view), for the screen to stop its scrolling meanwhile.
 */
export function ZoomCanvas({
  width,
  height,
  contentWidth,
  contentHeight,
  children,
  overlay,
  onTap,
  drag,
  onLock,
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
  drag?: Drag;
  onLock?: (locked: boolean) => void;
  /** The zoom state, when the caller draws with it (see useZoomState). */
  state?: ZoomState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const own = useZoomState(width, height, contentWidth, contentHeight);
  const z = given ?? own;
  const fit = z.fit;
  const { zoom, tx, ty } = z;
  // The content centred at zoom 1.
  const restX = (width - contentWidth * fit) / 2;
  const restY = (height - contentHeight * fit) / 2;
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
  const lock = (on: boolean) => {
    "worklet";
    if (onLock) scheduleOnRN(onLock, on);
  };

  // Whether more than one finger has touched since the first one went down (no tap then), and whether the page is held
  // still for a gesture here.
  const several = useSharedValue(false);
  const locked = useSharedValue(false);
  const hold = (on: boolean) => {
    "worklet";
    if (locked.value === on) return;
    locked.value = on;
    lock(on);
  };
  // The page is let go once neither gesture has a finger down.
  const pinching = useSharedValue(false);
  const panAlive = useSharedValue(false);

  // Two fingers: zoom around them, and move the view as they move. Its own starting point (the pan has its own).
  const pinchStart = useSharedValue({ zoom: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  const pinch = Gesture.Pinch()
    // It hears every finger from the first one: only a second one makes it a pinch (no taps, the page held still).
    .onTouchesDown((e) => {
      if (e.numberOfTouches < 2) return;
      several.value = true;
      hold(true);
    })
    .onStart((e) => {
      pinching.value = true;
      pinchStart.value = { zoom: zoom.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
    })
    .onUpdate((e) => {
      const s = pinchStart.value;
      const k = Math.min(MAX_ZOOM, Math.max(1, s.zoom * e.scale));
      // The content point that was under the fingers stays under them, wherever they go.
      const px = (s.fx - s.tx) / (fit * s.zoom);
      const py = (s.fy - s.ty) / (fit * s.zoom);
      const [x, y] = clamp(e.focalX - px * fit * k, e.focalY - py * fit * k, k);
      zoom.set(k);
      tx.set(x);
      ty.set(y);
    })
    .onFinalize(() => {
      pinching.value = false;
      if (!panAlive.value) hold(false);
      // Barely zoomed: back to the whole picture.
      if (zoom.value < 1.03) {
        zoom.set(withTiming(1, { duration: 160 }));
        tx.set(withTiming(restX, { duration: 160 }));
        ty.set(withTiming(restY, { duration: 160 }));
      }
    });

  // One finger: the caller's drag, or moving a zoomed view. It starts only past a few points of movement (a tap stays a
  // tap), pauses while two fingers pinch, and goes on from where the pinch left things.
  const down = useSharedValue({ x: 0, y: 0 });
  const last = useSharedValue({ x: 0, y: 0 });
  const dragging = useSharedValue(false);
  const moved = useSharedValue(false);
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onBegin(() => {
      panAlive.value = true;
    })
    .onTouchesDown((e) => {
      if (e.numberOfTouches > 1) {
        several.value = true;
        hold(true);
        return;
      }
      several.value = false;
      moved.value = false;
      const t = e.changedTouches[0];
      if (!t) return;
      down.value = { x: t.x, y: t.y };
      const k = fit * zoom.value;
      dragging.value = !!drag && drag.start((t.x - tx.value) / k, (t.y - ty.value) / k);
      // A drag, or a zoomed view, takes the finger from the page at once (before the page starts scrolling).
      if (dragging.value || zoom.value > 1.01) hold(true);
    })
    .onTouchesMove((e, manager) => {
      if (several.value || pinching.value) return;
      const t = e.allTouches[0];
      if (!t) return;
      if (Math.hypot(t.x - down.value.x, t.y - down.value.y) < DRAG_AFTER) return;
      if (dragging.value || zoom.value > 1.01) manager.activate();
      else manager.fail();
    })
    .onStart((e) => {
      last.value = { x: e.translationX, y: e.translationY };
    })
    .onUpdate((e) => {
      const dx = e.translationX - last.value.x;
      const dy = e.translationY - last.value.y;
      last.value = { x: e.translationX, y: e.translationY };
      if (pinching.value) return;
      if (dragging.value) {
        const k = fit * zoom.value;
        moved.value = true;
        drag?.move(dx / k, dy / k);
        return;
      }
      const [x, y] = clamp(tx.value + dx, ty.value + dy, zoom.value);
      tx.set(x);
      ty.set(y);
    })
    .onFinalize(() => {
      if (dragging.value) drag?.end(moved.value);
      dragging.value = false;
      moved.value = false;
      panAlive.value = false;
      if (!pinching.value) hold(false);
    });

  // Taps: one finger that didn't move. Not after a pinch or a drag (their fingers lift too).
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .maxDistance(16)
    .onEnd((e, ok) => {
      if (!ok || several.value) return;
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
  const tap = Gesture.Tap()
    .maxDistance(DRAG_AFTER * 2)
    .onEnd((e, ok) => {
      if (!ok || several.value || !onTap) return;
      const k = fit * zoom.value;
      scheduleOnRN(onTap, (e.x - tx.value) / k, (e.y - ty.value) / k);
    });

  // A pinch or a moving finger wins over the taps (which then don't fire); a double tap wins over a single one.
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, tap));
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
