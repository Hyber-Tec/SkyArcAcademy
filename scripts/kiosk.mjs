#!/usr/bin/env node
// The kiosk tablet app (kiosk/, docs/kiosk.md): builds its install file (an APK) and installs it on a tablet over USB.
//
//   npm run kiosk:build                 the real academy's app → kiosk/dist/SkyArcKiosk-<version>.apk
//   npm run kiosk:build -- --practice   the practice copy's (the emulators, from the Android emulator)
//   npm run kiosk:install               installs the newest file on the tablet plugged in (keeps its data)
//
// The app is signed with the kiosk's own key (kiosk/.publish, never in git), made the first time, valid 100 years: a
// later version installs over the first only with the same key, so keep a copy of kiosk/.publish.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kiosk = path.join(root, "kiosk");
const publish = path.join(kiosk, ".publish");
const dist = path.join(kiosk, "dist");
const sdk = process.env.ANDROID_HOME || path.join(process.env.HOME, "Library", "Android", "sdk");
const adb = path.join(sdk, "platform-tools", "adb");
const [command, ...args] = process.argv.slice(2);
const practice = args.includes("--practice");
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: "inherit", ...opts });

function key() {
  const file = path.join(publish, "keystore.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  fs.mkdirSync(publish, { recursive: true });
  const k = { store: path.join(publish, "kiosk.keystore"), alias: "kiosk", password: randomBytes(18).toString("base64url") };
  run("keytool", ["-genkeypair", "-keystore", k.store, "-alias", k.alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "36500",
    "-storepass", k.password, "-keypass", k.password, "-dname", "CN=Sky Arc Kiosk, O=HyberTec LLC"]);
  fs.writeFileSync(file, JSON.stringify(k, null, 2));
  console.log(`Made the kiosk's signing key in ${publish}. Keep a copy: a later version installs only with it.`);
  return k;
}

function build() {
  const env = { ...process.env };
  if (practice) env.KIOSK_API = process.env.KIOSK_API || "http://10.0.2.2:5001/demo-skyarc/us-central1";
  else delete env.KIOSK_API;
  run("npx", ["expo", "prebuild", "-p", "android", "--clean", "--no-install"], { cwd: kiosk, env });
  const k = practice ? null : key();
  const signing = k
    ? [`-Pandroid.injected.signing.store.file=${k.store}`, `-Pandroid.injected.signing.store.password=${k.password}`,
       `-Pandroid.injected.signing.key.alias=${k.alias}`, `-Pandroid.injected.signing.key.password=${k.password}`]
    : [];
  run("./gradlew", ["assembleRelease", "--console=plain", ...signing], { cwd: path.join(kiosk, "android"), env });
  const config = JSON.parse(execFileSync("npx", ["expo", "config", "--json", "--type", "public"], { cwd: kiosk, env, encoding: "utf8" }));
  fs.mkdirSync(dist, { recursive: true });
  const name = `SkyArcKiosk${practice ? "-practice" : ""}-${config.version}-${config.android.versionCode}.apk`;
  const out = path.join(dist, name);
  fs.copyFileSync(path.join(kiosk, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"), out);
  console.log(`\nBuilt ${path.relative(root, out)}`);
}

function install() {
  const files = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith(".apk") && (practice || !f.includes("practice"))) : [];
  const newest = files.map((f) => path.join(dist, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!newest) throw new Error("No install file yet: npm run kiosk:build");
  const serial = args.find((a) => a.startsWith("--serial="))?.slice(9);
  const devices = execFileSync(adb, ["devices"], { encoding: "utf8" }).split("\n").slice(1).filter((l) => /\tdevice$/.test(l)).map((l) => l.split("\t")[0]);
  const target = serial ?? (devices.length === 1 ? devices[0] : null);
  if (!target) throw new Error(devices.length ? `More than one device: add --serial=<one of ${devices.join(", ")}>` : "No tablet found: plug it in with USB debugging on (docs/kiosk.md).");
  // -r keeps the app's data: its registration and any clock-ins not sent yet.
  run(adb, ["-s", target, "install", "-r", newest]);
  console.log(`Installed ${path.basename(newest)} on ${target}.`);
}

if (command === "build") build();
else if (command === "install") install();
else console.log("npm run kiosk:build [-- --practice] | npm run kiosk:install [-- --serial=…]");
