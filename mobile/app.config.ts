/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { AndroidConfig, withAndroidManifest, withAppBuildGradle, withAppDelegate, withDangerousMod, withInfoPlist, type ConfigPlugin } from "expo/config-plugins";

/**
 * The phone app's native configuration, read when the native projects are generated (`npx expo run:ios`,
 * `npx expo prebuild`, an EAS build, scripts/phone.mjs) and when the development server starts.
 *
 * Firebase's files for the real project (skyarcacademy) are kept out of git: put them in mobile/firebase/
 * (`npm run phone:setup` downloads them), or give their paths in GOOGLE_SERVICES_PLIST and GOOGLE_SERVICES_JSON (EAS
 * file environment variables). Without them, and in a build for the local emulators (EXPO_PUBLIC_USE_EMULATORS=true),
 * the app is built with the placeholders in firebase/emulator/, which carry no keys and only work against the
 * emulators. See mobile/README.md.
 */
const APP_ID = process.env.APP_ID || "com.skyarcacademy.app";
/** A build under another app id (a developer's own phone signed by a free Apple team) says so on the home screen. */
const APP_NAME = APP_ID === "com.skyarcacademy.app" ? "Sky Arc" : "Sky Arc Dev";

/** What the phone asks before the Scan tab uses the camera or opens the photo library (the only two permissions). */
const CAMERA_PERMISSION = "Sky Arc uses the camera to photograph paper targets and score them.";
const PHOTOS_PERMISSION = "Sky Arc opens the photos of paper targets you choose, to score them.";

/**
 * The version people see and the build number the stores count up, from mobile/release.json: one line to bump for a
 * release (the publishing command does it). When and from which commit a build was made reach the app through
 * EXPO_PUBLIC_BUILT_AT and EXPO_PUBLIC_BUILD_COMMIT instead (src/lib/env.ts), so they never force a native rebuild.
 */
const release = JSON.parse(fs.readFileSync(path.join(__dirname, "release.json"), "utf8")) as { version: string; build: number };

/**
 * A build for the practice copy (EXPO_PUBLIC_USE_EMULATORS=true, as `npm run iphone:sim` makes it) carries the
 * placeholders: the emulators run as the project demo-skyarc, and the native SDKs ask them for the project their file
 * names, so a build carrying the real project's file would find the practice copy empty.
 */
const practice = process.env.EXPO_PUBLIC_USE_EMULATORS === "true";

function servicesFile(envName: string, fileName: string): { file: string; real: boolean } {
  const fromEnv = process.env[envName];
  if (fromEnv) return { file: fromEnv, real: true };
  if (!practice && fs.existsSync(path.join(__dirname, "firebase", fileName))) return { file: `./firebase/${fileName}`, real: true };
  return { file: `./firebase/emulator/${fileName}`, real: false };
}

const plist = servicesFile("GOOGLE_SERVICES_PLIST", "GoogleService-Info.plist");
const json = servicesFile("GOOGLE_SERVICES_JSON", "google-services.json");

function readFile(file: string): string | null {
  const full = path.resolve(__dirname, file);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

/**
 * Google Sign-In on iPhone returns to the app through the reversed iOS client id, which Firebase puts in
 * GoogleService-Info.plist once the iOS app is registered (or GOOGLE_IOS_URL_SCHEME gives it).
 */
function googleUrlScheme(): string | null {
  if (process.env.GOOGLE_IOS_URL_SCHEME) return process.env.GOOGLE_IOS_URL_SCHEME;
  if (!plist.real) return null;
  const m = /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(readFile(plist.file) ?? "");
  return m ? m[1] : null;
}

/**
 * The project's OAuth web client, which Google Sign-In needs for a token Firebase accepts. It is in
 * google-services.json (client_type 3) once an Android app is registered; EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID overrides.
 */
function googleWebClientId(): string {
  if (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!json.real) return "";
  try {
    const services = JSON.parse(readFile(json.file) ?? "{}") as { client?: { oauth_client?: { client_id: string; client_type: number }[] }[] };
    for (const client of services.client ?? []) for (const o of client.oauth_client ?? []) if (o.client_type === 3) return o.client_id;
  } catch {
    // An unreadable file: Google sign-in is left out of this build (the sign-in screen says so).
  }
  return "";
}

const iosUrlScheme = googleUrlScheme();

/**
 * An app built with the iOS 27 SDK stops at launch unless it uses the scene life cycle, and Expo's SDK 57 template does
 * not yet (the `expo` package has its scene delegate; SDK 58's template uses it). This makes the app what that
 * template makes: the app delegate no longer makes the window, and a scene delegate makes it and starts React Native
 * in it. Run after the other plugins, so what they add to the app delegate (Firebase's start) stays. The same change
 * as HyberTec's other Expo apps, which run on iOS 27 phones.
 */
const withSceneLifecycle: ConfigPlugin = (config) =>
  withInfoPlist(
    withAppDelegate(config, (c) => {
      let src = c.modResults.contents;
      if (!src.includes("ExpoAppSceneDelegate")) {
        const steps: [RegExp, string][] = [
          [/class AppDelegate: ExpoAppDelegate \{/, "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {"],
          [/\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)/, ""],
          [/\n[ \t]*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)/, ""],
        ];
        for (const [pattern, replacement] of steps) {
          if (!pattern.test(src)) throw new Error(`withSceneLifecycle: AppDelegate.swift no longer has ${pattern}; update app.config.ts.`);
          src = src.replace(pattern, replacement);
        }
        src += "\n// The window, and React Native in it, under the scene life cycle (app.config.ts, withSceneLifecycle).\n@objc(SceneDelegate)\nclass SceneDelegate: ExpoAppSceneDelegate {}\n";
      }
      c.modResults.contents = src;
      return c;
    }),
    (c) => {
      c.modResults.UIApplicationSceneManifest = {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" }],
        },
      };
      return c;
    },
  );

/**
 * A development build (the simulators') opens straight into the app: otherwise Expo's developer menu introduces itself
 * over the app on each new install and at launch, and its floating Tools button covers the top-right corner. The menu
 * stays a shake away (⌃⌘Z in the iPhone Simulator, or press "m" where the development server runs). A Release build has
 * no developer menu at all.
 */
const DEV_MENU_DEFAULTS = { EXDevMenuIsOnboardingFinished: true, EXDevMenuShowsAtLaunch: false, EXDevMenuShowFloatingActionButton: false } as const;
const withoutDevMenuIntro: ConfigPlugin = (config) =>
  withAndroidManifest(
    withInfoPlist(config, (c) => {
      Object.assign(c.modResults, DEV_MENU_DEFAULTS);
      return c;
    }),
    (c) => {
      const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
      for (const [key, value] of Object.entries(DEV_MENU_DEFAULTS)) AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, key, String(value));
      return c;
    },
  );

/**
 * Google Play's upload key (scripts/publish.mjs makes it on its first Android run: mobile/.publish/upload.keystore,
 * with its passwords in keystore.json, both git-ignored and never on another computer unless copied). When it is there,
 * release builds are signed with it, as Google Play requires; otherwise with the debug key, as a plugged-in phone's
 * are. scripts/phone.mjs fingerprints keystore.json, so making the key regenerates the native project.
 */
const withUploadKey: ConfigPlugin = (config) => {
  const file = path.join(__dirname, ".publish", "keystore.json");
  if (!fs.existsSync(file)) return config;
  const key = JSON.parse(fs.readFileSync(file, "utf8")) as { storeFile?: string; storePassword: string; keyAlias: string; keyPassword: string };
  const storeFile = path.resolve(__dirname, ".publish", key.storeFile ?? "upload.keystore");
  return withAppBuildGradle(config, (c) => {
    // Groovy reads double-quoted strings; the passwords are letters and digits, the path has no quotes.
    const q = (v: string) => JSON.stringify(v);
    let src = c.modResults.contents;
    if (!src.includes("signingConfigs.release")) {
      src = src.replace(
        /signingConfigs \{\n(\s+)debug \{/,
        (_match, indent: string) => `signingConfigs {\n${indent}release {\n${indent}    storeFile file(${q(storeFile)})\n${indent}    storePassword ${q(key.storePassword)}\n${indent}    keyAlias ${q(key.keyAlias)}\n${indent}    keyPassword ${q(key.keyPassword)}\n${indent}}\n${indent}debug {`,
      );
      src = src.replace(/(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/, "$1signingConfig signingConfigs.release");
      if (!src.includes("signingConfigs.release")) throw new Error("withUploadKey: android/app/build.gradle no longer has the signing blocks this expects; update app.config.ts.");
    }
    c.modResults.contents = src;
    return c;
  });
};

/**
 * The practice copy (the emulators on this Mac) speaks plain HTTP, which a Release build of an Android app refuses by
 * default. A Release build is allowed plain HTTP to the emulators' addresses only (10.0.2.2 is how the Android emulator
 * reaches this Mac, 127.0.0.1 a phone through adb reverse); nothing real is ever reached over them. A debug build keeps
 * talking to anything over plain HTTP, as Expo's debug manifest allows.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;
const DEBUG_NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;
const withEmulatorCleartext: ConfigPlugin = (config) =>
  withDangerousMod(
    withAndroidManifest(config, (c) => {
      AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults).$["android:networkSecurityConfig"] = "@xml/network_security_config";
      return c;
    }),
    [
      "android",
      async (c) => {
        for (const [sourceSet, xml] of [["main", NETWORK_SECURITY_CONFIG], ["debug", DEBUG_NETWORK_SECURITY_CONFIG]] as const) {
          const dir = path.join(c.modRequest.platformProjectRoot, "app", "src", sourceSet, "res", "xml");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "network_security_config.xml"), xml);
        }
        return c;
      },
    ],
  );

/** All of the above, wrapped around the whole config so they run after every other plugin. */
const withFinalTouches: ConfigPlugin = (config) => withEmulatorCleartext(withUploadKey(withoutDevMenuIntro(withSceneLifecycle(config))));

export default ({ config }: ConfigContext): ExpoConfig =>
  withFinalTouches({
    ...config,
    name: APP_NAME,
    slug: "skyarc",
    version: release.version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "skyarc",
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: APP_ID,
      buildNumber: String(release.build),
      // The Apple team that signs a build for a phone (`npx expo run:ios --device`): HyberTec LLC's, from Xcode's
      // accounts (scripts/phone.mjs finds it).
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
      googleServicesFile: plist.file,
      // For phones only for now: the stores then ask for no iPad screenshots and no iPad review.
      supportsTablet: false,
      // The app uses only the standard HTTPS kind of encryption (exempt), so App Store Connect never asks the
      // export-compliance question for a build.
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: APP_ID,
      versionCode: release.build,
      googleServicesFile: json.file,
      // The square icon: the white reticle and its red dot on the logo's black.
      adaptiveIcon: {
        backgroundColor: "#0A0A0A",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      // Expo's template and the image picker's own manifest ask for the phone's shared storage and for drawing over
      // other apps. The app uses neither (photos come through Android's photo picker, files stay in the app's own
      // folders), so the only permission it asks people for is the camera.
      blockedPermissions: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.SYSTEM_ALERT_WINDOW"],
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 220,
          backgroundColor: "#ffffff",
          dark: { image: "./assets/images/splash-icon-dark.png", backgroundColor: "#0a0a0a" },
        },
      ],
      // React Native Firebase brings Firebase's iOS SDK in through Swift Package Manager, which needs dynamic frameworks.
      // Expo's modules are built from source rather than taken prebuilt: the prebuilt image module carries SDWebImage
      // without the privacy manifest Apple requires of it (ITMS-91061; docs/publishing/apple/rules.md).
      ["expo-build-properties", { ios: { useFrameworks: "dynamic", usePrecompiledModules: false } }],
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      ...(iosUrlScheme ? [["@react-native-google-signin/google-signin", { iosUrlScheme }] as [string, unknown]] : []),
      // The Scan tab: the camera for a new photo of a paper target, the photo library for one taken before. Photos
      // only: no microphone, no video, no barcode scanner, nothing saved to the library.
      ["expo-camera", { cameraPermission: CAMERA_PERMISSION, microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: false }],
      ["expo-image-picker", { photosPermission: PHOTOS_PERMISSION, cameraPermission: CAMERA_PERMISSION, microphonePermission: false }],
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      // Whether each platform's build carries the real project's Firebase file (see servicesFile).
      firebaseFiles: { ios: plist.real, android: json.real },
      googleWebClientId: googleWebClientId(),
    },
  });
