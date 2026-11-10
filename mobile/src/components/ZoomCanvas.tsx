import { Canvas, Group } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { Minimize2 } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureTouchEvent } from "react-native-gesture-handler";
import { type SharedValue, cancelAnimation, useAnimatedReaction, useDerivedValue, useSharedValue, withDecay, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useScrollGesture } from "./ZoomScrollView";

/** How far in a pinch may go, and where a double tap goes. */
const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 3;
/** A finger moving this far (points) is a drag, not a tap. */
const DRAG_AFTER = 5;
/**
 * Moving the caller's thing (a shot) waits this long (ms) after the finger lands, unless it moves this far: a second
 * finger landing meanwhile makes it a pinch, and the first one's drift mustn't move the shot. A pinch that starts
 * within the second time gives the drag's movement back.
 */
const DRAG_WAIT_MS = 120;
const DRAG_SURE = 24;
const PINCH_UNDOES_MS = 450;
/**
 * One finger moving on a picture that isn't zoomed in scrolls the page around it, once it has moved this far (points)
 * for this long (ms), or this far at once: until then a second finger can still land and make it a pinch, as a hand's
 * second finger lands a moment after the first.
 */
const SCROLL_AFTER = 10;
const SCROLL_WAIT_MS = 110;
const SCROLL_SURE = 28;

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
  /** Worklet: the finger lifted, or a second one landed (`moved` false when it never really moved). */
  end: (moved: boolean) => void;
}

/** The fingers on the picture: how many, which ones (a number per set), their middle and how far apart they are. */
interface Fingers {
  n: number;
  key: number;
  x: number;
  y: number;
  spread: number;
}

const NO_FINGERS: Fingers = { n: 0, key: 0, x: 0, y: 0, spread: 0 };

/** The time (ms), for the gesture worklets: they run as fingers move, never while the screen renders. */
function clock(): number {
  "worklet";
  return Date.now();
}

/** The fingers an event leaves on the picture (`lifting`: without the ones it lifts). */
function fingersOf(e: GestureTouchEvent, lifting: boolean): Fingers {
  "worklet";
  const xs: number[] = [];
  const ys: number[] = [];
  let key = 0;
  for (let i = 0; i < e.allTouches.length; i++) {
    const t = e.allTouches[i];
    let gone = false;
    if (lifting) for (let j = 0; j < e.changedTouches.length; j++) if (e.changedTouches[j].id === t.id) gone = true;
    if (gone) continue;
    xs.push(t.x);
    ys.push(t.y);
    key += 2 ** (t.id % 24);
  }
  const n = xs.length;
  if (!n) return NO_FINGERS;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += xs[i] / n;
    y += ys[i] / n;
  }
  let spread = 0;
  if (n > 1) for (let i = 0; i < n; i++) spread += Math.hypot(xs[i] - x, ys[i] - y) / n;
  return { n, key, x, y, spread };
}

/**
 * Content (in its own units) drawn into a Skia canvas the person can zoom: pinch with two fingers (the point under them
 * stays under them, wherever they go), double-tap to zoom in where tapped or back out. Skia draws it again at each
 * scale, so a photo stays sharp.
 *
 * The fingers are followed one by one: each change of the picture comes from the same fingers' movement since the last
 * event, so a finger landing late or lifting first (as a hand does) never makes the picture jump. One finger does one of
 * two things. Without `drag` it moves the view once zoomed in, and otherwise is the page's, to scroll (inside a
 * ZoomScrollView, which waits for this to let go). With `drag` it moves the caller's thing anywhere on the canvas, by
 * the finger's movement, so the finger never covers what it moves; more zoom, finer moves. A pan let go while moving
 * glides on, slowing, within the picture. Zoomed in, a button in the corner goes back to the whole picture.
 *
 * A tap (one finger, no movement) arrives in content units.
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
  maxZoom = MAX_ZOOM,
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
  maxZoom?: number;
  /** The zoom state, when the caller draws with it (see useZoomState). */
  state?: ZoomState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const own = useZoomState(width, height, contentWidth, contentHeight);
  const z = given ?? own;
  const fit = z.fit;
  const { zoom, tx, ty } = z;
  const scroll = useScrollGesture();
  // The content centred at zoom 1.
  const restX = (width - contentWidth * fit) / 2;
  const restY = (height - contentHeight * fit) / 2;
  // The whole picture again only when what's shown or its space changes, never on a mere re-render.
  useEffect(() => {
    zoom.set(1);
    tx.set(restX);
    ty.set(restY);
  }, [zoom, tx, ty, restX, restY]);

  /** Keeps the content covering the view once zoomed in (no drifting off into the margins), and centred where smaller. */
  const clampX = (x: number, k: number) => {
    "worklet";
    const w = contentWidth * fit * k;
    return w <= width ? (width - w) / 2 : Math.min(0, Math.max(width - w, x));
  };
  const clampY = (y: number, k: number) => {
    "worklet";
    const h = contentHeight * fit * k;
    return h <= height ? (height - h) / 2 : Math.min(0, Math.max(height - h, y));
  };
  const toRest = (ms: number) => {
    "worklet";
    zoom.set(withTiming(1, { duration: ms }));
    tx.set(withTiming(restX, { duration: ms }));
    ty.set(withTiming(restY, { duration: ms }));
  };

  // The fingers at the last event, and where and when the first one landed.
  const last = useSharedValue<Fingers>(NO_FINGERS);
  const landed = useSharedValue({ x: 0, y: 0, t: 0 });
  const active = useSharedValue(false);
  const dragging = useSharedValue(false);
  const moved = useSharedValue(false);
  // How fast a one-finger pan was going (points per second), and when.
  const speed = useSharedValue({ x: 0, y: 0, t: 0 });

  const touches = Gesture.Manual()
    .onTouchesDown((e, manager) => {
      const now = fingersOf(e, false);
      if (last.value.n === 0) {
        // A new touch stops a glide or a zoom still settling, where it is.
        cancelAnimation(zoom);
        cancelAnimation(tx);
        cancelAnimation(ty);
        landed.value = { x: now.x, y: now.y, t: clock() };
        active.value = false;
        moved.value = false;
        speed.value = { x: 0, y: 0, t: 0 };
        const k = fit * zoom.value;
        dragging.value = now.n === 1 && !!drag && drag.start((now.x - tx.value) / k, (now.y - ty.value) / k);
      }
      if (now.n >= 2) {
        // A pinch: the picture has the fingers (the page never scrolls), and a drag that began stops where it got to.
        if (dragging.value) {
          dragging.value = false;
          drag?.end(moved.value && clock() - landed.value.t > PINCH_UNDOES_MS);
        }
        if (!active.value) {
          active.value = true;
          manager.activate();
        }
      }
      last.value = now;
    })
    .onTouchesMove((e, manager) => {
      const now = fingersOf(e, false);
      const before = last.value;
      last.value = now;
      // A finger more or fewer since the last event: carry on from here, so nothing jumps.
      if (now.n === 0 || now.key !== before.key) return;
      if (!active.value) {
        const far = Math.hypot(now.x - landed.value.x, now.y - landed.value.y);
        if (dragging.value || zoom.value > 1.01) {
          if (far < DRAG_AFTER) return;
          if (dragging.value && far < DRAG_SURE && clock() - landed.value.t < DRAG_WAIT_MS) return;
          active.value = true;
          manager.activate();
        } else {
          if (far >= SCROLL_AFTER && (clock() - landed.value.t >= SCROLL_WAIT_MS || far >= SCROLL_SURE)) manager.fail();
          return;
        }
      }
      const dx = now.x - before.x;
      const dy = now.y - before.y;
      if (now.n >= 2) {
        if (before.spread <= 0) return;
        const k0 = zoom.value;
        const k1 = Math.min(maxZoom, Math.max(1, (k0 * now.spread) / before.spread));
        const r = k1 / k0;
        // The point under the fingers stays under them as they spread and move.
        zoom.set(k1);
        tx.set(clampX(now.x - (before.x - tx.value) * r, k1));
        ty.set(clampY(now.y - (before.y - ty.value) * r, k1));
        speed.value = { x: 0, y: 0, t: 0 };
        return;
      }
      if (dragging.value) {
        moved.value = true;
        const k = fit * zoom.value;
        drag?.move(dx / k, dy / k);
        return;
      }
      tx.set(clampX(tx.value + dx, zoom.value));
      ty.set(clampY(ty.value + dy, zoom.value));
      const t = clock();
      const was = speed.value;
      const dt = Math.max(8, t - (was.t || t - 16));
      const blend = was.t && t - was.t < 100 ? 0.6 : 1;
      speed.value = { x: blend * ((dx * 1000) / dt) + (1 - blend) * was.x, y: blend * ((dy * 1000) / dt) + (1 - blend) * was.y, t };
    })
    .onTouchesUp((e, manager) => {
      const now = fingersOf(e, true);
      last.value = now;
      if (now.n > 0) return;
      if (active.value) manager.end();
      else manager.fail();
    })
    .onTouchesCancelled((_e, manager) => {
      last.value = NO_FINGERS;
      if (active.value) manager.end();
      else manager.fail();
    })
    .onFinalize(() => {
      if (dragging.value) drag?.end(moved.value);
      if (active.value && !dragging.value) {
        if (zoom.value < 1.03) {
          // Barely zoomed: back to the whole picture.
          toRest(180);
        } else {
          // A pan still moving when the finger lifted glides on, slowing, within the picture.
          const s = speed.value;
          const w = contentWidth * fit * zoom.value;
          const h = contentHeight * fit * zoom.value;
          if (s.t && clock() - s.t < 80) {
            if (w > width && Math.abs(s.x) > 60) tx.set(withDecay({ velocity: s.x, clamp: [width - w, 0] }));
            if (h > height && Math.abs(s.y) > 60) ty.set(withDecay({ velocity: s.y, clamp: [height - h, 0] }));
          }
        }
      }
      last.value = NO_FINGERS;
      active.value = false;
      dragging.value = false;
      moved.value = false;
    });
  // The page waits for the picture: it scrolls only once the picture lets the finger go.
  if (scroll) touches.blocksExternalGesture(scroll);

  // Taps: one finger that didn't move. A pinch or a moving finger wins over them (they don't fire).
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .maxDistance(20)
    .onEnd((e, ok) => {
      if (!ok) return;
      if (zoom.value > 1.05) return toRest(260);
      // In, with the point tapped staying under the finger.
      const k = DOUBLE_TAP_ZOOM;
      const r = k / zoom.value;
      zoom.set(withTiming(k, { duration: 260 }));
      tx.set(withTiming(clampX(e.x - (e.x - tx.value) * r, k), { duration: 260 }));
      ty.set(withTiming(clampY(e.y - (e.y - ty.value) * r, k), { duration: 260 }));
    });
  const tap = Gesture.Tap()
    .maxDistance(DRAG_AFTER * 2)
    .onEnd((e, ok) => {
      if (!ok || !onTap) return;
      const k = fit * zoom.value;
      scheduleOnRN(onTap, (e.x - tx.value) / k, (e.y - ty.value) / k);
    });

  const gesture = Gesture.Race(touches, Gesture.Exclusive(doubleTap, tap));
  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: fit * zoom.value }]);

  // Zoomed in, the way back to the whole picture shows in the corner (beside the canvas, so its tap is its own).
  const [zoomed, setZoomed] = useState(false);
  useAnimatedReaction(
    () => zoom.value > 1.05,
    (now, before) => {
      if (now !== before) scheduleOnRN(setZoomed, now);
    },
  );
  const zoomOut = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    zoom.set(withTiming(1, { duration: 260 }));
    tx.set(withTiming(restX, { duration: 260 }));
    ty.set(withTiming(restY, { duration: 260 }));
  };
  return (
    <View style={[{ width, height }, style]}>
      <GestureDetector gesture={gesture}>
        <View style={{ width, height, overflow: "hidden" }} testID={testID} collapsable={false}>
          <Canvas style={{ width, height }}>
            <Group transform={transform}>{children}</Group>
            {overlay}
          </Canvas>
        </View>
      </GestureDetector>
      {zoomed ? (
        <Pressable
          onPress={zoomOut}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          hitSlop={8}
          testID={testID ? `${testID}-zoom-out` : undefined}
          style={({ pressed }) => [styles.zoomOut, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Minimize2 size={18} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zoomOut: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 10, 10, 0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
});

/** A zoom state for a view of this size showing content of that size, for callers that draw with it. */
export function useZoomState(width: number, height: number, contentWidth: number, contentHeight: number): ZoomState {
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const fit = Math.min(width / contentWidth, height / contentHeight);
  return { zoom, tx, ty, fit };
}
