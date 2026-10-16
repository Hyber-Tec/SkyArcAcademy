import { Canvas, Circle, DashPathEffect, Group, Image as SkiaImage, Skia, type SkImage } from "@shopify/react-native-skia";
import { PELLET_MM, ringRadiusMm } from "@shared/shooting/target";
import { type CardReview, type ReviewBull, bullState, placeShot, removeShot, takeExtra, typeScores } from "@shared/targets/review";
import { Minus, Plus } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/** How much of the bull the zoom shows around its centre, in millimetres: ring 1 and a little beyond. */
const VIEW_MM = 26;

const STATE_TEXT = {
  ok: "Looks right. Tap the picture to move the shot.",
  check: "Worth a look: the scan wasn’t sure, or found more marks than shots. Tap where the hole is.",
  missing: "No hole found here: it counts as a miss (0). If there is one, tap its centre.",
  unseen: "The photo doesn’t show this bull. Type its score below.",
} as const;

/**
 * One bull, up close, to check what the scan found: the photo turned flat around the bull with its rings drawn on it,
 * and each counted shot as a pellet-sized circle. Tapping the picture moves the chosen shot there (or adds one while
 * the bull is short); other marks the scan saw can be counted instead; a bull the photo doesn't show takes typed scores.
 */
export function BullEditor({
  image,
  review,
  n,
  onChange,
  onClose,
}: {
  image: SkImage | null;
  review: CardReview;
  n: number | null;
  onChange: (next: CardReview) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const bull = review.bulls.find((b) => b.n === n) ?? null;
  return (
    <Modal visible={!!bull} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={["bottom"]}>
        {bull ? <EditorBody key={bull.n} image={image} review={review} bull={bull} onChange={onChange} onClose={onClose} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

function EditorBody({
  image,
  review,
  bull,
  onChange,
  onClose,
}: {
  image: SkImage | null;
  review: CardReview;
  bull: ReviewBull;
  onChange: (next: CardReview) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<number | null>(null);
  const size = Math.min(width - space.lg * 2, 420);
  const state = bullState(bull, review.shotsPerBull);
  const z = size / (2 * VIEW_MM);
  const place = (x: number, y: number) => {
    onChange(placeShot(review, bull.n, picked !== null && picked < bull.shots.length ? picked : null, x, y));
    setPicked(null);
  };
  return (
    <>
      <View style={styles.head}>
        <T variant="heading">Bull {bull.n}</T>
        <Button variant="ghost" size="sm" onPress={onClose} testID="bull-done">
          Done
        </Button>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <T tone={state === "ok" ? "muted" : "warning"}>{STATE_TEXT[state]}</T>
        {bull.found && image ? (
          <Pressable
            testID="bull-zoom"
            accessibilityRole="adjustable"
            accessibilityLabel={`Bull ${bull.n}, up close. Tap where the hole's centre is.`}
            onPress={(e) => {
              const x = (e.nativeEvent.locationX - size / 2) / z;
              const yDown = (e.nativeEvent.locationY - size / 2) / z;
              if (Math.hypot(x, yDown) <= VIEW_MM) place(x, -yDown);
            }}
            style={[styles.zoom, { width: size, height: size, borderColor: colors.border }]}
          >
            <Zoom image={image} bull={bull} size={size} z={z} picked={picked} />
          </Pressable>
        ) : null}
        <ListSection title={review.shotsPerBull === 1 ? "The shot" : "The shots"}>
          {bull.shots.length ? (
            bull.shots.map((s, i) => (
              <ListRow
                key={i}
                testID={`bull-shot-${i}`}
                title={`${s.value}${s.decimal !== null ? `  (${s.decimal.toFixed(1)})` : ""}`}
                subtitle={
                  s.x === null
                    ? "Typed in"
                    : picked === i
                      ? "Tap the picture to move it"
                      : s.manual
                        ? "Placed by you"
                        : s.confidence < 0.6
                          ? "The scan wasn’t sure"
                          : "Found by the scan"
                }
                onPress={bull.found && s.x !== null ? () => setPicked(picked === i ? null : i) : undefined}
                chevron={false}
                right={
                  <Button variant="ghost" size="sm" onPress={() => onChange(removeShot(review, bull.n, i))} accessibilityLabel={`Remove shot ${i + 1}`}>
                    Remove
                  </Button>
                }
              />
            ))
          ) : (
            <ListRow title="No shot" subtitle={bull.found ? "Counts as a miss (0) unless you tap the hole above" : "Type the score below"} />
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
        <Typed bull={bull} shots={review.shotsPerBull} onType={(values) => onChange(typeScores(review, bull.n, values))} />
      </ScrollView>
    </>
  );
}

/** The photo flat around the bull, its rings, the counted shots (green) and the other marks (amber, dashed). */
function Zoom({ image, bull, size, z, picked }: { image: SkImage; bull: ReviewBull; size: number; z: number; picked: number | null }) {
  const [ax, ay, bx, by] = bull.axes;
  const det = ax * by - bx * ay;
  // Photo pixels → the bull's millimetres (x right, y down) → the zoom's points.
  const i00 = by / det;
  const i01 = -bx / det;
  const i10 = -ay / det;
  const i11 = ax / det;
  const { x: cx, y: cy } = bull.center;
  const matrix = Skia.Matrix([z * i00, z * i01, size / 2 - z * (i00 * cx + i01 * cy), z * i10, z * i11, size / 2 - z * (i10 * cx + i11 * cy), 0, 0, 1]);
  const pellet = PELLET_MM / 2;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group matrix={matrix}>
        <SkiaImage image={image} x={0} y={0} width={image.width()} height={image.height()} fit="fill" />
      </Group>
      <Group transform={[{ translateX: size / 2 }, { translateY: size / 2 }, { scale: z }]}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((ring) => (
          <Circle key={ring} cx={0} cy={0} r={ringRadiusMm(ring)} color="rgba(56, 189, 248, 0.55)" style="stroke" strokeWidth={1 / z} />
        ))}
        {bull.extra.map((s, i) =>
          s.x === null || s.y === null ? null : (
            <Circle key={`e${i}`} cx={s.x} cy={-s.y} r={pellet} color="#F59E0B" style="stroke" strokeWidth={2 / z}>
              <DashPathEffect intervals={[4 / z, 3 / z]} />
            </Circle>
          ),
        )}
        {bull.shots.map((s, i) =>
          s.x === null || s.y === null ? null : (
            <Group key={`s${i}`}>
              <Circle cx={s.x} cy={-s.y} r={pellet} color={picked === i ? "#38BDF8" : "#22C55E"} style="stroke" strokeWidth={(picked === i ? 3 : 2) / z} />
              <Circle cx={s.x} cy={-s.y} r={1.6 / z} color={picked === i ? "#38BDF8" : "#22C55E"} />
            </Group>
          ),
        )}
      </Group>
    </Canvas>
  );
}

/** Scores typed for the bull: one stepper per shot, for a bull the photo doesn't show (or to override the scan). */
function Typed({ bull, shots, onType }: { bull: ReviewBull; shots: number; onType: (values: number[]) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(!bull.found);
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  zoom: { alignSelf: "center", borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm },
  value: { minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] },
});
