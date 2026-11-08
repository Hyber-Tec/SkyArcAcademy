import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { kioskPinInput, type KioskOp } from "@shared/kiosk/ops";
import { type KioskOpResult, type KioskPerson, type KioskServerState, type KioskView, clockOffset, punchOp, stillPending, tabletView } from "@shared/kiosk/tablet";
import { APP_VERSION, BRANCH_ID, ServerError, call } from "./api";

/**
 * What the tablet keeps, and its syncing (docs/kiosk/). A clock-in or clock-out is saved on the tablet first, so it
 * works the same without the internet, then sent; the server applies each one once, with the time it happened. Saved
 * in the app's own storage, which Android keeps private and out of backups (app.config.ts).
 */

interface Device {
  deviceId: string;
  token: string;
  name: string;
  /** The setup PIN it was registered with, as a fingerprint: it opens the admin menu, offline too. */
  adminHash: string;
}

interface Saved {
  server: KioskServerState | null;
  /** Recorded, not yet answered by the server, oldest first. */
  pending: KioskOp[];
  /** How far the tablet's clock is behind the server's (ms). */
  offset: number;
  lastSyncAt: number | null;
  /** Ops the server refused, newest first (the admin menu shows them; the server's activity log has them too). */
  refused: { op: KioskOp; reason: string }[];
}

export interface KioskState extends Saved {
  ready: boolean;
  device: Device | null;
  online: boolean;
  syncing: boolean;
  /** The last sync's problem, if it failed. */
  problem: string | null;
  /** The server said this tablet isn't registered (anymore): it must be registered again. */
  removed: boolean;
}

const SAVED_KEY = "kiosk:v1";
const DEVICE_KEY = "kiosk.device";
const SYNC_EVERY_MS = 60_000;

let state: KioskState = { ready: false, device: null, server: null, pending: [], offset: 0, lastSyncAt: null, refused: [], online: true, syncing: false, problem: null, removed: false };
const listeners = new Set<() => void>();
function set(next: Partial<KioskState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
async function save() {
  const { server, pending, offset, lastSyncAt, refused } = state;
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify({ server, pending, offset, lastSyncAt, refused } satisfies Saved));
}

export function useKiosk(): KioskState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
export const kiosk = () => state;

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
/** The tablet's clock, corrected by the server's. */
export const now = () => Date.now() + state.offset;

let started = false;
/** Loads what the tablet kept, then syncs every minute and whenever the internet comes back. */
export async function start() {
  if (started) return;
  started = true;
  const [raw, device] = await Promise.all([AsyncStorage.getItem(SAVED_KEY), SecureStore.getItemAsync(DEVICE_KEY)]);
  const saved = raw ? (JSON.parse(raw) as Saved) : null;
  set({ ...(saved ?? {}), device: device ? (JSON.parse(device) as Device) : null, ready: true });
  NetInfo.addEventListener((s) => {
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    const back = online && !state.online;
    set({ online });
    if (back) void sync();
  });
  setInterval(() => void sync(), SYNC_EVERY_MS);
  void sync();
}

/** Registers this tablet with the setup PIN, then syncs once to learn who can clock in. */
export async function register(setupPin: string, name: string) {
  const res = await call<{ deviceId: string; token: string }>("kioskEnroll", { branchId: BRANCH_ID, setupPin, name, appVersion: APP_VERSION });
  const device: Device = { deviceId: res.deviceId, token: res.token, name, adminHash: await sha256(`skyarc-kiosk-setup:${res.deviceId}:${setupPin}`) };
  await SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(device));
  set({ device, removed: false, problem: null });
  await sync();
}

/** Whether a PIN is the setup PIN this tablet was registered with (the admin menu). */
export async function isSetupPin(pin: string): Promise<boolean> {
  const d = state.device;
  return !!d && (await sha256(`skyarc-kiosk-setup:${d.deviceId}:${pin}`)) === d.adminHash;
}

/** Forgets the registration (the admin menu). Clock-ins not sent yet stay, and go once it's registered again. */
export async function unregister() {
  await SecureStore.deleteItemAsync(DEVICE_KEY);
  set({ device: null, removed: false });
}

/** The coach a PIN belongs to, from what the server sent at the last sync: works without the internet. */
export async function whoIs(pin: string): Promise<KioskPerson | null> {
  const hash = await sha256(kioskPinInput(BRANCH_ID, pin));
  return state.server?.people.find((p) => p.pinHash === hash) ?? null;
}

/** Who's clocked in now, and who was clocked out automatically, as the tablet sees it (shared/src/kiosk/tablet.ts). */
export const view = (): KioskView => tabletView(state.server, state.pending, now());

/** Clocks a coach in, or out when they're in: saved on the tablet at once, then sent. */
export async function punch(person: KioskPerson): Promise<{ op: KioskOp; clockInAt: number | null }> {
  const { open } = view();
  const id = Crypto.randomUUID();
  const op = punchOp(person.staffId, open, now(), id);
  const clockInAt = op.kind === "out" ? (open[person.staffId]?.clockInAt ?? null) : null;
  set({ pending: [...state.pending, op] });
  await save();
  void sync();
  return { op, clockInAt };
}

let syncing: Promise<void> | null = null;
let again = false;
/** Sends what's waiting and takes the server's view. One at a time; asked during one, it runs once more after. */
export function sync(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function syncOnce() {
  const device = state.device;
  if (!device) return;
  const sending = state.pending.slice(0, 200);
  set({ syncing: true });
  const sentAt = Date.now();
  try {
    const res = await call<{ results: KioskOpResult[]; state: KioskServerState }>("kioskSync", {
      branchId: BRANCH_ID,
      deviceId: device.deviceId,
      token: device.token,
      ops: sending,
      appVersion: APP_VERSION,
    });
    const refused = res.results
      .filter((r) => r.status === "rejected")
      .map((r) => ({ op: sending.find((o) => o.id === r.opId)!, reason: r.reason ?? "refused" }))
      .filter((r) => r.op);
    set({
      server: res.state,
      // Ops recorded while this sync ran stay, with every op the server didn't answer.
      pending: stillPending(state.pending, res.results),
      offset: clockOffset(res.state.serverTime, sentAt, Date.now()),
      lastSyncAt: Date.now(),
      refused: [...refused, ...state.refused].slice(0, 20),
      problem: null,
      removed: false,
      online: true,
    });
    await save();
  } catch (e) {
    if (e instanceof ServerError && (e.status === "UNAUTHENTICATED" || e.status === "PERMISSION_DENIED")) set({ removed: true, problem: e.message });
    else set({ problem: e instanceof Error ? e.message : String(e) });
  } finally {
    set({ syncing: false });
  }
}
