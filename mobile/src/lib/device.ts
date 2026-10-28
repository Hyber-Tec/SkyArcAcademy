import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "skyarc.device-id";

let deviceId: Promise<string> | null = null;

/** 32 hex digits, at random: the phone's own generator where it has one. */
function randomId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  let id = "";
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/**
 * A random id kept for as long as the app is installed: this install's device doc (users/{uid}/devices/{id}) is named
 * by it, so a new push token replaces the old one in place.
 */
export function getDeviceId(): Promise<string> {
  deviceId ??= (async () => {
    const saved = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
    if (saved) return saved;
    const id = randomId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => undefined);
    return id;
  })();
  return deviceId;
}

/** "1.1.0 (5)": the app's version and build. */
export const appVersion = (): string => `${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`;

/** "Google Pixel 9, Android 16" or "iPhone, iOS 27.0": this phone in the person's list of devices. */
export function deviceLabel(): string {
  if (Platform.OS === "android") {
    const c = Platform.constants as { Manufacturer?: string; Model?: string; Release?: string };
    const model = [c.Manufacturer, c.Model].filter(Boolean).join(" ") || "Android phone";
    return `${model}, Android ${c.Release ?? Platform.Version}`;
  }
  const c = Platform.constants as { systemName?: string; osVersion?: string; interfaceIdiom?: string };
  return `${c.interfaceIdiom === "pad" ? "iPad" : "iPhone"}, ${c.systemName ?? "iOS"} ${c.osVersion ?? Platform.Version}`;
}
