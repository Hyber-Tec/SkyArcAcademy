import type { Lang } from "@shared/i18n";
import { type Href, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { useLangChoice, useT } from "@/lib/lang";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { type TourKind, markTourSeen, tourSeen, tourSignals, useTourSignals } from "./state";
import { type Tour, tourFor } from "./steps";

/** The language step comes first for parents: before it, nobody knows which language to speak. */
const LANGUAGE = -1;

/**
 * The tab bar's height above the screen's bottom inset, left undimmed so the real tab bar shows under the card: iOS 26's
 * floating bar sits partly in the inset; Android's bar is 80 dp above the navigation bar.
 */
const TAB_BAR = Platform.OS === "ios" ? 36 : 80;

/**
 * The welcome tour (the fourth meeting's B1): right after someone first signs in on a phone, a card over the dimmed app
 * walks through their tabs, one step a tab, opening each tab behind it so the real screen shows. Parents choose their
 * language first (the app's too). Skip at any step; More's "Take the tour" plays it again. Once finished or skipped
 * it's remembered on the phone for that account (state.ts), and the notifications question waits for it.
 * `childCount`: a parent's number of children (the step about choosing whose).
 */
export function WelcomeTour({ kind, childCount = 1 }: { kind: TourKind; childCount?: number }) {
  const { settings, viewAs } = useBranch();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { lang } = useLangChoice();
  const t = useT();
  const { replays } = useTourSignals();
  const [step, setStep] = useState<number | null>(null);
  const tour = useMemo(() => tourFor(kind, settings, lang, t, childCount), [kind, settings, lang, t, childCount]);

  const open = useCallback(() => {
    setStep(kind === "parent" ? LANGUAGE : 0);
    tourSignals.setShowing(true);
  }, [kind]);
  const close = () => {
    setStep(null);
    tourSignals.setShowing(false);
    if (uid) void markTourSeen(uid, kind);
    router.navigate(tour.tabs[0].href as Href);
  };

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

  // Each step opens its tab behind the card.
  useEffect(() => {
    if (step === null || step === LANGUAGE) return;
    router.navigate(tour.tabs[tour.steps[step].tab].href as Href);
  }, [step, tour]);

  if (step === null) return null;
  return <TourModal tour={tour} step={step} kind={kind} onStep={setStep} onClose={close} />;
}

function TourModal({ tour, step, kind, onStep, onClose }: { tour: Tour; step: number; kind: TourKind; onStep: (step: number) => void; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang, setLang } = useLangChoice();
  const last = tour.steps.length - 1;
  const first = kind === "parent" ? LANGUAGE : 0;
  const choose = (choice: Lang) => {
    setLang(choice);
    onStep(0);
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.fill} testID="tour">
        <View style={[styles.dim, { paddingTop: insets.top + space.lg }]}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ScrollView bounces={false} contentContainerStyle={styles.content}>
              {step === LANGUAGE ? (
                <View style={styles.gap} testID="tour-language">
                  <T variant="heading">Welcome to Sky Arc</T>
                  <T variant="heading">Sky Arc에 오신 걸 환영해요</T>
                  <T tone="muted">Choose your language. · 사용할 언어를 골라 주세요.</T>
                  <View style={styles.languages}>
                    <Button size="lg" variant={lang === "en" ? "default" : "outline"} onPress={() => choose("en")} testID="tour-lang-en">
                      English
                    </Button>
                    <Button size="lg" variant={lang === "ko" ? "default" : "outline"} onPress={() => choose("ko")} testID="tour-lang-ko">
                      한국어
                    </Button>
                  </View>
                  <T variant="small" tone="muted">
                    You can change it later in More. · 나중에 더보기에서 바꿀 수 있어요.
                  </T>
                </View>
              ) : (
                <View style={styles.gap} testID={`tour-step-${step + 1}`}>
                  <View style={styles.top}>
                    <T variant="small" tone="muted">
                      {step + 1} / {tour.steps.length}
                    </T>
                    <Pressable accessibilityRole="button" hitSlop={12} onPress={onClose} testID="tour-skip">
                      <T variant="label" tone="muted">
                        {t("Skip", "건너뛰기")}
                      </T>
                    </Pressable>
                  </View>
                  <T variant="heading">{tour.steps[step].title}</T>
                  {tour.steps[step].text.map((p) => (
                    <T key={p}>{p}</T>
                  ))}
                  <TabStrip tour={tour} current={tour.steps[step].tab} />
                </View>
              )}
            </ScrollView>
            {step === LANGUAGE ? null : (
              <View style={styles.buttons}>
                {step > first ? (
                  <Button variant="outline" style={styles.grow} onPress={() => onStep(step - 1)} testID="tour-back">
                    {t("Back", "뒤로")}
                  </Button>
                ) : null}
                <Button style={styles.grow} onPress={() => (step < last ? onStep(step + 1) : onClose())} testID={step < last ? "tour-next" : "tour-done"}>
                  {step < last ? t("Next", "다음") : t("Get started", "시작하기")}
                </Button>
              </View>
            )}
          </View>
        </View>
        {/* The real tab bar shows here, undimmed; the card's small tab bar marks the step's tab. */}
        <View style={{ height: TAB_BAR + insets.bottom }} />
      </View>
    </Modal>
  );
}

/** The tab bar in small, the step's tab marked: where to find it at the bottom of the screen. */
function TabStrip({ tour, current }: { tour: Tour; current: number }) {
  const colors = useColors();
  return (
    <View style={[styles.strip, { backgroundColor: colors.accent }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {tour.tabs.map((tab, i) => {
        const on = i === current;
        const Icon = tab.icon;
        return (
          <View key={tab.name} style={[styles.tab, on && { backgroundColor: colors.card }]}>
            <Icon size={18} color={on ? colors.foreground : colors.mutedForeground} strokeWidth={on ? 2.4 : 2} />
            <T variant="tiny" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: on ? colors.foreground : colors.mutedForeground, fontWeight: on ? "700" : "500" }}>
              {tab.label}
            </T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.md, paddingBottom: space.md, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", maxHeight: "86%" },
  content: { padding: space.xl, paddingBottom: space.md },
  gap: { gap: space.md },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  languages: { gap: space.sm, marginTop: space.xs },
  strip: { flexDirection: "row", borderRadius: radius.lg, padding: space.xs, gap: space.xs, marginTop: space.xs },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.md },
  buttons: { flexDirection: "row", gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xl, paddingTop: space.sm },
  grow: { flex: 1 },
});
