import * as Brightness from "expo-brightness";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar, setStatusBarHidden } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { Path, SvgXml } from "react-native-svg";
import { autoOutFor } from "@shared/kiosk/tablet";
import type { KioskPerson } from "@shared/kiosk/tablet";
import { formatDuration, formatInstant, formatInstantTime } from "@shared/time";
import { API, APP_VERSION } from "./api";
import { LOGO_BLACK, LOGO_RATIO, LOGO_WHITE } from "./brand";
import { isSetupPin, now, openShifts, punch, register, start, sync, unregister, useKiosk, whoIs } from "./store";

/**
 * Sky Arc Kiosk: the front desk's time clock (docs/kiosk.md). The website's kiosk, made a tablet app: a coach taps,
 * types their PIN and clocks in or out. It keeps the screen on and bright, hides Android's bars, and works the same
 * without the internet: what it records waits on the tablet and goes to the academy once it's back.
 */

type Screen = { kind: "welcome" } | { kind: "pin" } | { kind: "action"; person: KioskPerson } | { kind: "done"; message: string };

const C = { black: "#0A0A0A", red: "#B91C1C", green: "#047857", ink: "#171717", muted: "#525252", line: "#D4D4D4", paper: "#F5F5F5", white: "#FFFFFF" };
const IDLE_MS = 30_000;
const NEW_YORK = "America/New_York";

export function App() {
  useKeepAwake();
  const k = useKiosk();
  const { width, height } = useWindowDimensions();
  const wide = width > height;

  useEffect(() => {
    void start();
    // Android shows its bars again after a restart or another app: hide them whenever the kiosk is in front.
    const immersive = () => {
      setStatusBarHidden(true, "none");
      void NavigationBar.setVisibilityAsync("hidden").catch(() => undefined);
      void Brightness.setBrightnessAsync(1).catch(() => undefined);
    };
    immersive();
    const sub = AppState.addEventListener("change", (s) => s === "active" && immersive());
    return () => sub.remove();
  }, []);

  if (!k.ready) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: C.black }]}>
        <StatusBar hidden />
        <ActivityIndicator color={C.white} size="large" />
      </View>
    );
  }
  return (
    <View style={[styles.fill, { backgroundColor: C.paper }]}>
      <StatusBar hidden />
      {k.device ? <Clock wide={wide} /> : <Setup wide={wide} />}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the time clock

function Clock({ wide }: { wide: boolean }) {
  const k = useKiosk();
  const tz = k.server?.timeZone ?? NEW_YORK;
  const pinLength = k.server?.pinLength ?? 4;
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback(() => {
    setScreen({ kind: "welcome" });
    setPin("");
    setError(null);
  }, []);
  // Back to the welcome screen after a while: nobody is left at someone else's clock-in.
  const bump = useCallback(() => {
    clearTimeout(idle.current);
    idle.current = setTimeout(reset, IDLE_MS);
  }, [reset]);
  useEffect(() => {
    if (screen.kind === "pin" || screen.kind === "action") bump();
    return () => clearTimeout(idle.current);
  }, [screen.kind, bump]);

  async function typed(value: string) {
    setBusy(true);
    setError(null);
    try {
      if (k.removed) return setError("This tablet isn’t registered with the academy anymore. Ask the office.");
      if (!k.server) return setError("This tablet hasn’t reached the academy yet. Connect it to the internet.");
      const person = await whoIs(value);
      if (!person) return setError("PIN not found. Try again.");
      setScreen({ kind: "action", person });
    } finally {
      setPin("");
      setBusy(false);
    }
  }

  function press(key: string) {
    bump();
    if (busy) return;
    if (key === "clear") return setPin("");
    if (key === "back") return setPin((p) => p.slice(0, -1));
    const next = pin + key;
    if (next.length > pinLength) return;
    setPin(next);
    if (next.length === pinLength) void typed(next);
  }

  async function clock(person: KioskPerson) {
    setBusy(true);
    try {
      const { op, clockInAt } = await punch(person);
      const first = person.name.split(" ")[0];
      const time = formatInstantTime(op.at, tz);
      setScreen({
        kind: "done",
        message:
          op.kind === "in"
            ? `${first} clocked in at ${time}.`
            : `${first} clocked out at ${time}.${clockInAt ? ` Worked ${formatDuration((op.at - clockInAt) / 60_000)}.` : ""}`,
      });
      setTimeout(reset, (k.server?.successReturnSeconds ?? 3) * 1000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.fill}>
      <Header tz={tz} onAdmin={() => setAdmin(true)} />
      <View style={[styles.fill, styles.center, { padding: 24 }]}>
        {screen.kind === "welcome" ? <Welcome onStart={() => setScreen({ kind: "pin" })} /> : null}
        {screen.kind === "pin" ? <PinPad wide={wide} pin={pin} length={pinLength} busy={busy} error={error} onKey={press} onBack={reset} /> : null}
        {screen.kind === "action" ? <Action person={screen.person} tz={tz} busy={busy} onClock={() => void clock(screen.person)} onBack={reset} /> : null}
        {screen.kind === "done" ? <Done message={screen.message} /> : null}
      </View>
      <AdminMenu open={admin} onClose={() => setAdmin(false)} tz={tz} />
    </View>
  );
}

function Header({ tz, onAdmin }: { tz: string; onAdmin: () => void }) {
  const k = useKiosk();
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const timer = setInterval(() => setT(now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const waiting = k.pending.length;
  const status = k.removed
    ? { text: "Not registered", color: C.red }
    : !k.online || k.problem
      ? { text: waiting ? `Offline · ${waiting} waiting to send` : "Offline · clock-ins are saved here", color: "#B45309" }
      : waiting
        ? { text: `Sending ${waiting}…`, color: "#1D4ED8" }
        : { text: "Online", color: C.green };
  return (
    <View style={styles.header}>
      {/* Hold the logo for 3 seconds: the admin menu, with the setup PIN. */}
      <Pressable onLongPress={onAdmin} delayLongPress={3000} accessibilityLabel="Sky Arc Sports Academy">
        <SvgXml xml={LOGO_WHITE} width={44 * LOGO_RATIO} height={44} />
      </Pressable>
      <Text style={styles.headerTitle}>Time clock</Text>
      <View style={[styles.pill, { borderColor: status.color }]}>
        <View style={[styles.dot, { backgroundColor: status.color }]} />
        <Text style={styles.pillText}>{status.text}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.headerDate}>{formatInstant(t, tz, { weekday: "long", month: "long", day: "numeric" })}</Text>
        <Text style={styles.headerTime}>{formatInstant(t, tz, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</Text>
      </View>
    </View>
  );
}

/** Drifts a few pixels every minute, so a screen that's always on never keeps one picture burned in. */
function useDrift() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => s + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const spots = [
    [0, 0],
    [10, 6],
    [-8, 10],
    [6, -10],
    [-10, -4],
  ];
  const [x, y] = spots[step % spots.length];
  return { transform: [{ translateX: x }, { translateY: y }] };
}

function Welcome({ onStart }: { onStart: () => void }) {
  const drift = useDrift();
  const { width } = useWindowDimensions();
  const logoW = Math.min(520, width * 0.6);
  return (
    <Pressable style={[styles.fill, styles.center, { alignSelf: "stretch" }]} onPress={onStart} accessibilityRole="button" accessibilityLabel="Tap to clock in or out">
      <View style={[styles.center, drift]}>
        <SvgXml xml={LOGO_BLACK} width={logoW} height={logoW / LOGO_RATIO} />
        <Text style={styles.tap}>Tap anywhere to begin</Text>
      </View>
    </Pressable>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

function PinPad(p: { wide: boolean; pin: string; length: number; busy: boolean; error: string | null; onKey: (k: string) => void; onBack: () => void }) {
  return (
    <View style={[styles.pinWrap, { flexDirection: p.wide ? "row" : "column" }]}>
      <View style={[styles.center, { flex: p.wide ? 1 : undefined, marginBottom: p.wide ? 0 : 28 }]}>
        <Text style={styles.h2}>Enter your {p.length}-digit PIN</Text>
        <View style={styles.dots}>
          {Array.from({ length: p.length }, (_, i) => (
            <View key={i} style={[styles.box, p.pin.length > i && styles.boxOn]}>
              <Text style={styles.boxText}>{p.pin.length > i ? "•" : ""}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 28, marginTop: 14 }}>{p.busy ? <ActivityIndicator color={C.ink} /> : <Text style={styles.error}>{p.error ?? ""}</Text>}</View>
        <Pressable onPress={p.onBack} style={styles.link}>
          <Text style={styles.linkText}>Back</Text>
        </Pressable>
      </View>
      <View style={[styles.keys, { flex: p.wide ? 1 : undefined }]}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            disabled={p.busy}
            onPress={() => p.onKey(key)}
            accessibilityRole="button"
            accessibilityLabel={key === "back" ? "Delete" : key === "clear" ? "Clear" : key}
            style={({ pressed }) => [styles.key, /\d/.test(key) ? styles.keyDigit : styles.keyOther, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Text style={/\d/.test(key) ? styles.keyText : styles.keyTextSmall}>{key === "back" ? "⌫" : key === "clear" ? "Clear" : key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Action({ person, tz, busy, onClock, onBack }: { person: KioskPerson; tz: string; busy: boolean; onClock: () => void; onBack: () => void }) {
  const k = useKiosk();
  const open = openShifts()[person.staffId];
  const autoOut = open ? null : autoOutFor(k.server, k.pending, person.staffId);
  const line = open
    ? `Clocked in at ${formatInstantTime(open.clockInAt, tz)}`
    : autoOut
      ? `Clocked out automatically at ${formatInstantTime(autoOut, tz)}`
      : "Currently clocked out";
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>Welcome, {person.name.split(" ")[0]}</Text>
      <Text style={styles.sub}>{line}</Text>
      <Pressable
        disabled={busy}
        onPress={onClock}
        accessibilityRole="button"
        style={({ pressed }) => [styles.big, { backgroundColor: open ? C.red : C.green }, (pressed || busy) && { opacity: 0.85 }]}
      >
        {busy ? <ActivityIndicator color={C.white} size="large" /> : <Text style={styles.bigText}>{open ? "CLOCK OUT" : "CLOCK IN"}</Text>}
      </Pressable>
      <Pressable onPress={onBack} style={styles.link}>
        <Text style={styles.linkText}>Back</Text>
      </Pressable>
    </View>
  );
}

function Done({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <View style={styles.check}>
        <Svg width={72} height={72} viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 6 9 17l-5-5" />
        </Svg>
      </View>
      <Text style={[styles.h2, { textAlign: "center", marginTop: 24 }]}>{message}</Text>
      <Text style={[styles.sub, { marginTop: 10 }]}>Returning to the welcome screen…</Text>
    </View>
  );
}

// -------------------------------------------------------------------------------------------- setup and the admin menu

function Setup({ wide }: { wide: boolean }) {
  const k = useKiosk();
  const [name, setName] = useState("Front desk");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await register(pin, name.trim() || "Front desk");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPin("");
    }
  }
  return (
    <ScrollView contentContainerStyle={[styles.center, { flexGrow: 1, padding: 32 }]} keyboardShouldPersistTaps="handled">
      <SvgXml xml={LOGO_BLACK} width={wide ? 360 : 280} height={(wide ? 360 : 280) / LOGO_RATIO} />
      <Text style={[styles.h2, { marginTop: 28 }]}>Set up this tablet</Text>
      <Text style={[styles.sub, { textAlign: "center", maxWidth: 560 }]}>
        Type the academy’s setup PIN. An admin sets it on the website, in Settings → Pay & time clock → Kiosk.
        {k.pending.length ? ` ${k.pending.length} clock-ins recorded here are waiting: they’re sent once it’s registered.` : ""}
      </Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tablet name" maxLength={60} accessibilityLabel="Tablet name" />
      <TextInput
        style={[styles.input, { letterSpacing: 6 }]}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
        placeholder="Setup PIN"
        keyboardType="number-pad"
        secureTextEntry
        accessibilityLabel="Setup PIN"
      />
      <Pressable disabled={busy || pin.length < 4} onPress={() => void go()} style={[styles.button, (busy || pin.length < 4) && { opacity: 0.5 }]}>
        {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.buttonText}>Register this tablet</Text>}
      </Pressable>
      <Text style={[styles.error, { marginTop: 16, textAlign: "center" }]}>{error ?? ""}</Text>
      <Text style={styles.fine}>Server: {API}</Text>
    </ScrollView>
  );
}

function AdminMenu({ open, onClose, tz }: { open: boolean; onClose: () => void; tz: string }) {
  const k = useKiosk();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setPin("");
    setUnlocked(false);
    setError(null);
    onClose();
  };
  async function check(value: string) {
    setPin(value);
    if (value.length >= 4 && (await isSetupPin(value))) {
      Keyboard.dismiss();
      setUnlocked(true);
    }
    else if (value.length === 8) setError("That’s not the setup PIN.");
  }
  const fmt = (ms: number) => formatInstant(ms, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // Android's Back closes it. An overlay, not a Modal: a Modal is a window of its own, and with Android's bars hidden it
  // closed by itself on the tablet.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (close(), true));
    return () => sub.remove();
  });
  if (!open) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(0,0,0,0.55)", padding: 24 }]}>
        <View style={styles.sheet}>
          <Text style={styles.h2}>Admin</Text>
          {!unlocked ? (
            <>
              <Text style={styles.sub}>Type the setup PIN this tablet was registered with.</Text>
              <TextInput
                style={[styles.input, { letterSpacing: 6 }]}
                value={pin}
                onChangeText={(v) => void check(v.replace(/\D/g, "").slice(0, 8))}
                keyboardType="number-pad"
                secureTextEntry
                autoFocus
                accessibilityLabel="Setup PIN"
              />
              <Text style={styles.error}>{error ?? ""}</Text>
            </>
          ) : (
            <ScrollView style={{ maxHeight: 420, alignSelf: "stretch" }}>
              <Text style={styles.info}>Tablet: {k.device?.name}</Text>
              <Text style={styles.info}>App: {APP_VERSION}</Text>
              <Text style={styles.info}>Server: {API}</Text>
              <Text style={styles.info}>Last sync: {k.lastSyncAt ? fmt(k.lastSyncAt) : "never"}</Text>
              <Text style={styles.info}>Waiting to send: {k.pending.length}</Text>
              <Text style={styles.info}>Coaches with a PIN: {k.server?.people.length ?? 0}</Text>
              {k.problem ? <Text style={[styles.info, { color: C.red }]}>Last problem: {k.problem}</Text> : null}
              {k.refused.length ? (
                <>
                  <Text style={[styles.info, { fontWeight: "700", marginTop: 12 }]}>Not saved by the academy</Text>
                  {k.refused.map((r) => (
                    <Text key={r.op.id} style={styles.info}>
                      {k.server?.people.find((p) => p.staffId === r.op.staffId)?.name ?? "Someone"}, {r.op.kind === "in" ? "clock-in" : "clock-out"} {fmt(r.op.at)}: {r.reason}
                    </Text>
                  ))}
                </>
              ) : null}
            </ScrollView>
          )}
          <View style={styles.row}>
            {unlocked ? (
              <>
                <Pressable style={styles.button} onPress={() => void sync()}>
                  <Text style={styles.buttonText}>Sync now</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.buttonQuiet]} onPress={() => void Linking.sendIntent("android.settings.SETTINGS").catch(() => undefined)}>
                  <Text style={[styles.buttonText, { color: C.ink }]}>Android settings</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, { backgroundColor: C.red }]}
                  onPress={() => {
                    void unregister();
                    close();
                  }}
                >
                  <Text style={styles.buttonText}>Register again</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={[styles.button, styles.buttonQuiet]} onPress={close}>
              <Text style={[styles.buttonText, { color: C.ink }]}>Close</Text>
            </Pressable>
          </View>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18, justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: C.black, paddingHorizontal: 28, paddingTop: 26, paddingBottom: 18 },
  headerTitle: { flex: 1, color: "#D4D4D4", fontSize: 16, fontWeight: "600", borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.2)", paddingLeft: 14 },
  headerDate: { color: C.white, fontSize: 15, fontWeight: "500" },
  headerTime: { color: C.white, fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { color: C.white, fontSize: 14, fontWeight: "600" },
  tap: { marginTop: 28, fontSize: 22, color: C.muted },
  pinWrap: { alignItems: "center", justifyContent: "center", gap: 32, width: "100%", maxWidth: 1000 },
  h1: { fontSize: 44, fontWeight: "800", color: C.ink },
  h2: { fontSize: 28, fontWeight: "700", color: C.ink },
  sub: { fontSize: 20, color: C.muted, marginTop: 10 },
  dots: { flexDirection: "row", gap: 14, marginTop: 24 },
  box: { width: 68, height: 68, borderRadius: 18, borderWidth: 2, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  boxOn: { borderColor: C.ink },
  boxText: { fontSize: 34, fontWeight: "800", color: C.ink },
  error: { color: C.red, fontSize: 17, fontWeight: "600" },
  link: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 12 },
  linkText: { fontSize: 20, color: C.muted, fontWeight: "600" },
  keys: { flexDirection: "row", flexWrap: "wrap", width: 3 * 116 + 2 * 12, gap: 12 },
  key: { width: 116, height: 88, borderRadius: 20, alignItems: "center", justifyContent: "center", elevation: 1 },
  keyDigit: { backgroundColor: C.white },
  keyOther: { backgroundColor: "#E5E5E5" },
  keyText: { fontSize: 36, fontWeight: "700", color: C.ink },
  keyTextSmall: { fontSize: 22, fontWeight: "600", color: "#404040" },
  big: { marginTop: 32, width: 440, maxWidth: "90%", height: 176, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4 },
  bigText: { color: C.white, fontSize: 52, fontWeight: "900", letterSpacing: 1 },
  check: { width: 132, height: 132, borderRadius: 66, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  input: { marginTop: 16, width: 360, maxWidth: "100%", height: 60, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 18, fontSize: 22, color: C.ink },
  button: { marginTop: 20, minWidth: 200, height: 58, borderRadius: 14, backgroundColor: C.black, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  buttonQuiet: { backgroundColor: "#E5E5E5" },
  buttonText: { color: C.white, fontSize: 19, fontWeight: "700" },
  fine: { marginTop: 24, fontSize: 13, color: "#737373" },
  sheet: { backgroundColor: C.white, borderRadius: 24, padding: 28, width: 640, maxWidth: "100%", alignItems: "center" },
  info: { fontSize: 17, color: C.ink, marginTop: 6 },
});
