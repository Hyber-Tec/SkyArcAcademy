import { type Href, router } from "expo-router";
import { Pointer } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { type EdgeInsets, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { type Rect, bringIntoView, waitForTarget } from "@/lib/tourTargets";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { type TourKind, markTourSeen, tourSeen, tourSignals, useTourSignals } from "./state";
import { type Tour, tourFor } from "./steps";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where a tab's own button sits in the tab bar, which the app can't measure (it's the phone's own): on the iPhone's
 * floating bar (iOS 26: about 20 points in from each side and 62 high, its buttons spread over its middle), and on
 * Android's bar across the bottom (80 dp, each button an equal share).
 */
export function tabRect(index: number, count: number, width: number, height: number, insets: EdgeInsets): Rect {
  if (Platform.OS === "ios") {
    const side = 35;
    const each = (width - side * 2) / count;
    const centre = height - Math.max(insets.bottom, 16) - 18;
    return { x: side + each * index + 2, y: centre - 27, width: each - 4, height: 54 };
  }
  const each = width / count;
  const centre = height - insets.bottom - 40;
  return { x: each * index + 4, y: centre - 36, width: each - 8, height: 72 };
}

/** A rounded rectangle as an SVG path, for the hole in the dimmed layer. */
function roundRect({ x, y, width: w, height: h }: Rect, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/**
 * The welcome tour (the fourth meeting's B1, in detail): right after someone first signs in on a phone, the app dims
 * and lights one part of the screen at a time (a tab's button, a class, the Ask button, a result), with a card saying
 * what it is and what to do there. Each step opens its tab, and a result's page, as the person would; a lit part that
 * opens something says "Tap here", and tapping it does what it does in the app. A part that isn't there (no scores
 * yet, one child) is left out. Skip at any step; More's "Take the tour" plays it again. Once finished or skipped it's
 * remembered on the phone for that account (state.ts), and the notifications question waits for it.
 */
export function WelcomeTour({ kind, childCount = 1 }: { kind: TourKind; childCount?: number }) {
  const { settings, viewAs } = useBranch();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { replays } = useTourSignals();
  const [step, setStep] = useState<number | null>(null);
  const tour = useMemo(() => tourFor(kind, settings, childCount), [kind, settings, childCount]);

  const open = useCallback(() => {
    where.tab = -1;
    where.page = null;
    setStep(0);
    tourSignals.setShowing(true);
  }, []);
  const close = useCallback(() => {
    if (where.page) router.back();
    where.tab = -1;
    where.page = null;
    setStep(null);
    tourSignals.setShowing(false);
    if (uid) void markTourSeen(uid, kind);
    router.navigate(tour.tabs[0].href as Href);
  }, [uid, kind, tour]);

  // The first time on this phone (not while an admin views the app as someone else: theirs is their own).
  useEffect(() => {
    if (!uid || viewAs) return;
    let live = true;
    void tourSeen(uid, kind).then((seen) => {
      if (live && !seen) open();
    });
    return () => {
      live = false;
    };
  }, [uid, kind, viewAs, open]);

  // More's "Take the tour".
  const replaysAtStart = useRef(replays);
  useEffect(() => {
    if (replays !== replaysAtStart.current) open();
  }, [replays, open]);

  if (step === null) return null;
  return <TourOverlay tour={tour} step={step} onStep={setStep} onClose={close} />;
}

/** Where the app behind the tour is: its tab, and the page opened from it (a result). One tour shows at a time. */
const where: { tab: number; page: string | null } = { tab: -1, page: null };

interface Shown {
  step: number;
  /** The lit part, or none: the card alone. */
  rect: Rect | null;
  /** What tapping the lit part does, when it opens something. */
  press: (() => void) | null;
}

function TourOverlay({ tour, step, onStep, onClose }: { tour: Tour; step: number; onStep: (step: number) => void; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<Shown | null>(null);
  const way = useRef<1 | -1>(1);
  const st = tour.steps[step];
  const last = tour.steps.length - 1;

  const go = useCallback(
    (to: number) => {
      way.current = to < step ? -1 : 1;
      if (to > last) onClose();
      else if (to >= 0) onStep(to);
    },
    [step, last, onClose, onStep],
  );

  // Each step: the page it isn't on closed, its tab opened, its page opened, then its part found and brought into view.
  useEffect(() => {
    let live = true;
    const alive = () => live;
    const skip = () => {
      if (live) go(step + way.current);
    };
    void (async () => {
      if (where.page && where.page !== st.page) {
        router.back();
        where.page = null;
        await wait(450);
      }
      if (where.tab !== st.tab) {
        router.navigate(tour.tabs[st.tab].href as Href);
        where.tab = st.tab;
        await wait(450);
      }
      if (st.page && where.page !== st.page) {
        const opener = await waitForTarget(st.page, 2500, alive);
        if (!live) return;
        if (!opener?.press) return skip();
        opener.press();
        where.page = st.page;
        await wait(700);
      }
      if (!live) return;
      if (st.at === "tab") return setShown({ step, rect: tabRect(st.tab, tour.tabs.length, width, height, insets), press: null });
      if (!st.at) return setShown({ step, rect: null, press: null });
      const found = await waitForTarget(st.at, st.optional ? 1500 : 2500, alive);
      if (!live) return;
      if (!found) return st.optional ? skip() : setShown({ step, rect: null, press: null });
      const rect = await bringIntoView(found, insets.top, height);
      if (live) setShown({ step, rect, press: st.tap ? found.press : null });
    })();
    return () => {
      live = false;
    };
  }, [step, st, tour, go, width, height, insets]);

  // "Tap here": what the part does in the app, then on. A result opened this way is the next steps' page.
  const next = () => {
    if (shown?.press && st.at) {
      shown.press();
      if (tour.steps[step + 1]?.page === st.at) where.page = st.at;
    }
    go(step + 1);
  };

  const ready = shown?.step === step ? shown : null;
  const rect = ready?.rect ?? null;
  const pad = st.at === "tab" ? 0 : 6;
  const hole = rect ? { x: Math.max(4, rect.x - pad), y: Math.max(4, rect.y - pad), width: Math.min(width - 8, rect.width + pad * 2), height: rect.height + pad * 2 } : null;
  const r = hole ? Math.min(radius.lg + 2, hole.height / 2) : 0;
  const tap = !!ready?.press;

  // The card: under the lit part when it's in the upper half, over it otherwise, in the middle with nothing lit.
  const top = insets.top + space.md;
  const bottom = height - insets.bottom - space.md;
  const below = hole ? hole.y + hole.height / 2 < height * 0.5 : false;
  const room = hole ? (below ? bottom - (hole.y + hole.height + space.lg) : hole.y - space.lg - top) : bottom - top;
  const card = !hole
    ? { top: height * 0.28 }
    : room < 190
      ? { bottom: height - bottom }
      : below
        ? { top: hole.y + hole.height + space.lg + (tap ? 34 : 0) }
        : { bottom: height - hole.y + space.lg + (tap ? 34 : 0) };

  // Android's Back (the button or the edge swipe) goes back a step, as the card's Back does; on the first step it closes
  // the tour, as Skip does. An edge swipe is easily made by accident, and ending the tour is remembered.
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (step > 0 ? go(step - 1) : onClose())}>
      <View style={StyleSheet.absoluteFill} testID="tour" accessibilityViewIsModal>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={`M0 0H${width}V${height}H0Z${hole ? roundRect(hole, r) : ""}`} fill="rgba(8,8,8,0.62)" fillRule="evenodd" />
        </Svg>
        {hole ? <Ring hole={hole} radius={r} key={`ring-${step}`} /> : null}
        {hole && tap ? (
          <>
            <Pressable
              style={[styles.hole, { left: hole.x, top: hole.y, width: hole.width, height: hole.height, borderRadius: r }]}
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel={`${st.title}: tap here`}
              testID="tour-hole"
            />
            <View pointerEvents="none" style={[styles.hint, below ? { top: hole.y + hole.height + 8 } : { top: Math.max(top, hole.y - 38) }, { left: Math.min(Math.max(space.lg, hole.x + hole.width / 2 - 56), width - 112 - space.lg) }]}>
              <Pointer size={15} color="#0a0a0a" />
              <T variant="small" style={styles.hintText}>
                Tap here
              </T>
            </View>
          </>
        ) : null}
        {ready ? (
          <Animated.View
            key={step}
            entering={FadeIn.duration(180)}
            style={[styles.card, card, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: room >= 190 ? room : height * 0.45 }]}
            testID={`tour-step-${step + 1}`}
          >
            <View style={styles.top}>
              <View style={styles.progress}>
                <T variant="small" tone="muted">
                  {tour.tabs[st.tab].label}
                </T>
                <View style={[styles.track, { backgroundColor: colors.secondary }]}>
                  <View style={[styles.fill, { width: `${Math.round(((step + 1) / tour.steps.length) * 100)}%`, backgroundColor: colors.foreground }]} />
                </View>
              </View>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={onClose} testID="tour-skip">
                <T variant="label" tone="muted">
                  Skip
                </T>
              </Pressable>
            </View>
            <ScrollView bounces={false} contentContainerStyle={styles.words} style={styles.scroll}>
              <T variant="heading">{st.title}</T>
              {st.text.map((p) => (
                <T key={p}>{p}</T>
              ))}
            </ScrollView>
            <View style={styles.buttons}>
              {step > 0 ? (
                <Button variant="outline" style={styles.grow} onPress={() => go(step - 1)} testID="tour-back">
                  Back
                </Button>
              ) : null}
              <Button style={styles.grow} onPress={next} testID={step < last ? "tour-next" : "tour-done"}>
                {step < last ? "Next" : "Get started"}
              </Button>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

/** The lit part's edge, breathing slowly so the eye finds it. */
function Ring({ hole, radius: r }: { hole: Rect; radius: number }) {
  const glow = useSharedValue(1);
  useEffect(() => {
    glow.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { left: hole.x - 3, top: hole.y - 3, width: hole.width + 6, height: hole.height + 6, borderRadius: r + 3 }, style]} />;
}

const styles = StyleSheet.create({
  hole: { position: "absolute" },
  ring: { position: "absolute", borderWidth: 2.5, borderColor: "#ffffff" },
  hint: {
    position: "absolute",
    width: 112,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  hintText: { color: "#0a0a0a", fontWeight: "700" },
  card: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  progress: { flex: 1, gap: 6 },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
  scroll: { flexGrow: 0 },
  words: { gap: space.sm },
  buttons: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
});
