import { Circle, DashPathEffect, Group, Image as SkiaImage, Skia, type SkImage } from "@shopify/react-native-skia";
import { PELLET_MM, ringRadiusMm } from "@shared/shooting/target";
import { type CardReview, type ReviewBull, bullState, closeCall, placeShot, removeShot, takeExtra, typeScores } from "@shared/targets/review";
import { scoreAt } from "@shared/targets/score";
import { Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { type SharedValue, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";
import { type Drag, ZoomCanvas } from "./ZoomCanvas";

/** How much of the bull the close-up shows around its centre, in millimetres: ring 1 and a little beyond. */
const VIEW_MM = 26;
const PELLET_R = PELLET_MM / 2;
const STATE_TEXT = {
  ok: "Looks right. To move a shot, drag anywhere on the picture: the green circle follows your finger. Pinch with two fingers to zoom in.",
  check: "Worth a look: the scan wasn't sure, the hole only just touches a line, or it saw more marks than shots. Pinch to zoom in, then drag anywhere to move the green circle onto the hole.",
  missing: "No hole found here: it counts as a miss (0). If there is one, tap its centre, then drag anywhere to fine-tune.",
  unseen: "The photo doesn’t show this bull. Type its score below.",
} as const;

/**
 * One bull, up close, to check what the scan found: the photo turned flat around the bull with its rings drawn on it,
 * each counted shot as a pellet-sized circle (it grows with the zoom, as the hole does). A finger dragged anywhere on
 * the picture moves the shot nearest it by the same amount (so the finger never hides the circle; zoomed in, finer),
 * its score following as it moves; two fingers pinch to zoom; a tap places a missing shot. Other marks the scan saw can
 * be counted instead, and a bull the photo doesn't show takes typed scores.
 */
export function BullEditor({ image, review, n, onChange, onClose }: { image: SkImage | null; review: CardReview; n: number | null; onChange: (next: CardReview) => void; onClose: () => void }) {
  const colors = useColors();
  const bull = review.bulls.find((b) => b.n === n) ?? null;
  return (
    <Modal visible={!!bull} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* A modal is outside the app's gesture root: it gets its own, or pinches and drags don't reach the picture. */}
      <GestureHandlerRootView style={styles.fill}>
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={["bottom"]}>
          {bull ? <EditorBody key={bull.n} image={image} review={review} bull={bull} onChange={onChange} onClose={onClose} /> : null}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function EditorBody({ image, review, bull, onChange, onClose }: { image: SkImage | null; review: CardReview; bull: ReviewBull; onChange: (next: CardReview) => void; onClose: () => void }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.lg * 2, 460);
  const state = bullState(bull, review.shotsPerBull);
  /** The shot being dragged, as it moves (mm from the centre, x right and y up). */
  const [moving, setMoving] = useState<{ i: number; x: number; y: number } | null>(null);
  const short = bull.shots.length < review.shotsPerBull;

  // The shots' places for the gestures (content units: millimetres from the close-up's top-left; NaN when typed).
  const places = useSharedValue<number[]>([]);
  useEffect(() => {
    places.set(bull.shots.flatMap((s) => (s.x === null || s.y === null ? [Number.NaN, Number.NaN] : [VIEW_MM + s.x, VIEW_MM - s.y])));
  }, [bull.shots, places]);
  const dragIndex = useSharedValue(-1);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lastTenth = useSharedValue(-1);
  // The page stays still while a finger is on the picture.
  const [locked, setLocked] = useState(false);

  const showMove = (i: number, x: number, y: number) => setMoving({ i, x, y });
  const clearMove = () => setMoving(null);
  const drop = (i: number, x: number, y: number) => {
    setMoving(null);
    onChange(placeShot(review, bull.n, i, x, y));
  };
  const drag: Drag = {
    // The shot nearest the finger moves, wherever on the picture the finger is.
    start: (x, y) => {
      "worklet";
      let best = -1;
      let bestD = Infinity;
      const p = places.value;
      for (let i = 0; i * 2 < p.length; i++) {
        if (!Number.isFinite(p[i * 2])) continue;
        const d = (p[i * 2] - x) ** 2 + (p[i * 2 + 1] - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      dragIndex.value = best;
      if (best >= 0) {
        dragX.value = p[best * 2];
        dragY.value = p[best * 2 + 1];
      }
      return best >= 0;
    },
    move: (dx, dy) => {
      "worklet";
      const i = dragIndex.value;
      if (i < 0) return;
      // Kept on the close-up.
      const x = Math.min(2 * VIEW_MM, Math.max(0, dragX.value + dx));
      const y = Math.min(2 * VIEW_MM, Math.max(0, dragY.value + dy));
      dragX.value = x;
      dragY.value = y;
      const mx = x - VIEW_MM;
      const my = VIEW_MM - y;
      // The score shown while dragging changes by tenths (every 0.25 mm): only then is the screen told.
      const tenth = Math.floor(Math.sqrt(mx * mx + my * my) * 4);
      if (tenth !== lastTenth.value) {
        lastTenth.value = tenth;
        scheduleOnRN(showMove, i, mx, my);
      }
    },
    end: (movedIt) => {
      "worklet";
      const i = dragIndex.value;
      dragIndex.value = -1;
      lastTenth.value = -1;
      if (i < 0) return;
      if (movedIt) scheduleOnRN(drop, i, dragX.value - VIEW_MM, VIEW_MM - dragY.value);
      else scheduleOnRN(clearMove);
    },
  };
  const tapped = (x: number, y: number) => {
    if (!short || !bull.found) return;
    if (Math.hypot(x - VIEW_MM, y - VIEW_MM) <= VIEW_MM) onChange(placeShot(review, bull.n, null, x - VIEW_MM, VIEW_MM - y));
  };

  const shown = bull.shots.map((s, i) => (moving && moving.i === i ? { ...s, x: moving.x, y: moving.y, ...scoreAt(Math.hypot(moving.x, moving.y)) } : s));
  // Without a picture of the bull (a typed card, or a photo that didn't show it) there's only the score to type.
  const pictured = bull.found && !!image;
  const text = pictured
    ? STATE_TEXT[state]
    : bull.shots.length
      ? "Typed in, without a place on the target. Change it below."
      : image
        ? STATE_TEXT.unseen
        : "No score here: it counts as a miss (0). Type it below.";
  return (
    <>
      <View style={styles.head}>
        <T variant="heading">Bull {bull.n}</T>
        <Button variant="ghost" size="sm" onPress={onClose} testID="bull-done">
          Done
        </Button>
      </View>
      <ScrollView contentContainerStyle={styles.body} scrollEnabled={!locked}>
        <T tone={state === "ok" || (!pictured && bull.shots.length) ? "muted" : "warning"}>{text}</T>
        {pictured ? (
          <View style={[styles.zoom, { width: size, height: size, borderColor: colors.border }]} accessibilityLabel={`Bull ${bull.n}, up close. Drag anywhere to move the shot; pinch to zoom.`}>
            <ZoomCanvas width={size} height={size} contentWidth={VIEW_MM * 2} contentHeight={VIEW_MM * 2} onTap={tapped} drag={drag} onLock={setLocked} testID="bull-zoom">
              <Photo image={image} bull={bull} />
              <Group transform={[{ translateX: VIEW_MM }, { translateY: VIEW_MM }]}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((ring) => (
                  <Circle key={ring} cx={0} cy={0} r={ringRadiusMm(ring)} color="rgba(56, 189, 248, 0.55)" style="stroke" strokeWidth={0.08} />
                ))}
                {bull.extra.map((s, i) =>
                  s.x === null || s.y === null ? null : (
                    <Circle key={`e${i}`} cx={s.x} cy={-s.y} r={PELLET_R} color="#F59E0B" style="stroke" strokeWidth={0.18}>
                      <DashPathEffect intervals={[0.5, 0.35]} />
                    </Circle>
                  ),
                )}
              </Group>
              {bull.shots.map((s, i) => (s.x === null || s.y === null ? null : <ShotMark key={i} i={i} x={VIEW_MM + s.x} y={VIEW_MM - s.y} dragIndex={dragIndex} dragX={dragX} dragY={dragY} />))}
            </ZoomCanvas>
          </View>
        ) : null}
        {pictured && short ? (
          <Button variant="outline" onPress={() => onChange(placeShot(review, bull.n, null, 0, 0))} testID="bull-add-shot">
            Add the shot, then drag it onto the hole
          </Button>
        ) : null}
        <ListSection title={review.shotsPerBull === 1 ? "The shot" : "The shots"}>
          {shown.length ? (
            shown.map((s, i) => {
              const close = closeCall(s);
              const how =
                moving?.i === i ? "Moving" : s.saved ? (s.x === null ? "Typed in, as saved" : "As saved") : s.x === null ? "Typed in" : s.manual ? "Placed by you" : s.confidence < 0.6 ? "The scan wasn’t sure" : "Found by the scan";
              return (
                <ListRow
                  key={i}
                  testID={`bull-shot-${i}`}
                  title={`${s.value}${s.decimal !== null ? `  (${s.decimal.toFixed(1)})` : ""}`}
                  subtitle={
                    // The whole reason, however many lines it takes.
                    <T variant="small" tone="muted">
                      {close ? `${how} · close call: the hole touches the ${close.ring} ring’s line by ${close.byMm.toFixed(2)} mm, so ISSF counts ${close.ring}; by eye it may look like ${close.ring - 1}` : how}
                    </T>
                  }
                  right={
                    <Button variant="ghost" size="sm" onPress={() => onChange(removeShot(review, bull.n, i))} accessibilityLabel={`Remove shot ${i + 1}`}>
                      Remove
                    </Button>
                  }
                />
              );
            })
          ) : (
            <ListRow title="No shot" subtitle={pictured ? "Counts as a miss (0) unless you place it" : "Type the score below"} />
          )}
        </ListSection>
        {bull.extra.length ? (
          <ListSection title="Other marks the scan saw" footer="A second hole, a torn edge or a pen mark. Count one if it’s the shot.">
            {bull.extra.map((s, i) => (
              <ListRow
                key={i}
                testID={`bull-extra-${i}`}
                title={`${s.value}${s.decimal !== null ? `  (${s.decimal.toFixed(1)})` : ""}`}
                right={
                  <Button variant="outline" size="sm" onPress={() => onChange(takeExtra(review, bull.n, i))}>
                    Count this one
                  </Button>
                }
              />
            ))}
          </ListSection>
        ) : null}
        <Typed bull={bull} shots={review.shotsPerBull} open={!pictured} onType={(values) => onChange(typeScores(review, bull.n, values))} />
      </ScrollView>
    </>
  );
}

/** The photo flat around the bull: photo pixels → the bull's millimetres (x right, y down) from the close-up's corner. */
function Photo({ image, bull }: { image: SkImage; bull: ReviewBull }) {
  const [ax, ay, bx, by] = bull.axes;
  const det = ax * by - bx * ay;
  const i00 = by / det;
  const i01 = -bx / det;
  const i10 = -ay / det;
  const i11 = ax / det;
  const { x: cx, y: cy } = bull.center;
  const matrix = Skia.Matrix([i00, i01, VIEW_MM - (i00 * cx + i01 * cy), i10, i11, VIEW_MM - (i10 * cx + i11 * cy), 0, 0, 1]);
  return (
    <Group matrix={matrix}>
      <SkiaImage image={image} x={0} y={0} width={image.width()} height={image.height()} fit="fill" />
    </Group>
  );
}

/** A counted shot: the pellet's circle and its centre, following the finger while it's being dragged. */
function ShotMark({ i, x, y, dragIndex, dragX, dragY }: { i: number; x: number; y: number; dragIndex: SharedValue<number>; dragX: SharedValue<number>; dragY: SharedValue<number> }) {
  const cx = useDerivedValue(() => (dragIndex.value === i ? dragX.value : x));
  const cy = useDerivedValue(() => (dragIndex.value === i ? dragY.value : y));
  const color = useDerivedValue(() => (dragIndex.value === i ? "#38BDF8" : "#22C55E"));
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={PELLET_R} color={color} style="stroke" strokeWidth={0.22} />
      <Circle cx={cx} cy={cy} r={0.18} color={color} />
    </Group>
  );
}

/** Scores typed for the bull: one stepper per shot, for a bull the photo doesn't show (or to override the scan). */
function Typed({ bull, shots, open: openAtFirst, onType }: { bull: ReviewBull; shots: number; open: boolean; onType: (values: number[]) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(openAtFirst);
  const values = Array.from({ length: shots }, (_, i) => bull.shots[i]?.value ?? 0);
  if (!open)
    return (
      <Button variant="link" onPress={() => setOpen(true)} testID="bull-type-open">
        Type the score instead
      </Button>
    );
  return (
    <ListSection title="Type the score" footer="Whole numbers, 0 to 10. Typed scores have no place on the target.">
      {values.map((v, i) => (
        <ListRow
          key={i}
          title={shots === 1 ? "Score" : `Shot ${i + 1}`}
          right={
            <View style={styles.stepper}>
              <IconButton
                icon={<Minus size={18} color={colors.foreground} />}
                accessibilityLabel="One less"
                onPress={() => onType(values.map((x, j) => (j === i ? Math.max(0, x - 1) : x)))}
                testID={`bull-type-minus-${i}`}
              />
              <T variant="subheading" style={styles.value}>
                {v}
              </T>
              <IconButton
                icon={<Plus size={18} color={colors.foreground} />}
                accessibilityLabel="One more"
                onPress={() => onType(values.map((x, j) => (j === i ? Math.min(10, x + 1) : x)))}
                testID={`bull-type-plus-${i}`}
              />
            </View>
          }
        />
      ))}
    </ListSection>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  zoom: { alignSelf: "center", borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm },
  value: { minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] },
});
