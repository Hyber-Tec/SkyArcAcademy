import { Canvas, ImageFormat, PaintStyle, Path, Skia, StrokeCap, StrokeJoin } from "@shopify/react-native-skia";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/** What the signing screen asks of the pad. */
export interface SignaturePadHandle {
  clear: () => void;
  /** The signature as a PNG data URL (dark ink on transparent), or null when there's (almost) nothing drawn. */
  toPng: () => string | null;
}

type Point = { x: number; y: number };

/** The pad is twice as wide as it's tall, as on the website (web/src/features/contracts/SignaturePad.tsx). */
const ASPECT = 2;
/** Less ink than this (in widths of the pad) isn't a signature. */
const MIN_INK = 0.25;
const INK = "#111827";
/** The saved picture's pixels per point of the pad: sharp on the signature page. */
const SCALE = 2;

const pathOf = (strokes: readonly Point[][]) => {
  const p = Skia.Path.Make();
  for (const s of strokes) {
    if (!s.length) continue;
    p.moveTo(s[0].x, s[0].y);
    if (s.length === 1) p.lineTo(s[0].x + 0.5, s[0].y + 0.5);
    for (const pt of s.slice(1)) p.lineTo(pt.x, pt.y);
  }
  return p;
};

/**
 * Where a signature is drawn with a finger: on white, like paper, in light and dark, with a line to sign on (the
 * website's pad). The stroke follows the finger (the page doesn't scroll under it); the saved PNG is drawn again at
 * twice its size, ink on transparent.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { invalid?: boolean; onChange?: (hasInk: boolean) => void; testID?: string }>(function SignaturePad(
  { invalid, onChange, testID },
  ref,
) {
  const colors = useColors();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [width, setWidth] = useState(0);
  const live = useRef<Point[] | null>(null);
  const [, redraw] = useState(0);

  const ink = (list: readonly Point[][]) => list.reduce((n, s) => n + s.slice(1).reduce((m, p, i) => m + Math.hypot(p.x - s[i].x, p.y - s[i].y), 0), 0);
  const all = live.current ? [...strokes, live.current] : strokes;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      live.current = [{ x: e.x, y: e.y }];
      redraw((n) => n + 1);
    })
    .onUpdate((e) => {
      live.current?.push({ x: e.x, y: e.y });
      redraw((n) => n + 1);
    })
    .onFinalize(() => {
      const stroke = live.current;
      live.current = null;
      if (!stroke) return;
      setStrokes((s) => {
        const next = [...s, stroke];
        onChange?.(width > 0 && ink(next) >= MIN_INK * width);
        return next;
      });
    });

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        live.current = null;
        setStrokes([]);
        onChange?.(false);
      },
      toPng: () => {
        if (!width || ink(strokes) < MIN_INK * width) return null;
        const w = Math.round(width * SCALE);
        const h = Math.round((width / ASPECT) * SCALE);
        const surface = Skia.Surface.Make(w, h);
        if (!surface) return null;
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color("transparent"));
        canvas.scale(SCALE, SCALE);
        const paint = Skia.Paint();
        paint.setColor(Skia.Color(INK));
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(2.5);
        paint.setStrokeCap(StrokeCap.Round);
        paint.setStrokeJoin(StrokeJoin.Round);
        paint.setAntiAlias(true);
        canvas.drawPath(pathOf(strokes), paint);
        surface.flush();
        const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100);
        return base64 ? `data:image/png;base64,${base64}` : null;
      },
    }),
    [strokes, width, onChange],
  );

  return (
    <View
      style={[styles.pad, { height: width ? width / ASPECT : 160, borderColor: invalid ? colors.destructive : colors.border }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Your signature: draw it with your finger"
      testID={testID}
    >
      <View style={styles.line} pointerEvents="none">
        <T variant="tiny" style={styles.x}>
          ✕
        </T>
        <View style={styles.rule} />
      </View>
      <GestureDetector gesture={pan}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={pathOf(all)} color={INK} style="stroke" strokeWidth={2.5} strokeCap="round" strokeJoin="round" antiAlias />
        </Canvas>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  // White like paper in both themes: the ink is dark.
  pad: { backgroundColor: "#ffffff", borderRadius: radius.lg, borderWidth: 1, overflow: "hidden", width: "100%" },
  line: { position: "absolute", left: space.lg, right: space.lg, bottom: "28%", flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  x: { color: "#9ca3af" },
  rule: { flex: 1, height: 1, backgroundColor: "#d1d5db", marginBottom: 3 },
});
