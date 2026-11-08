import type { ExpoConfig } from "expo/config";

/**
 * Sky Arc Kiosk: the time clock on the front desk's Android tablet (docs/kiosk.md). Installed from a file over USB, never
 * from a store. It's the tablet's home screen, so it opens by itself after a restart.
 *
 * KIOSK_API: where its server is. Unset, the real academy's Cloud Functions; for the practice copy, the functions
 * emulator as the Android emulator reaches it, e.g. http://10.0.2.2:5001/demo-skyarc/us-central1.
 */
const api = process.env.KIOSK_API || "https://us-central1-skyarcacademy.cloudfunctions.net";
const practice = !api.startsWith("https://");

const config: ExpoConfig = {
  name: practice ? "Kiosk (practice)" : "Sky Arc Kiosk",
  slug: "skyarc-kiosk",
  version: "1.0.1",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#0A0A0A",
  android: {
    package: practice ? "com.skyarcacademy.kiosk.practice" : "com.skyarcacademy.kiosk",
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: "#0A0A0A",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    // The tablet's home screen: Android opens it after a restart or a power cut, and Home comes back to it.
    intentFilters: [{ action: "MAIN", category: ["HOME", "DEFAULT"] }],
    // The kiosk's key and the coaches' PIN fingerprints never leave the tablet in a backup.
    allowBackup: false,
    // Only the internet and the network's state: nothing the kiosk doesn't use (expo-brightness asks for system settings,
    // but the app sets only its own window's brightness).
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.WRITE_SETTINGS",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  plugins: [
    "expo-secure-store",
    // The practice copy's server is plain http on the computer; the real one is https only.
    ["expo-build-properties", { android: { usesCleartextTraffic: practice } }],
  ],
  extra: { api, branchId: process.env.KIOSK_BRANCH || "skyarc" },
};

export default config;
