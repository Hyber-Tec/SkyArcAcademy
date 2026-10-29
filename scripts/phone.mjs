#!/usr/bin/env node
/**
 * The Sky Arc phone app (mobile/) with one command. Everything it needs is checked first and, where a command can do
 * it, done: its packages, the skyarcacademy project's Firebase files, a new build only when something native changed,
 * and for the simulators the practice copy of Sky Arc. Then the app opens. Written for someone who has never done
 * mobile development: docs/running-the-apps.md explains every step and what to do when one stops.
 *
 *   npm run iphone             the iPhone plugged into this Mac: the real Sky Arc's app, built and installed over the cable
 *   npm run android            the Android phone plugged into this Mac, the same way
 *   npm run iphone:sim         the iPhone Simulator on this Mac, on the practice copy (local emulators, sample academy)
 *   npm run android:sim        the Android emulator on this Mac, on the practice copy
 *   npm run iphone:sim:live    the iPhone Simulator, on the real Sky Arc (real sign-in, real data)
 *   npm run android:sim:live   the Android emulator, on the real Sky Arc
 *   npm run phone:test         the app's test flows (mobile/maestro), on the simulator or emulator a practice copy runs on
 *   npm run phone:setup        gets this Mac ready and says what is left, without opening anything
 *   npm run publish:screenshots  every image the App Store and Google Play ask for, from the practice copy
 *                                (mobile/.publish/screenshots); -- --iphone or -- --android makes one store's again
 *
 * scripts/publish.mjs (npm run publish:iphone, publish:android) uses `prepare ios|android` here to get the native
 * project ready the same way these commands do, so the stores get what a phone gets.
 *
 * Options, after `--` (npm run iphone:sim -- --fresh): --fresh fills the practice copy again (the academy and its sample
 * data, as of today) and signs the app out first; --rebuild makes the native project again and builds the app from
 * scratch.
 *
 * A phone gets a Release build, with the app's code inside it as the App Store's will have, so it works away from this
 * Mac, signed by HyberTec LLC's Apple team (an iPhone keeps opening it for a year). The simulators get a development
 * build, which takes the app's code from this Mac as it changes. The practice copy and the real one each get their
 * own simulator ("Sky Arc Practice", "Sky Arc Live") and emulator, so a sign-in on one never meets the other. The
 * practice copy (the Firebase emulators, as the project demo-skyarc) starts as the academy with its sample data on the
 * day it starts, and forgets what was done in it when it stops. Ctrl+C stops the development server and what this
 * command started; the simulator stays open.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobile = path.join(root, "mobile");
const bin = (name) => path.join(mobile, "node_modules", ".bin", name);
const stateDir = path.join(mobile, ".expo"); // git-ignored (mobile/.gitignore)
const logDir = path.join(stateDir, "logs");
const stateFile = path.join(stateDir, "phone.json");

/** The app's id (app.config.ts), under which it is registered in Firebase and with Apple and Google. */
const APP_ID = "com.skyarcacademy.app";
/** The real project, and the one the emulators run as (the practice copy, CLAUDE.md "Commands"). */
const PROJECT = "skyarcacademy";
const EMULATOR_PROJECT = "demo-skyarc";
/** The academy's one ID (shared/src/academy.ts). */
const ACADEMY_ID = "skyarc";
/** The app's two registrations in the skyarcacademy Firebase project (Firebase console → Project settings → Your apps). */
const FIREBASE_APP = { ios: "1:1025403274020:ios:e9806988e82e53cb6ae9b1", android: "1:1025403274020:android:bbcc3273a22750b66ae9b1" };
const FIREBASE_FILE = { ios: "GoogleService-Info.plist", android: "google-services.json" };
/**
 * HyberTec LLC's paid Apple team, the only one that signs Sky Arc (APPLE_TEAM_ID chooses another one, for a team that
 * takes the app over). The Apple ID on it may belong to other teams too (another company's, a free personal one):
 * those never sign it, as they would register the app's id to themselves.
 */
const APPLE_TEAM = { id: process.env.APPLE_TEAM_ID || "YSK7CHH56P", name: process.env.APPLE_TEAM_ID ? "your Apple team" : "HyberTec LLC" };
/** The practice copy: the Firebase emulators on firebase.json's ports (mobile/src/lib/env.ts uses the same). */
const EMULATORS = { auth: 9099, firestore: 8080, functions: 5001, storage: 9199 };
/** The website on the practice copy (npm run dev:emulators), where mobile/src/lib/env.ts sends the app's links. */
const WEBSITE_PORT = 5174;
const METRO_PORT = { practice: 8081, live: 8082 };
const SIMULATOR = { practice: "Sky Arc Practice", live: "Sky Arc Live", screenshots: "Sky Arc Screenshots" };
const AVD = { practice: "SkyArc_Practice", live: "SkyArc_Live", screenshots: "SkyArc_Screenshots" };
/** Android 16, the version Expo SDK 57 targets, with Google Play for Google sign-in and push notifications. */
const ANDROID_IMAGE = `system-images;android-36;google_apis_playstore;${process.arch === "arm64" ? "arm64-v8a" : "x86_64"}`;
const ANDROID_PHONE = "pixel_9";
/** Java 17 builds the Android app, as Expo's setup guide says; Android Studio's own Java is the fallback. */
const JAVA17 = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const STUDIO_JAVA = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
/** Java 21 runs the Firebase emulators, as scripts/e2e.sh starts them. */
const JAVA21 = "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
const PLATFORM = { ios: "iPhone", android: "Android" };
/**
 * The practice copy's logins, all made up (reserved .test addresses): its owner, made by `npm run seed`, and a coach, a
 * parent and a student from the sample data (shared/src/sample/data.ts), to see the app as they do. They share one password, made
 * at random on this Mac the first time and kept in mobile/.expo/practice-login.json (git-ignored, never in the
 * repository); the commands print it.
 */
const PRACTICE_OWNER = { email: "owner@example.test", name: "Test Owner" };
const PRACTICE_LOGINS = [
  { ...PRACTICE_OWNER, role: "owner" },
  { email: "paige.sutton@skyarc-sample.test", name: "Paige Sutton", role: "admin" },
  { email: "daniel.reed@skyarc-sample.test", name: "Daniel Reed", role: "coach" },
  { email: "jiyeon.hwang@skyarc-sample.test", name: "Jiyeon Hwang", role: "parent" },
  { email: "seoyeon.lim@skyarc-sample.test", name: "Seoyeon Lim", role: "student" },
];
const PRACTICE_PASSWORD_FILE = path.join(stateDir, "practice-login.json");
/** The flows the others run as steps (mobile/maestro): not tests of their own. */
const STEP_FLOWS = new Set(["dev-connect.yaml", "sign-in.yaml"]);

const [command = "help", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const names = rest.filter((a) => !a.startsWith("--"));
const platform = { iphone: "ios", ios: "ios", android: "android" }[command] ?? null;
const onSim = flags.has("--sim");
/** A phone always runs the real Sky Arc; a simulator the practice copy, unless --live. */
const mode = flags.has("--live") || (platform !== null && !onSim) || command === "prepare" ? "live" : "practice";
const fresh = flags.has("--fresh");
const rebuild = flags.has("--rebuild");

const step = (text) => console.log(`\n▸ ${text}`);
const ok = (text) => console.log(`  ✓ ${text}`);
const note = (text) => console.log(`  • ${text}`);

/** A problem explained in plain words: printed as it is, then the command stops. */
class Stop extends Error {}
function stop(lines) {
  throw new Stop([lines].flat().join("\n"));
}
/** Ctrl+C while a command ran (a build, an install): what this command started is stopped too. */
class Interrupted extends Error {}

/** Runs a command with its output on screen (an install, a build). False when it fails, or stops with `problem`. */
function run(cmd, args, { cwd = root, env = process.env, problem, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, input, stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"] });
  if (r.signal === "SIGINT" || r.signal === "SIGTERM" || r.status === 130) throw new Interrupted();
  if (r.status === 0) return true;
  if (problem) stop(problem);
  return false;
}

/** A command's output, or null when it fails (or does not exist). */
function read(cmd, args, { cwd = root, env = process.env, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
  return r.status === 0 ? r.stdout : null;
}

const has = (cmd) => spawnSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An address's answer, whatever its status ({ status, text }), or null when nothing answers. */
async function answer(url, init = {}) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
    return { status: r.status, text: await r.text() };
  } catch {
    return null;
  }
}

/** The text of a successful answer, or null. */
async function responds(url) {
  const r = await answer(url);
  return r && r.status >= 200 && r.status < 300 ? r.text : null;
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

/** What listens on a port of this Mac: its process id, command line and folder, or null. */
function listener(port) {
  const pid = read("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])?.trim().split("\n")[0];
  if (!pid) return null;
  const cwd = (read("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]) ?? "").split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? "";
  return { pid: Number(pid), command: (read("ps", ["-o", "command=", "-p", pid]) ?? "").trim(), cwd };
}

const programName = (who) => (who ? ` (${path.basename(who.command.split(" ")[0])})` : "");

/** Polls `check` until it gives something, or calls `timedOut` (which stops). */
async function waitFor(check, ms, timedOut) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value;
    await sleep(1000);
  }
  return timedOut();
}

function tail(file, lines = 25) {
  try {
    return fs.readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function logFile(name) {
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, name);
}

// ---------------------------------------------------------------------------------------------------------------
// The processes this command started, stopped together when it ends (Ctrl+C, or the development server closing).

const started = [];
let stopping = null;

function keep(child, signal = "SIGTERM") {
  started.push({ child, signal });
  return child;
}

function stopAll() {
  stopping ??= (async () => {
    const running = started.filter(({ child }) => child.exitCode === null && child.signalCode === null);
    const gone = Promise.all(running.map(({ child }) => new Promise((resolve) => child.once("exit", resolve))));
    for (const { child, signal } of running) {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    }
    if (running.length) console.log("\nStopping what this command started…");
    await Promise.race([gone, sleep(30_000)]);
    try {
      if (JSON.parse(fs.readFileSync(sessionFile(mode), "utf8")).pid === process.pid) fs.rmSync(sessionFile(mode));
    } catch {
      /* none of ours */
    }
  })();
  return stopping;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => void stopAll().then(() => process.exit(signal === "SIGINT" ? 130 : 143)));
}

// ---------------------------------------------------------------------------------------------------------------
// This Mac and the repository.

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    stop(`The phone app needs Node.js 22.13 or newer; this Mac has ${process.versions.node}. Install the current LTS from https://nodejs.org and run this again.`);
  }
}

/**
 * Whether a folder's installed packages are the ones its package-lock.json lists, by npm's own record of what it
 * installed (node_modules/.package-lock.json). Packages for other computers (optional ones) don't count.
 */
function packagesMatch(dir) {
  try {
    const wanted = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")).packages ?? {};
    const have = JSON.parse(fs.readFileSync(path.join(dir, "node_modules", ".package-lock.json"), "utf8")).packages ?? {};
    return Object.entries(wanted).every(([key, p]) => !key || p.optional || p.devOptional || p.link || have[key]?.version === p.version);
  } catch {
    return false;
  }
}

/**
 * A folder's npm packages, installed exactly as its package-lock.json says (`npm ci`) when they are missing or differ
 * from it. A lock file that is only newer (touched by git, or by npm without a change) doesn't count: `npm ci` empties
 * node_modules first, under anything running from it (a development server in another window).
 */
function ensurePackages(dir, label) {
  const lock = path.join(dir, "package-lock.json");
  const installed = path.join(dir, "node_modules", ".package-lock.json");
  if (fs.existsSync(installed) && (fs.statSync(installed).mtimeMs >= fs.statSync(lock).mtimeMs || packagesMatch(dir))) return;
  step(`Installing ${label}'s packages`);
  run("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: dir,
    problem: `Installing ${label}'s packages failed (the lines above say why). Check the internet connection and run this again.`,
  });
}

/** KEY=value lines as Expo reads them: comments and blank lines skipped, surrounding quotes taken off. */
function envFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return env;
}

/** mobile/.env and mobile/.env.local, as Expo reads them (the shell's own variables win over both). */
const mobileEnv = () => ({ ...envFile(path.join(mobile, ".env")), ...envFile(path.join(mobile, ".env.local")) });

const signInToFirebase = () =>
  has("firebase")
    ? `Sign in to the Firebase CLI with the Google account that can open the ${PROJECT} project (in Terminal: firebase login), then run this again.`
    : `Install the Firebase CLI (in Terminal: npm install -g firebase-tools), sign in with the Google account that can open the ${PROJECT} project (firebase login), then run this again.`;

/**
 * The skyarcacademy project's Firebase files for the app, in mobile/firebase/ (git-ignored: they hold the project's
 * API key), downloaded with the Firebase CLI when missing; with `refresh` (npm run phone:setup), downloaded again and
 * replaced if they changed in the Firebase console. Without them the app is built with the keyless placeholders in
 * mobile/firebase/emulator/, which only work on the practice copy.
 */
function ensureFirebaseFiles({ required, refresh = false }) {
  const missing = (p) => !fs.existsSync(path.join(mobile, "firebase", FIREBASE_FILE[p]));
  const wanted = Object.keys(FIREBASE_FILE).filter((p) => refresh || missing(p));
  if (!wanted.length) return true;
  step(refresh ? `The app's Firebase files, as the ${PROJECT} project has them` : `Downloading the ${PROJECT} project's Firebase files for the app`);
  for (const p of wanted) {
    const file = path.join(mobile, "firebase", FIREBASE_FILE[p]);
    const temp = `${file}.download`;
    fs.rmSync(temp, { force: true });
    const got = has("firebase") && read("firebase", ["apps:sdkconfig", p.toUpperCase(), FIREBASE_APP[p], "--project", PROJECT, "--out", temp]) !== null && fs.existsSync(temp);
    if (got) {
      const had = !missing(p);
      const same = had && fs.readFileSync(file).equals(fs.readFileSync(temp));
      if (same) fs.rmSync(temp);
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.renameSync(temp, file);
      }
      ok(`mobile/firebase/${FIREBASE_FILE[p]}${same ? " (up to date)" : had ? " (updated from the Firebase console)" : ""}`);
    } else {
      fs.rmSync(temp, { force: true });
      if (!missing(p)) note(`Couldn't check mobile/firebase/${FIREBASE_FILE[p]} with the Firebase CLI; the one on this Mac stays. ${signInToFirebase()}`);
    }
  }
  const still = Object.values(FIREBASE_FILE).filter((f) => !fs.existsSync(path.join(mobile, "firebase", f)));
  if (!still.length) return true;
  const how = [
    `The ${PROJECT} project's Firebase files are missing: ${still.map((f) => `mobile/firebase/${f}`).join(", ")}.`,
    signInToFirebase(),
    `Or download them yourself: docs/running-the-apps.md, "A brand new Mac".`,
  ];
  if (required) stop(how);
  how.forEach(note);
  return false;
}

/** The app's packages, and the project's Firebase files (required for the real Sky Arc). */
function prepareApp() {
  ensurePackages(mobile, "the phone app");
  ensureFirebaseFiles({ required: mode === "live" });
}

/**
 * When, and from which commit, the app is being built or started (mobile/src/lib/env.ts), for telling which version is
 * on a device. Given to the app through its environment, never through app.config.ts: that file is fingerprinted, and
 * a value that changes every build would make the native project again every time.
 */
function buildStamp() {
  return { EXPO_PUBLIC_BUILT_AT: new Date().toISOString(), EXPO_PUBLIC_BUILD_COMMIT: read("git", ["rev-parse", "--short", "HEAD"])?.trim() ?? "" };
}

/** Whether google-services.json carries the project's web client, which Google sign-in needs (app.config.ts reads it). */
function googleSignInReady() {
  if (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || mobileEnv().EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) return true;
  try {
    const json = JSON.parse(fs.readFileSync(path.join(mobile, "firebase", FIREBASE_FILE.android), "utf8"));
    return json.client.some((c) => (c.oauth_client ?? []).some((o) => o.client_type === 3));
  } catch {
    return false;
  }
}

/**
 * What the app is told when it starts (the EXPO_PUBLIC_ values mobile/src/lib/env.ts reads): the practice copy (the
 * emulators on this Mac, email and password only) or the real Sky Arc.
 *
 * mobile/.env.local (for running Expo by hand, mobile/README.md) must not say which copy to use: in a development build,
 * Expo gives the app that file's values over these, so the real copy's simulator would talk to the practice copy, or
 * the other way round.
 */
function appSettings(which) {
  for (const file of [".env", ".env.development", ".env.local", ".env.development.local", ".env.production", ".env.production.local"]) {
    const value = envFile(path.join(mobile, file)).EXPO_PUBLIC_USE_EMULATORS;
    if (value !== undefined && (value === "true") !== (which === "practice")) {
      stop([
        `mobile/${file} says EXPO_PUBLIC_USE_EMULATORS=${value}, and Expo lets that file decide over this command, so the app would use`,
        `${which === "practice" ? "the real Sky Arc instead of the practice copy" : "the practice copy instead of the real Sky Arc"}. Delete that line from mobile/${file} (these commands choose`,
        `by themselves; the line is only for running Expo by hand), then run this again. Claude Code can do it for you.`,
      ]);
    }
  }
  if (which === "live" && !googleSignInReady()) {
    note("The app's Firebase files have no Google sign-in client, so this build signs in with email and password only (mobile/README.md, \"Against the real project\").");
  }
  return { EXPO_PUBLIC_USE_EMULATORS: which === "practice" ? "true" : "false", EXPO_PUBLIC_EMULATOR_HOST: "", EXPO_PUBLIC_WEB_URL: "", ...buildStamp() };
}

// ---------------------------------------------------------------------------------------------------------------
// Building only when needed.

function filesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== ".DS_Store")
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

/**
 * Fingerprints of what the native app is built from: the packages, app.config.ts and the settings it reads, the version
 * and build number, Google Play's upload key, icons and splash images (`base`), and which copy of Sky Arc the build
 * talks to (`full`: the practice copy's keyless Firebase files, or the real project's). A change to the app's own code
 * is in neither: it reaches a simulator's app through the development server, with no new native build, and a phone's
 * with its next Release build.
 */
function nativeFingerprint(p, env) {
  const all = { ...mobileEnv(), ...env };
  const add = (hash, file) => fs.existsSync(file) && hash.update(path.relative(mobile, file)).update(fs.readFileSync(file));
  const base = crypto.createHash("sha256").update(p);
  // release.json holds the version and build number app.config.ts puts in the native project; .publish/keystore.json
  // says whether Android release builds are signed with Google Play's upload key (scripts/publish.mjs makes it).
  for (const f of ["package.json", "package-lock.json", "app.config.ts", "release.json", ...(p === "android" ? [".publish/keystore.json"] : [])]) add(base, path.join(mobile, f));
  for (const dir of ["assets", "firebase/emulator", "modules", "plugins"]) filesIn(path.join(mobile, dir)).forEach((f) => add(base, f));
  for (const key of ["APP_ID", "APPLE_TEAM_ID", "APPLE_PERSONAL_TEAM", "GOOGLE_IOS_URL_SCHEME"]) base.update(`${key}=${all[key] ?? ""}\n`);
  const baseHex = base.digest("hex").slice(0, 16);
  // The practice copy runs as the project demo-skyarc, so its builds carry the placeholders (app.config.ts).
  const practice = all.EXPO_PUBLIC_USE_EMULATORS === "true";
  const full = crypto.createHash("sha256").update(baseHex).update(`practice=${practice}\n`);
  const own = p === "ios" ? all.GOOGLE_SERVICES_PLIST : all.GOOGLE_SERVICES_JSON;
  if (!practice || own) add(full, own ? path.resolve(mobile, own) : path.join(mobile, "firebase", FIREBASE_FILE[p]));
  for (const key of ["GOOGLE_SERVICES_PLIST", "GOOGLE_SERVICES_JSON"]) full.update(`${key}=${all[key] ?? ""}\n`);
  return { base: baseHex, full: full.digest("hex").slice(0, 16), practice };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/** The npm command that was run, for messages ("npm run iphone:sim"). */
function commandName() {
  if (command === "prepare") return `npm run publish:${names[0] === "android" ? "android" : "iphone"}`;
  if (command === "screenshots") return "npm run publish:screenshots";
  if (command === "test") return "npm run phone:test";
  if (command === "setup") return "npm run phone:setup";
  const base = platform === "ios" ? "iphone" : (platform ?? command);
  return `npm run ${base}${onSim ? ":sim" : ""}${onSim && mode === "live" ? ":live" : ""}`;
}

const buildProblem = (p) => [
  `The ${PLATFORM[p]} app didn't build. The lines just above say why.`,
  `docs/running-the-apps.md, "When a build fails", has what to try. Or ask Claude Code: "${commandName()} fails, please fix it".`,
];

/** Makes the native project (mobile/ios or mobile/android: generated, git-ignored) again when what it is built from changed. */
function ensureNativeProject(p, env) {
  const { base, full, practice } = nativeFingerprint(p, env);
  const state = readState();
  const s = (state[p] ??= {});
  if (rebuild || s.base !== base || !fs.existsSync(path.join(mobile, p))) {
    step(`Preparing the ${PLATFORM[p]} project${s.project ? " (something native changed)" : ""}`);
    run(bin("expo"), ["prebuild", "--platform", p, "--clean"], { cwd: mobile, env: { ...env, CI: "1" }, problem: buildProblem(p) });
    state[p] = { base, project: full, installed: {} };
    writeState(state);
  } else if (s.project !== full) {
    // Only the copy of Sky Arc the build talks to changed: its Firebase files and the settings around them are updated
    // in place, and what was compiled stays, so the build after it is a short one.
    step(`Pointing the ${PLATFORM[p]} project at ${practice ? "the practice copy" : "the real Sky Arc"}`);
    run(bin("expo"), ["prebuild", "--platform", p], { cwd: mobile, env: { ...env, CI: "1" }, problem: buildProblem(p) });
    state[p] = { ...s, base, project: full };
    writeState(state);
  }
  return full;
}

/** Builds the app and installs it on a simulator or emulator, unless it already has this build. */
function buildIfNeeded(p, device, env) {
  const fingerprint = ensureNativeProject(p, env);
  const state = readState();
  const installed = (state[p].installed ??= {});
  if (!rebuild && installed[device.id] === fingerprint && device.hasApp()) {
    ok(`The app on ${device.name} is up to date`);
    return;
  }
  step(`Building the app and installing it on ${device.name} (the first build takes 5 to 15 minutes; later ones are quicker)`);
  run(bin("expo"), [`run:${p}`, "--device", device.expoName, "--no-bundler", ...(rebuild ? ["--no-build-cache"] : [])], {
    cwd: mobile,
    env: { ...env, CI: "1" },
    problem: buildProblem(p),
  });
  installed[device.id] = fingerprint;
  writeState(state);
}

/**
 * Gradle keeps the app's last JavaScript bundle while no file of the app changed, though what the app is told (which
 * copy of Sky Arc it talks to, when it was built) is inside it. Removed before every Android Release build, so the
 * bundle is always made for this one: a screenshots build talks to the practice copy, and a phone's or Google Play's
 * never may.
 */
function freshJsBundle() {
  for (const dir of ["generated/assets/react/release", "generated/res/react/release"]) {
    fs.rmSync(path.join(mobile, "android", "app", "build", dir), { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The practice copy: the Firebase emulators (as the project demo-skyarc) with Sky Arc's server code and rules, the
// academy with its sample data and the practice logins, and the website on them.

/**
 * Whether Sky Arc's practice copy answers: the Firestore and Auth emulators, and the functions emulator serving this
 * project's functions (asked for one it doesn't have, it lists the ones it has).
 */
async function practiceCopyRunning() {
  const [firestore, auth, functions] = await Promise.all([
    answer(`http://127.0.0.1:${EMULATORS.firestore}/`),
    answer(`http://127.0.0.1:${EMULATORS.auth}/`),
    answer(`http://127.0.0.1:${EMULATORS.functions}/${EMULATOR_PROJECT}/us-central1/phone-check`),
  ]);
  return firestore?.text.trim() === "Ok" && !!auth?.text.includes("authEmulator") && !!functions?.text.includes("sendAccountEmail");
}

/** The practice logins' password: made at random on this Mac the first time, kept in mobile/.expo (git-ignored). */
function practicePassword() {
  try {
    const saved = JSON.parse(fs.readFileSync(PRACTICE_PASSWORD_FILE, "utf8")).password;
    if (typeof saved === "string" && saved.length >= 8) return saved;
  } catch {
    /* none yet */
  }
  const password = `practice-${crypto.randomBytes(6).toString("hex")}`;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(PRACTICE_PASSWORD_FILE, `${JSON.stringify({ password, note: "The practice copy's logins (the emulators on this Mac only). Never in git." }, null, 2)}\n`);
  return password;
}

async function startPracticeCopy() {
  if (await practiceCopyRunning()) {
    ok("The practice copy of Sky Arc is already running (another window, or Claude Code, started it)");
  } else {
    for (const [name, port] of Object.entries({ ...EMULATORS, database: 9000 })) {
      if (!(await portBusy(port))) continue;
      stop([
        `Port ${port}, where the practice copy's ${name} emulator runs, is taken by another program${programName(listener(port))}, and the practice copy isn't answering there.`,
        `If a Terminal window still runs an old practice copy (npm run emulators), press Ctrl+C in it (or close it), then run this again. Or ask Claude Code: "the practice copy's ports are taken".`,
      ]);
    }
    if (!fs.existsSync(path.join(JAVA21, "bin", "java"))) stop(["The practice copy needs Java 21. In Terminal: brew install openjdk@21", "Then run this again."]);
    if (!has("firebase")) stop(`The practice copy needs the Firebase CLI. In Terminal: npm install -g firebase-tools`);
    ensurePackages(path.join(root, "functions"), "the server code");
    step("Starting the practice copy of Sky Arc (the sample academy, made-up people, on this Mac only)");
    run("npm", ["--prefix", "functions", "run", "--silent", "build"], {
      problem: `The server code (functions/) didn't build. The lines above say why. Ask Claude Code to fix it.`,
    });
    const log = logFile("emulators.log");
    const out = fs.openSync(log, "w");
    const env = { ...process.env, JAVA_HOME: JAVA21, PATH: `${JAVA21}/bin:${process.env.PATH}` };
    // As `npm run emulators` starts them, in their own process group, so they stop once, from stopAll, and cleanly (a
    // second Ctrl+C would cut them short).
    keep(spawn("firebase", ["emulators:start", "--only", "auth,firestore,database,functions,storage", "--project", EMULATOR_PROJECT], { cwd: root, env, stdio: ["ignore", out, out], detached: true }), "SIGINT");
    await waitFor(
      practiceCopyRunning,
      180_000,
      () => stop([`The practice copy didn't start. The end of its log (${path.relative(root, log)}):`, "", tail(log), "", `Ask Claude Code: "the practice copy won't start".`]),
    );
    ok("The practice copy is running");
  }
  await loadRules();
  await fillPracticeCopy();
}

/** Today's firestore.rules in the Firestore emulator: one started elsewhere may hold older ones. */
async function loadRules() {
  const content = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  const r = await answer(`http://127.0.0.1:${EMULATORS.firestore}/emulator/v1/projects/${EMULATOR_PROJECT}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  if (r?.status !== 200) note(`Couldn't give the practice copy today's firestore.rules (${r ? `HTTP ${r.status}` : "no answer"}); it keeps the rules it had.`);
}

/** A login with a password and a confirmed email in the Auth emulator: made, or brought up to date. */
async function practiceLogin(login, password) {
  const base = `http://127.0.0.1:${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/projects/${EMULATOR_PROJECT}`;
  const call = async (pathname, body) => {
    const r = await fetch(`${base}${pathname}`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Auth emulator ${pathname}: ${r.status} ${text}`);
    return JSON.parse(text || "{}");
  };
  const found = await call("/accounts:lookup", { email: [login.email] });
  const user = found.users?.[0];
  if (user) await call("/accounts:update", { localId: user.localId, password, displayName: login.name, emailVerified: true });
  else await call("/accounts", { email: login.email, password, displayName: login.name, emailVerified: true });
}

/**
 * The academy and its first owner (scripts/seed.ts), its sample data as of today (scripts/seed-sample.ts) and the
 * practice logins, when the practice copy doesn't have them yet, or again with --fresh. Both scripts write to the
 * emulators only: the environment says so (SKYARC_PROJECT and the emulator hosts).
 */
async function fillPracticeCopy() {
  // The practice owner's access to the academy, read as the emulator's owner (past the rules).
  const member = await answer(`http://127.0.0.1:${EMULATORS.firestore}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/branches/${ACADEMY_ID}/members/${PRACTICE_OWNER.email}`, {
    headers: { Authorization: "Bearer owner" },
  });
  const there = member?.status === 200;
  const password = practicePassword();
  if (!there || fresh) {
    ensurePackages(root, "the repository's tools");
    step(there ? "Filling the practice copy again, as of today (--fresh)" : "Filling the practice copy: the academy, its sample data as of today, and the practice logins");
    const env = {
      ...process.env,
      SKYARC_PROJECT: EMULATOR_PROJECT,
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${EMULATORS.firestore}`,
      FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${EMULATORS.auth}`,
      FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${EMULATORS.storage}`,
      STORAGE_EMULATOR_HOST: `127.0.0.1:${EMULATORS.storage}`,
    };
    const log = logFile("practice-fill.log");
    fs.writeFileSync(log, "");
    const steps = [
      ["scripts/seed.ts", "--owner", PRACTICE_OWNER.email, "--owner-name", PRACTICE_OWNER.name],
      ["scripts/seed-sample.ts"],
    ];
    for (const [script, ...args] of steps) {
      const r = spawnSync(path.join(root, "node_modules", ".bin", "tsx"), [script, ...args], { cwd: root, env, encoding: "utf8" });
      if (r.signal === "SIGINT") throw new Interrupted();
      fs.appendFileSync(log, `$ tsx ${script} ${args.join(" ")}\n${r.stdout ?? ""}${r.stderr ?? ""}\n`);
      if (r.status !== 0) {
        stop([`Filling the practice copy didn't work (${script}). The end of its log (${path.relative(root, log)}):`, "", tail(log, 12), "", `Ask Claude Code: "the practice copy won't fill".`]);
      }
    }
    ok("The academy, its sample coaches, students, families and classes around today, and their scores");
  } else {
    ok("The academy and its sample data are there");
  }
  // Right after the sample data goes in, the emulators are still running its hundreds of triggers, and the Auth
  // emulator (in the same process) may not answer for a while: try again for up to two minutes before giving up.
  try {
    for (const login of PRACTICE_LOGINS) {
      for (let tries = 1; ; tries++) {
        try {
          await practiceLogin(login, password);
          break;
        } catch (e) {
          if (!(e instanceof TypeError) || tries >= 30) throw e;
          await sleep(4000);
        }
      }
    }
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message;
    stop([`The practice logins couldn't be made in the Auth emulator: ${e.message}${cause ? ` (${cause})` : ""}`, `Ask Claude Code: "the practice logins don't work".`]);
  }
  ok(`The practice logins: ${PRACTICE_LOGINS.map((l) => `${l.email} (${l.role})`).join(", ")}`);
}

/** How to sign in on the practice copy, printed when the app opens. */
function practiceLoginLines() {
  const password = practicePassword();
  return [
    `  Sign in with an email and password (no Google on the practice copy). The password of each is ${password}`,
    ...PRACTICE_LOGINS.map((l) => `    ${l.email.padEnd(34)} ${l.role === "owner" ? "the owner: the staff's tabs, everything" : l.role === "admin" ? "an admin: the staff's tabs, the office's view" : l.role === "coach" ? "a coach: the staff's tabs, a coach's view" : `a ${l.role}: the family's tabs`}`),
  ];
}

/**
 * The website on the practice copy (`npm run dev:emulators`), where the rest of the office's work is: the app's links
 * to the website lead there (mobile/src/lib/env.ts), and that is where to make changes the app should show.
 */
async function startPracticeWebsite() {
  if (await portBusy(WEBSITE_PORT)) {
    ok(`A local website is already running at http://127.0.0.1:${WEBSITE_PORT}`);
    return;
  }
  ensurePackages(path.join(root, "web"), "the website");
  const out = fs.openSync(logFile("website.log"), "w");
  const vite = path.join(root, "web", "node_modules", ".bin", "vite");
  keep(spawn(vite, ["--host", "127.0.0.1", "--port", String(WEBSITE_PORT), "--strictPort"], { cwd: path.join(root, "web"), env: { ...process.env, VITE_USE_EMULATORS: "1" }, stdio: ["ignore", out, out], detached: true }));
  ok(`The practice website: http://127.0.0.1:${WEBSITE_PORT}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The development server (Metro), which serves the app's code to the simulator or emulator.

const sessionFile = (which) => path.join(stateDir, `phone-session-${which}.json`);

/** The development server a command in another window is running for the same copy, if any. */
async function runningSession(which) {
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile(which), "utf8"));
    process.kill(session.pid, 0);
    if ((await responds(`http://127.0.0.1:${session.port}/status`))?.includes("packager-status:running")) return session;
  } catch {
    /* none */
  }
  return null;
}

/** Frees the development server's port from one left over by an earlier run of this app (never another program's). */
async function freePort(port) {
  if (!(await portBusy(port))) return;
  const who = listener(port);
  if (who && who.cwd === mobile && /expo|metro/i.test(who.command)) {
    process.kill(who.pid, "SIGTERM");
    await waitFor(async () => !(await portBusy(port)), 10_000, () => null);
    return;
  }
  stop(`Port ${port}, which the app's development server uses, is taken by another program${programName(who)}. Close it and run this again.`);
}

async function startMetro(which, env, device) {
  const port = METRO_PORT[which];
  await freePort(port);
  step("Starting the development server (it sends the app its code; keep this window open while you use the app)");
  const metro = keep(spawn(bin("expo"), ["start", "--dev-client", "--port", String(port)], { cwd: mobile, env, stdio: "inherit" }), "SIGINT");
  metro.on("exit", (code) => void stopAll().then(() => process.exit(code ?? 0)));
  await waitFor(
    async () => (await responds(`http://127.0.0.1:${port}/status`))?.includes("packager-status:running"),
    120_000,
    () => stop("The development server didn't start. The lines above say why."),
  );
  // What `npm run phone:test` needs to find this app: which device, and the server's port.
  fs.writeFileSync(sessionFile(which), JSON.stringify({ pid: process.pid, port, platform, device: device.testId, appId: APP_ID }));
  return port;
}

/** The address a development build opens to load its code from this Mac. */
const devClientUrl = (port) => `exp+skyarc://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${port}`)}`;

/**
 * Opens the app on the simulator or emulator, on this copy of Sky Arc: with the practice copy and the development
 * server this command starts (and stops with Ctrl+C), or with those a command in another window runs for the same copy.
 */
async function session(p, openDevice, env) {
  const running = await runningSession(mode);
  if (mode === "practice") {
    await startPracticeCopy();
    if (!running) await startPracticeWebsite();
  }
  const device = await openDevice();
  if (fresh) {
    const removed = device.signOut();
    const state = readState();
    if (removed && state[p]?.installed) delete state[p].installed[device.id];
    writeState(state);
    ok("Signed the app out (--fresh)");
  }
  buildIfNeeded(p, device, env);
  const port = running?.port ?? (await startMetro(mode, env, device));
  if (!device.open(port)) note(`Couldn't open the app by itself: tap Sky Arc on ${device.name}.`);
  else if (p === "ios") note(`If the simulator asks "Open in “Sky Arc”?", click Open.`);
  console.log(`\n✓ Sky Arc is open on ${device.name}, on ${mode === "practice" ? "the practice copy (the sample academy, on this Mac)" : "the REAL Sky Arc"}.`);
  if (mode === "practice") {
    for (const line of practiceLoginLines()) console.log(line);
    console.log(`  The practice website (the rest of the office's work): http://127.0.0.1:${WEBSITE_PORT}; in its browser console, __skyarcSignIn("${PRACTICE_OWNER.email}")`);
    console.log("  signs in as the owner. Nothing here reaches the real Sky Arc.");
  } else {
    console.log("  Sign in with Google or with an email and password. This is the real Sky Arc: what you do in it is real.");
  }
  if (running && !started.length) {
    console.log(`  It shares the development server running in the other window; stop that one to stop both.`);
    process.exit(0);
  }
  if (running) {
    // The other window's development server, but this window had to start the practice copy: it stays until Ctrl+C.
    console.log("  It shares the development server running in the other window. This window runs the practice copy: press Ctrl+C here to stop it.\n");
    return;
  }
  console.log("  Changes to the app's code show up by themselves. Press Ctrl+C here to stop.\n");
}

// ---------------------------------------------------------------------------------------------------------------
// iPhone: Xcode, HyberTec's Apple team, the simulator, and a real iPhone.

function developerDir() {
  if (process.env.DEVELOPER_DIR) return process.env.DEVELOPER_DIR;
  const selected = read("xcode-select", ["-p"])?.trim();
  if (selected?.includes(".app/")) return selected;
  const apps = fs.existsSync("/Applications") ? fs.readdirSync("/Applications").filter((a) => /^Xcode.*\.app$/.test(a)) : [];
  const app = apps.includes("Xcode.app") ? "Xcode.app" : apps.sort().at(-1);
  return app ? `/Applications/${app}/Contents/Developer` : null;
}

/** Xcode, ready to build (licence agreed, first launch done), as the environment every Apple tool runs in. */
function xcode() {
  const dir = developerDir();
  if (!dir || !fs.existsSync(dir)) {
    stop([
      "Xcode isn't installed yet. It comes from the Mac App Store:",
      "  1. Open the App Store app and sign in with your Apple ID (bottom-left corner).",
      "  2. Search for Xcode, click Get, then Install. It is a large download.",
      "  3. When it has finished, open Xcode once and click Agree. Then run this again.",
    ]);
  }
  // Points Apple's tools at Xcode even while the Mac's own setting still points at the smaller Command Line Tools.
  const env = { ...process.env, DEVELOPER_DIR: dir };
  const version = spawnSync("xcodebuild", ["-version"], { env, encoding: "utf8" });
  if (version.status !== 0) {
    stop(
      /licen[cs]e/i.test(`${version.stdout}${version.stderr}`)
        ? ["Xcode needs you to agree to its licence once: open Xcode (Applications → Xcode), click Agree and enter your Mac password.", "Then run this again."]
        : ["Xcode is there but doesn't run yet. If it is still installing, wait until the App Store says it is done;", "otherwise open Xcode once, let it finish, then run this again."],
    );
  }
  if (spawnSync("xcodebuild", ["-checkFirstLaunchStatus"], { env, stdio: "ignore" }).status !== 0) {
    stop(["Xcode still needs to finish setting itself up: open Xcode once (Applications → Xcode). If it asks to install components, click Install and enter your Mac password.", "Then run this again."]);
  }
  return env;
}

function ensureCocoaPods() {
  if (has("pod")) return;
  if (!has("brew")) stop(["The iPhone app needs CocoaPods, which is installed with Homebrew. Install Homebrew first (https://brew.sh), then run this again."]);
  step("Installing CocoaPods (it fetches the iPhone app's libraries)");
  run("brew", ["install", "cocoapods"], { problem: "Installing CocoaPods failed (the lines above say why). Run this again, or ask Claude Code for help." });
}

/** The iPhone Simulator's systems (iOS versions) this Mac has, newest first. */
function iosRuntimes(env) {
  const json = read("xcrun", ["simctl", "list", "--json", "runtimes", "available"], { env });
  const runtimes = JSON.parse(json ?? '{"runtimes":[]}').runtimes.filter((r) => r.platform === "iOS" || r.name?.startsWith("iOS"));
  const key = (r) => r.version.split(".").map((n) => n.padStart(4, "0")).join(".");
  return runtimes.sort((a, b) => key(b).localeCompare(key(a)));
}

/** The iPhone Simulator's system (iOS), downloaded once if Xcode came without it (several GB). */
function ensureIosRuntime(env) {
  if (iosRuntimes(env).length) return;
  step("Downloading the iPhone Simulator's system (iOS, several GB, once; this takes a while)");
  run("xcodebuild", ["-downloadPlatform", "iOS"], {
    env,
    problem: ["Downloading the iPhone Simulator's system failed. Open Xcode → Settings… → Components, and click Get next to iOS.", "Then run this again."],
  });
}

/**
 * Picks the newest standard iPhone (not Pro, Plus or Max) the newest iOS runs: the size most people carry. For the
 * store screenshots, the newest Pro: its 6.3-inch screen (1206 × 2622) is the size App Store Connect requires since
 * October 2026 ("iPhone with Dynamic Island (medium display)"; it no longer takes a Pro Max's in that slot). `exact`:
 * none rather than another iPhone when the runtime has no such model.
 */
function pickIphone(runtime, store = false, exact = false) {
  const iphones = (runtime.supportedDeviceTypes ?? []).filter((t) => t.productFamily === "iPhone");
  const number = (t) => Number(/\d+/.exec(t.name)?.[0] ?? 0);
  const wanted = iphones.filter((t) => (store ? /^iPhone \d+ Pro$/ : /^iPhone \d+$/).test(t.name)).sort((a, b) => number(b) - number(a));
  return wanted[0] ?? (exact ? undefined : iphones.at(-1));
}

/** The Apple teams Xcode is signed in to (Xcode → Settings… → Accounts). */
function xcodeTeams() {
  const exported = path.join(os.tmpdir(), `skyarc-xcode-${process.pid}.plist`);
  const teams = [];
  if (read("defaults", ["export", "com.apple.dt.Xcode", exported]) !== null) {
    for (const key of ["IDEProvisioningTeamByIdentifier", "IDEProvisioningTeams"]) {
      const json = read("plutil", ["-extract", key, "json", "-o", "-", exported]);
      if (!json) continue;
      for (const list of Object.values(JSON.parse(json))) {
        for (const t of [list].flat()) if (t?.teamID) teams.push({ id: t.teamID, name: t.teamName ?? t.teamID });
      }
      if (teams.length) break;
    }
  }
  fs.rmSync(exported, { force: true });
  return teams;
}

/**
 * The teams of the Apple Development certificates in the keychain (each names its team: the id in its OU, the name in
 * its O). Xcode's own list lags behind its accounts: a team an Apple ID was added to shows up there only after Xcode
 * is quit, while "Manage Certificates" makes the team's certificate at once.
 */
function certificateTeams() {
  const pems = (read("security", ["find-certificate", "-a", "-c", "Apple Development", "-p"]) ?? "").split(/(?=-----BEGIN CERTIFICATE-----)/).filter((p) => p.includes("BEGIN"));
  return pems
    .map((pem) => read("openssl", ["x509", "-noout", "-subject", "-nameopt", "multiline"], { input: pem }) ?? "")
    .map((s) => ({ id: /organizationalUnitName\s*=\s*(\S+)/.exec(s)?.[1], name: /organizationName\s*=\s*(.+)/.exec(s)?.[1]?.trim() }))
    .filter((t) => t.id);
}

/**
 * HyberTec LLC's team, when this Mac can sign for it: Xcode's accounts list it, or the keychain has its Apple
 * Development certificate. Null otherwise: Sky Arc is never signed by another team.
 */
function appleTeam() {
  const team = [...xcodeTeams(), ...certificateTeams()].find((t) => t.id === APPLE_TEAM.id);
  return team ? { id: team.id, name: team.name || APPLE_TEAM.name } : null;
}

const XCODE_ACCOUNT_STEPS = [
  "  1. Open Xcode. In the menu bar at the top of the screen: Xcode → Settings… → Accounts.",
  "  2. If the Apple ID that is on HyberTec LLC's team isn't in the list: click + at the bottom left, choose Apple Account, click Continue, and sign in.",
  '  3. Click that Apple ID, then its "HyberTec LLC" line, then Manage Certificates… → + → Apple Development → Done.',
];

/**
 * Apple's intermediate certificate for developer signing (WWDR G3), which Xcode normally adds to the keychain: without
 * it the signing certificate isn't usable ("0 valid identities") and signing fails. Added once from apple.com, and
 * checked against the fingerprint Apple publishes.
 */
function ensureSigningIntermediate() {
  const listed = read("security", ["find-identity", "-p", "codesigning"]) ?? "";
  const matching = Number(/(\d+) identities found/.exec(listed)?.[1] ?? 0);
  const valid = Number(/(\d+) valid identities found/.exec(listed)?.[1] ?? 0);
  if (valid > 0 || matching === 0) return;
  step("Adding Apple's intermediate signing certificate (WWDR G3) to your keychain, once");
  const file = path.join(os.tmpdir(), `AppleWWDRCAG3-${process.pid}.cer`);
  const G3 = "DC:F2:18:78:C7:7F:41:98:E4:B4:61:4F:03:D6:96:D8:9C:66:C6:60:08:D4:24:4E:1B:99:16:1A:AC:91:60:1F";
  const downloaded = read("curl", ["-fsSL", "-o", file, "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer"]) !== null;
  const fingerprint = downloaded ? read("openssl", ["x509", "-inform", "DER", "-in", file, "-noout", "-fingerprint", "-sha256"]) : null;
  if (fingerprint?.includes(G3)) read("security", ["import", file, "-k", path.join(os.homedir(), "Library", "Keychains", "login.keychain-db")]);
  fs.rmSync(file, { force: true });
  if (!/[1-9]\d* valid identities found/.test(read("security", ["find-identity", "-p", "codesigning"]) ?? "")) {
    note("Your signing certificate still isn't usable. If the build below fails on signing: Xcode → Settings… → Accounts → HyberTec LLC → Manage Certificates… → + → Apple Development.");
  }
}

/** The iPhone project's workspace and scheme (mobile/ios, as `expo prebuild` makes it). */
function xcodeProject() {
  const workspace = fs.readdirSync(path.join(mobile, "ios")).find((f) => f.endsWith(".xcworkspace"));
  if (!workspace) stop([`mobile/ios has no Xcode workspace. Run the command again with -- --rebuild.`]);
  return { workspace, scheme: workspace.replace(/\.xcworkspace$/, "") };
}

/** Sky Arc's own simulator for this copy of Sky Arc: made the first time, then booted and shown. */
function iosSimulator(which, env) {
  const name = SIMULATOR[which];
  const listed = read("xcrun", ["simctl", "list", "--json", "devices", "available"], { env });
  let udid = Object.values(JSON.parse(listed ?? '{"devices":{}}').devices)
    .flat()
    .find((d) => d.name === name)?.udid;
  if (!udid) {
    // The newest iOS that runs that iPhone: a newer one can come for a new model only (iOS 27.1, for the iPhone Duo).
    const runtimes = iosRuntimes(env);
    const runtime = runtimes.find((r) => pickIphone(r, which === "screenshots", true)) ?? runtimes[0];
    const type = runtime && pickIphone(runtime, which === "screenshots");
    if (!type) stop("Xcode has no iPhone simulators. Open Xcode → Settings… → Components, click Get next to iOS, then run this again.");
    udid = read("xcrun", ["simctl", "create", name, type.identifier, runtime.identifier], { env })?.trim();
    if (!udid) stop(`Making the simulator "${name}" failed. Ask Claude Code for help.`);
    ok(`Made the simulator "${name}": ${type.name}, ${runtime.name}`);
  }
  step(`Opening the iPhone Simulator ("${name}")`);
  read("xcrun", ["simctl", "boot", udid], { env }); // fails harmlessly when it is already booted
  read("xcrun", ["simctl", "bootstatus", udid], { env });
  // The window: the Simulator app up to Xcode 26, Device Hub (inside Xcode.app) from Xcode 27.
  const simulatorApp = path.join(env.DEVELOPER_DIR, "Applications", "Simulator.app");
  const deviceHub = path.join(env.DEVELOPER_DIR, "..", "Applications", "DeviceHub.app");
  if (fs.existsSync(simulatorApp)) spawnSync("open", ["-a", simulatorApp, "--args", "-CurrentDeviceUDID", udid]);
  else if (fs.existsSync(deviceHub)) spawnSync("open", ["-a", deviceHub]);
  return {
    id: udid,
    name: `the simulator "${name}"`,
    expoName: udid,
    testId: udid,
    hasApp: () => read("xcrun", ["simctl", "get_app_container", udid, APP_ID], { env }) !== null,
    // From a fresh start, so no screen left from an earlier launch (one that found no development server) stays on top.
    open: (port) => {
      read("xcrun", ["simctl", "terminate", udid, APP_ID], { env });
      return read("xcrun", ["simctl", "openurl", udid, devClientUrl(port)], { env }) !== null;
    },
    /** Removes the app with its data, as a new install (it is installed again right after); true, as it has to be built for it again. */
    signOut: () => {
      read("xcrun", ["simctl", "uninstall", udid, APP_ID], { env });
      read("xcrun", ["simctl", "keychain", udid, "reset"], { env }); // the sign-in outlives the app in the keychain
      return true;
    },
  };
}

async function iphoneSim() {
  prepareApp();
  const xenv = xcode();
  const env = { ...xenv, ...appSettings(mode) };
  ensureCocoaPods();
  ensureIosRuntime(env);
  await session("ios", () => iosSimulator(mode, env), env);
}

/** The iPhone plugged into (or paired over Wi-Fi with) this Mac, ready for an app from it. */
function connectedIphone(env) {
  const out = path.join(os.tmpdir(), `skyarc-devices-${process.pid}.json`);
  spawnSync("xcrun", ["devicectl", "list", "devices", "--json-output", out], { env, stdio: "ignore" });
  let devices = [];
  try {
    devices = JSON.parse(fs.readFileSync(out, "utf8")).result.devices;
  } catch {
    /* none */
  }
  fs.rmSync(out, { force: true });
  // A real iPhone, not one of this Mac's simulators (which devicectl lists too: "simulated", on the same machine).
  const iphones = devices.filter(
    (d) => d.hardwareProperties?.deviceType === "iPhone" && !["virtual", "simulated"].includes(d.hardwareProperties?.reality) && d.connectionProperties?.transportType !== "sameMachine",
  );
  const reachable = (d) => d.connectionProperties?.tunnelState === "connected" || d.connectionProperties?.transportType === "wired";
  const phone = iphones.find(reachable) ?? iphones.find((d) => d.connectionProperties?.transportType);
  if (!phone) {
    stop([
      "No iPhone is plugged in. Plug your iPhone into this Mac with its cable and unlock it.",
      'If the iPhone asks "Trust This Computer?", tap Trust and enter its passcode. If the Mac asks to allow the accessory to connect, click Allow.',
      "Then run this again. (To use the iPhone Simulator on this Mac instead: npm run iphone:sim)",
    ]);
  }
  const name = phone.deviceProperties?.name ?? "your iPhone";
  if (phone.connectionProperties?.pairingState && phone.connectionProperties.pairingState !== "paired") {
    stop([`${name} doesn't trust this Mac yet. Unlock it, and when it asks "Trust This Computer?", tap Trust and enter its passcode.`, "Then run this again."]);
  }
  if (phone.deviceProperties?.developerModeStatus === "disabled") {
    stop([
      `Developer Mode is off on ${name}. On the iPhone: Settings → Privacy & Security → Developer Mode (at the very bottom) → turn it on → Restart.`,
      "After it restarts, unlock it and tap Turn On, then enter the passcode. Then run this again.",
    ]);
  }
  return { name, udid: phone.hardwareProperties?.udid ?? phone.identifier };
}

/** When a provisioning profile stops working, or null (`security cms` decodes it). */
function profileExpiry(file) {
  const plist = fs.existsSync(file) ? read("security", ["cms", "-D", "-i", file]) : null;
  const expires = plist && /<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/.exec(plist)?.[1];
  return expires ? new Date(expires) : null;
}

/** What a failed build or install to a phone most likely needs from its person, from Xcode's words. */
function explainPhoneProblem(log) {
  const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n") : [];
  const text = lines.filter((l) => /error|fail|denied|unable|invalid/i.test(l)).join("\n");
  const known = [
    [/PLA Update|Program License Agreement|agreement.*(accept|updated)/i, "Apple needs HyberTec LLC's Account Holder to accept an updated agreement: sign in at https://developer.apple.com/account and accept it. Then run this again."],
    [/No Accounts?\b|No account for team|not signed in|sign in with your Apple ID/i, "Xcode isn't signed in to the Apple ID on HyberTec LLC's team: Xcode → Settings… → Accounts → +. Then run this again."],
    [/Developer Mode/i, "Turn on Developer Mode on the iPhone: Settings → Privacy & Security → Developer Mode. Then run this again."],
    [/device is locked|is passcode protected|unlock/i, "Unlock the iPhone and keep it unlocked (and awake) while the app installs, then run this again."],
    [/not been explicitly trusted|untrusted developer|profile has not been|invalid code signature/i, 'The iPhone has the app but doesn\'t trust it yet. On the iPhone: Settings → General → VPN & Device Management → under "Developer App", tap HyberTec LLC → Trust. Then open Sky Arc.'],
    [/cannot be registered to your development team|App ID .* is not available|identifier .* is not available/i, `The app's id (${APP_ID}) is registered to another Apple team. Ask Claude Code: "the app id is taken".`],
    [/maximum number of .*certificates/i, "HyberTec's Apple account has too many development certificates: revoke an old one at https://developer.apple.com/account/resources/certificates, then run this again."],
    [/No profiles for|requires a provisioning profile|provisioning profile/i, "Xcode couldn't set up the app's signing. Check that Xcode → Settings… → Accounts lists your Apple ID with HyberTec LLC's team, then run this again."],
    [/not (connected|paired)|unpaired|Trust/i, "Unplug the iPhone, plug it in again, unlock it and tap Trust if asked. Then run this again."],
  ];
  const match = known.find(([pattern]) => pattern.test(text));
  return [
    ...(match ? [match[1]] : ["The lines above say what went wrong."]),
    `The whole log: ${path.relative(root, log)}. docs/running-the-apps.md, "When a build fails", has more; or ask Claude Code: "npm run iphone fails".`,
  ];
}

/** xcodebuild with its output made readable on screen (Expo's formatter), and whole in `log`. */
function xcodebuild(args, { cwd, env, log }) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(log);
    const build = keep(spawn("xcodebuild", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }), "SIGINT");
    const pretty = fs.existsSync(bin("excpretty")) ? spawn(bin("excpretty"), [], { stdio: ["pipe", "inherit", "inherit"] }) : null;
    let status = null;
    let shown = !pretty;
    const done = () => status !== null && shown && file.end(() => resolve(status === 0));
    for (const stream of [build.stdout, build.stderr]) {
      stream.on("data", (chunk) => {
        file.write(chunk);
        if (pretty) pretty.stdin.write(chunk);
        else process.stdout.write(chunk);
      });
    }
    pretty?.on("close", () => {
      shown = true;
      done();
    });
    build.on("close", (code) => {
      status = code ?? 1;
      pretty?.stdin.end();
      done();
    });
  });
}

/**
 * The real Sky Arc's app on the iPhone plugged into this Mac: a Release build, so it runs on its own (no Mac, no
 * development server) as the App Store's will, signed by HyberTec LLC's team. Built with xcodebuild itself rather than
 * `expo run:ios`, so that Xcode may register the phone with the team and make the app's signing the first time
 * (-allowProvisioningUpdates).
 */
async function iphone() {
  if (fresh) note("--fresh is for the simulators' practice copy; on your iPhone, sign out in the app's More tab instead.");
  prepareApp();
  const xenv = xcode();
  ensureCocoaPods();
  const team = appleTeam();
  if (!team) stop(["Putting Sky Arc on your iPhone needs Xcode signed in to HyberTec LLC's Apple team, and this Mac isn't yet:", ...XCODE_ACCOUNT_STEPS, "Then run this again."]);
  const env = { ...xenv, ...appSettings("live") };
  const phone = connectedIphone(env);
  ensureSigningIntermediate();
  ensureNativeProject("ios", env);
  const iosDir = path.join(mobile, "ios");
  const { workspace, scheme } = xcodeProject();
  step(`Building Sky Arc for ${phone.name}, signed by ${team.name} (the first time takes 10 to 20 minutes)`);
  note("It uses the real Sky Arc: what you do in it is real, as on the website.");
  const log = logFile("iphone-build.log");
  // Outside mobile/ios, which is made again when something native changes: what was built stays, and only what
  // changed is built again.
  const derived = path.join(stateDir, "iphone-build");
  const built = await xcodebuild(
    ["-workspace", workspace, "-scheme", scheme, "-configuration", "Release", "-destination", `id=${phone.udid}`, "-derivedDataPath", derived,
      "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration", `DEVELOPMENT_TEAM=${team.id}`, "CODE_SIGN_STYLE=Automatic", "COMPILER_INDEX_STORE_ENABLE=NO", "build"],
    { cwd: iosDir, env, log },
  );
  if (!built) stop([`The app didn't build for ${phone.name}.`, ...explainPhoneProblem(log)]);
  const app = path.join(derived, "Build", "Products", "Release-iphoneos", `${scheme}.app`);
  step(`Installing it on ${phone.name} (keep the iPhone unlocked)`);
  const installLog = logFile("iphone-install.log");
  const installed = spawnSync("xcrun", ["devicectl", "device", "install", "app", "--device", phone.udid, app], { env, encoding: "utf8" });
  fs.writeFileSync(installLog, `${installed.stdout ?? ""}${installed.stderr ?? ""}`);
  if (installed.status !== 0) stop([`The app built but didn't install on ${phone.name}.`, tail(installLog, 8), ...explainPhoneProblem(installLog)]);
  const launched = spawnSync("xcrun", ["devicectl", "device", "process", "launch", "--terminate-existing", "--device", phone.udid, APP_ID], { env, encoding: "utf8" });
  console.log(`\n✓ Sky Arc is on ${phone.name}, and runs without the Mac. It uses the REAL Sky Arc: sign in with your email and password, or with Google.`);
  if (launched.status !== 0) console.log("  Open Sky Arc on the iPhone (it didn't open by itself).");
  const expires = profileExpiry(path.join(app, "embedded.mobileprovision"));
  if (expires) {
    const when = expires.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    console.log(`  This copy keeps opening until ${when}. Before then, plug the iPhone in and run npm run iphone again.`);
  }
  console.log("  After any change to the app, run npm run iphone again with the iPhone plugged in: only what changed is rebuilt.\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Android: Android Studio's tools, the emulator, and a real Android phone.

function androidTools() {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), "Library", "Android", "sdk");
  if (!fs.existsSync(path.join(sdk, "platform-tools", "adb"))) {
    stop([
      "Android Studio (or its Android SDK) isn't installed yet. Download it from https://developer.android.com/studio,",
      "drag it into Applications, open it once and click through its setup (Standard). Then run this again.",
    ]);
  }
  let java = [JAVA17, process.env.JAVA_HOME, STUDIO_JAVA].find((j) => j && fs.existsSync(path.join(j, "bin", "java")));
  if (!java && has("brew")) {
    step("Installing Java 17 (it builds the Android app)");
    run("brew", ["install", "openjdk@17"], { problem: "Installing Java 17 failed (the lines above say why)." });
    java = JAVA17;
  }
  if (!java) stop("The Android app needs Java 17. Install Homebrew (https://brew.sh), then run this again.");
  const env = { ...process.env, ANDROID_HOME: sdk, JAVA_HOME: java, PATH: `${sdk}/platform-tools:${sdk}/emulator:${process.env.PATH}` };
  return {
    env,
    sdk,
    adb: path.join(sdk, "platform-tools", "adb"),
    emulator: path.join(sdk, "emulator", "emulator"),
    tool: (name) => path.join(sdk, "cmdline-tools", "latest", "bin", name),
  };
}

/** The emulator's phone image and Sky Arc's own emulator for this copy, made once. */
function ensureAndroidEmulator(a, which) {
  const [, api, tag, abi] = ANDROID_IMAGE.split(";");
  if (!fs.existsSync(path.join(a.sdk, "system-images", api, tag, abi))) {
    if (!fs.existsSync(a.tool("sdkmanager"))) {
      stop([
        "Android Studio's command-line tools are missing. In Android Studio: Settings → Languages & Frameworks → Android SDK →",
        'the "SDK Tools" tab → tick "Android SDK Command-line Tools (latest)" → Apply. Then run this again.',
      ]);
    }
    step("Downloading the Android 16 phone image for the emulator (about 1.5 GB, once)");
    // Accepts the Android SDK's licence, as Android Studio's own setup does.
    run(a.tool("sdkmanager"), ["--install", ANDROID_IMAGE, "emulator", "platform-tools"], {
      env: a.env,
      input: "y\n".repeat(20),
      problem: "Downloading the Android phone image failed (the lines above say why).",
    });
  }
  const name = AVD[which];
  const avds = (read(a.emulator, ["-list-avds"], { env: a.env }) ?? "").split("\n").map((s) => s.trim());
  if (avds.includes(name)) return;
  run(a.tool("avdmanager"), ["create", "avd", "--name", name, "--package", ANDROID_IMAGE, "--device", ANDROID_PHONE], {
    env: a.env,
    input: "no\n",
    problem: `Making the Android emulator "${name}" failed (the lines above say why).`,
  });
  // As Android Studio makes them: the Mac's graphics and keyboard, Google Play, and memory enough for the app.
  const config = path.join(os.homedir(), ".android", "avd", `${name}.avd`, "config.ini");
  const settings = { "hw.gpu.enabled": "yes", "hw.gpu.mode": "host", "hw.keyboard": "yes", "PlayStore.enabled": "yes", "hw.ramSize": "4096M", showDeviceFrame: "yes" };
  const lines = fs.readFileSync(config, "utf8").split("\n").filter((l) => l && !(l.split("=")[0] in settings));
  fs.writeFileSync(config, [...lines, ...Object.entries(settings).map(([k, v]) => `${k}=${v}`), ""].join("\n"));
  ok(`Made the Android emulator "${name}" (Pixel 9, Android 16)`);
}

function runningEmulator(a, name) {
  const serials = (read(a.adb, ["devices"], { env: a.env }) ?? "").split("\n").map((l) => l.split("\t")[0]).filter((s) => s.startsWith("emulator-"));
  return serials.find((s) => read(a.adb, ["-s", s, "emu", "avd", "name"], { env: a.env })?.split(/\r?\n/)[0].trim() === name);
}

/** Sky Arc's own emulator for this copy, started if it isn't running (it stays open afterwards, like the Simulator). */
async function androidEmulator(a, which) {
  const name = AVD[which];
  step(`Opening the Android emulator ("${name}")`);
  let serial = runningEmulator(a, name);
  if (!serial) {
    const log = logFile("android-emulator.log");
    const out = fs.openSync(log, "w");
    spawn(a.emulator, ["-avd", name, "-no-boot-anim"], { env: a.env, detached: true, stdio: ["ignore", out, out] }).unref();
    serial = await waitFor(() => runningEmulator(a, name), 120_000, () => stop(`The Android emulator didn't start. Its log: ${path.relative(root, log)}`));
  }
  await waitFor(
    () => read(a.adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"], { env: a.env })?.trim() === "1",
    300_000,
    () => stop("The Android emulator didn't finish starting. Close its window and run this again."),
  );
  // The keyboard's "Try out your stylus" tip, which a new emulator shows over the first text field and which the
  // test flows can't get past.
  read(a.adb, ["-s", serial, "shell", "settings", "put", "secure", "stylus_handwriting_enabled", "0"], { env: a.env });
  return {
    id: name,
    name: `the emulator "${name}"`,
    expoName: name,
    testId: serial,
    hasApp: () => (read(a.adb, ["-s", serial, "shell", "pm", "path", APP_ID], { env: a.env }) ?? "").includes("package:"),
    // From a fresh start, as on the iPhone, reaching this Mac's development server through the emulator's own 127.0.0.1.
    open: (port) => {
      read(a.adb, ["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`], { env: a.env });
      read(a.adb, ["-s", serial, "shell", "am", "force-stop", APP_ID], { env: a.env });
      return read(a.adb, ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${devClientUrl(port)}'`, APP_ID], { env: a.env }) !== null;
    },
    /** Empties the app's data, sign-in included; the app stays installed. */
    signOut: () => {
      read(a.adb, ["-s", serial, "shell", "pm", "clear", APP_ID], { env: a.env });
      return false;
    },
  };
}

async function androidSim() {
  prepareApp();
  const a = androidTools();
  ensureAndroidEmulator(a, mode);
  const env = { ...a.env, ...appSettings(mode) };
  await session("android", () => androidEmulator(a, mode), env);
}

const USB_DEBUGGING_STEPS = [
  "  1. On the phone: Settings → About phone → Software information → tap Build number 7 times (a Samsung asks for your PIN,",
  '     then says "Developer mode has been turned on"). On other Android phones Build number is right under About phone.',
  "  2. Back in Settings: Developer options (at the very bottom; on other phones under System) → turn on USB debugging.",
  '  3. Plug the phone into this Mac. On the phone, "Allow USB debugging?": tick "Always allow from this computer", tap Allow.',
];

/**
 * The Android phone plugged into this Mac, with USB debugging allowed for it (never an emulator), or the device
 * ANDROID_SERIAL names (one of several phones, or an emulator standing in for one).
 */
function connectedAndroid(a) {
  const chosen = process.env.ANDROID_SERIAL?.trim();
  const phones = (read(a.adb, ["devices", "-l"], { env: a.env }) ?? "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state && (chosen ? serial === chosen : !serial.startsWith("emulator-")))
    .map(([serial, state, ...more]) => ({ serial, state, model: more.find((r) => r.startsWith("model:"))?.slice(6).replace(/_/g, " ") ?? "your Android phone" }));
  const phone = phones.find((p) => p.state === "device");
  if (!phone) {
    if (phones.some((p) => p.state === "unauthorized")) {
      stop(['The phone is plugged in but hasn\'t allowed this Mac yet. Unlock it: on "Allow USB debugging?", tick "Always allow from this computer" and tap Allow.', "Then run this again."]);
    }
    stop(["No Android phone is plugged in with USB debugging on. The first time:", ...USB_DEBUGGING_STEPS, "Then run this again. (To use the Android emulator on this Mac instead: npm run android:sim)"]);
  }
  return phone;
}

/**
 * The real Sky Arc's app on the Android phone plugged into this Mac: a Release build, so it runs on its own, signed
 * with the debug key (registered in Firebase for Google sign-in), or with Google Play's upload key once
 * scripts/publish.mjs has made it. An Android phone keeps it for good, until it is replaced by a newer one.
 */
async function androidPhone() {
  if (fresh) note("--fresh is for the emulators' practice copy; on your phone, sign out in the app's More tab instead.");
  prepareApp();
  const a = androidTools();
  const phone = connectedAndroid(a);
  const env = { ...a.env, ...appSettings("live") };
  ensureNativeProject("android", env);
  step(`Building Sky Arc for ${phone.model} (the first time takes 10 to 20 minutes)`);
  note("It uses the real Sky Arc: what you do in it is real, as on the website.");
  const androidDir = path.join(mobile, "android");
  freshJsBundle();
  run("./gradlew", ["app:assembleRelease", "--console=plain", ...(rebuild ? ["--rerun-tasks"] : [])], { cwd: androidDir, env, problem: buildProblem("android") });
  const apk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  step(`Installing it on ${phone.model} (keep the phone unlocked)`);
  const installed = spawnSync(a.adb, ["-s", phone.serial, "install", "-r", apk], { env: a.env, encoding: "utf8" });
  if (installed.status !== 0) {
    const why = `${installed.stdout ?? ""}${installed.stderr ?? ""}`.trim();
    stop([
      `The app built but didn't install on ${phone.model}:`,
      why.split("\n").slice(-3).join("\n"),
      /UPDATE_INCOMPATIBLE|signatures do not match/i.test(why)
        ? "The phone has Sky Arc from somewhere else (signed differently: Google Play, or an earlier key). Delete Sky Arc from the phone, then run this again."
        : "Unlock the phone, check it still allows USB debugging for this Mac, then run this again.",
    ]);
  }
  read(a.adb, ["-s", phone.serial, "shell", "monkey", "-p", APP_ID, "-c", "android.intent.category.LAUNCHER", "1"], { env: a.env });
  console.log(`\n✓ Sky Arc is on ${phone.model}, and runs without the Mac. It uses the REAL Sky Arc: sign in with your email and password, or with Google.`);
  console.log("  After any change to the app, run npm run android again with the phone plugged in: only what changed is rebuilt.\n");
}

// ---------------------------------------------------------------------------------------------------------------
// The app's test flows (Maestro), on a practice copy's simulator or emulator.

/** Maestro, with what it needs (Java 17; the Android SDK's tools for an emulator): runs one flow, with its values. */
function maestroRunner() {
  const maestro = has("maestro") ? "maestro" : path.join(os.homedir(), ".maestro", "bin", "maestro");
  if (maestro !== "maestro" && !fs.existsSync(maestro)) stop(['The test flows need Maestro. In Terminal: curl -Ls "https://get.maestro.mobile.dev" | bash', "Then run this again."]);
  const java = [JAVA17, process.env.JAVA_HOME, STUDIO_JAVA].find((j) => j && fs.existsSync(path.join(j, "bin", "java")));
  if (!java) stop("The test flows need Java 17. In Terminal: brew install openjdk@17, then run this again.");
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), "Library", "Android", "sdk");
  // A Mac busy with several simulators can take minutes to start Maestro's helper app on an iPhone Simulator.
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, PATH: `${sdk}/platform-tools:${process.env.PATH}`, MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? "240000" };
  // The values come from here: a flow's own would win over these, so the flows have none.
  return (device, flow, values = {}) => run(maestro, ["--device", device, "test", ...Object.entries(values).flatMap(([k, v]) => ["-e", `${k}=${v}`]), flow], { cwd: mobile, env });
}

/**
 * The app on the practice copy's device, signed out, with its development server in reach: on an iPhone Simulator the
 * sign-in leaves with the keychain (Firebase keeps it there); on an Android emulator with the app's data, after which
 * the app is pointed at the server again.
 */
function signOutForTest(s) {
  if (s.platform === "ios") {
    const env = xcode();
    read("xcrun", ["simctl", "terminate", s.device, APP_ID], { env });
    read("xcrun", ["simctl", "keychain", s.device, "reset"], { env });
    return;
  }
  const a = androidTools();
  read(a.adb, ["-s", s.device, "shell", "pm", "clear", APP_ID], { env: a.env });
  // Clearing the data takes the notification permission too: given back, so Android's question can't stop a flow.
  read(a.adb, ["-s", s.device, "shell", "pm", "grant", APP_ID, "android.permission.POST_NOTIFICATIONS"], { env: a.env });
  read(a.adb, ["-s", s.device, "reverse", `tcp:${s.port}`, `tcp:${s.port}`], { env: a.env });
  read(a.adb, ["-s", s.device, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${devClientUrl(s.port)}'`, APP_ID], { env: a.env });
}

/**
 * The values a flow uses (${NAME}) that neither its own `env:` nor `given` provides. A value with a default
 * (${NAME || "…"}) and Maestro's own (MAESTRO_…) need nothing.
 */
function missingValues(file, given) {
  const text = fs.readFileSync(file, "utf8");
  const config = text.split(/\n---/)[0];
  const own = new Set([...config.matchAll(/^\s+([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
  const used = new Set([...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map((m) => m[1]));
  return [...used].filter((n) => !(n in given) && !own.has(n) && !n.startsWith("MAESTRO_"));
}

/**
 * Runs mobile/maestro's flows (all of them, or those named: npm run phone:test -- news) on the simulator or emulator
 * that `npm run iphone:sim` or `npm run android:sim` has open in another window. First the app is signed out,
 * connected to that window's development server (dev-connect.yaml) and signed in as the practice owner
 * (sign-in.yaml); each flow then starts from the signed-in app, with PORT, EMAIL and PASSWORD given to it, and any
 * NAME=value given on the command line (npm run phone:test -- session-log SESSION=… FUTURE=…). A flow that needs a
 * value nobody gave is skipped, with what to give it.
 */
async function test() {
  const s = await runningSession("practice");
  if (!s?.device) stop(["Start the practice copy first, in another window: npm run iphone:sim (or npm run android:sim). Then run this again."]);
  const maestro = maestroRunner();
  const dir = path.join(mobile, "maestro");
  const chosen = names.filter((n) => !n.includes("="));
  const extra = Object.fromEntries(names.filter((n) => n.includes("=")).map((n) => [n.slice(0, n.indexOf("=")), n.slice(n.indexOf("=") + 1)]));
  const flows = chosen.length ? chosen.map((n) => `${n.replace(/\.yaml$/, "")}.yaml`) : fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") && !STEP_FLOWS.has(f)).sort();
  const missing = flows.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) stop(`No such test flow: ${missing.join(", ")}. The flows are in mobile/maestro.`);
  const where = s.platform === "ios" ? "the iPhone Simulator" : "the Android emulator";
  const values = { PORT: String(s.port), EMAIL: PRACTICE_OWNER.email, PASSWORD: practicePassword(), ...extra };
  const skipped = [];
  // The Scan flow reads a made-up card from the simulator's Photos (scripts/practice-card.ts), drawn and added before
  // any flow runs (adding photos can stall while Maestro's helper is busy on the simulator). iPhone only for now:
  // Android's photo picker works differently.
  if (flows.includes("scan.yaml")) {
    if (s.platform !== "ios") {
      skipped.push("scan.yaml");
      note("Skipped scan.yaml: it runs on the iPhone Simulator only for now.");
    } else {
      // In the Mac's temporary folder: the simulator can't read a photo inside Documents (macOS protects it, and its
      // import then waits for good).
      const drawn = path.join(os.tmpdir(), "skyarc-practice-card.png");
      const card = path.join(os.tmpdir(), "skyarc-practice-card.jpg");
      run(path.join(root, "node_modules", ".bin", "tsx"), ["scripts/practice-card.ts", drawn], { problem: "Drawing the made-up card for the Scan flow failed (the lines above say why)." });
      // As a JPEG, like a camera's photo: the simulator's Photos stalls on a PNG this size.
      run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", drawn, "--out", card], { problem: "Making the made-up card a JPEG failed (the lines above say why)." });
      // A photo the import couldn't read leaves the simulator's Photos waiting; it takes photos again once restarted.
      const env = xcode();
      const add = () => spawnSync("xcrun", ["simctl", "addmedia", s.device, card], { env, stdio: "ignore", timeout: 30_000 }).status === 0;
      if (!add()) {
        note("The simulator's Photos didn't take the card: restarting the simulator, then trying again.");
        read("xcrun", ["simctl", "shutdown", s.device], { env });
        read("xcrun", ["simctl", "boot", s.device], { env });
        read("xcrun", ["simctl", "bootstatus", s.device], { env });
        if (!add()) stop([`Couldn't add the made-up card to the simulator's Photos, even after restarting it. Run this again.`]);
      }
      ok("A made-up card is in the simulator's Photos, the newest photo (for scan.yaml)");
    }
  }
  step(`Signing the app out on ${where}, then in again as the practice owner (dev-connect.yaml, sign-in.yaml)`);
  signOutForTest(s);
  if (!maestro(s.device, "maestro/dev-connect.yaml", values) || !maestro(s.device, "maestro/sign-in.yaml", values)) {
    stop([`The app didn't get to Home as the practice owner on ${where}. Maestro's screenshots and logs are in ~/.maestro/tests (the newest folder).`, `Ask Claude Code: "npm run phone:test can't sign in".`]);
  }
  ok(`Signed in as the practice owner (${PRACTICE_OWNER.email})`);
  let failed = 0;
  for (const flow of flows) {
    if (skipped.includes(flow)) continue;
    const needs = missingValues(path.join(dir, flow), values);
    if (needs.length) {
      skipped.push(flow);
      note(`Skipped ${flow}: it needs ${needs.join(" and ")} (its first lines say what they are): npm run phone:test -- ${flow.replace(/\.yaml$/, "")} ${needs.map((n) => `${n}=…`).join(" ")}`);
      continue;
    }
    step(`Test flow ${flow} on ${where}`);
    if (!maestro(s.device, path.join("maestro", flow), values)) failed++;
  }
  const ran = flows.length - skipped.length;
  if (failed) stop(`${failed} of ${ran} flows failed${skipped.length ? ` (${skipped.length} skipped)` : ""}. Maestro's screenshots and logs are in ~/.maestro/tests (the newest folder).`);
  if (!flows.length) console.log("\n✓ Signing in as the practice owner passed (mobile/maestro has no other flows yet).\n");
  else console.log(`\n✓ Signing in and ${ran === flows.length ? `all ${ran}` : `${ran} of ${flows.length}`} test flows passed${skipped.length ? ` (${skipped.join(", ")} skipped: see above)` : ""}.\n`);
}

// ---------------------------------------------------------------------------------------------------------------
// Setup: what the commands above do before opening an app, for a new computer, and a list of what is left.

async function setup() {
  const left = [];
  const attempt = async (what, fn) => {
    try {
      await fn();
      ok(what);
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      left.push(`${what}:\n${e.message.replace(/^/gm, "     ")}`);
      console.log(`  ✗ ${what}`);
    }
  };
  step("The phone app");
  await attempt("Its packages", () => ensurePackages(mobile, "the phone app"));
  await attempt(`The ${PROJECT} project's Firebase files (mobile/firebase/)`, () => ensureFirebaseFiles({ required: true, refresh: true }));

  step("iPhone");
  let xenv = null;
  await attempt("Xcode", () => (xenv = xcode()));
  if (xenv) await attempt("The iPhone Simulator's system (iOS)", () => ensureIosRuntime(xenv));
  await attempt("CocoaPods", () => ensureCocoaPods());
  await attempt("HyberTec LLC's Apple team in Xcode (for your iPhone and the App Store)", () => {
    if (!appleTeam()) stop(["Xcode can't sign for HyberTec LLC yet:", ...XCODE_ACCOUNT_STEPS]);
  });

  step("Android");
  let a = null;
  await attempt("Android Studio and Java 17", () => (a = androidTools()));
  if (a) {
    await attempt(`The emulators "${AVD.practice}" and "${AVD.live}"`, () => {
      ensureAndroidEmulator(a, "practice");
      ensureAndroidEmulator(a, "live");
    });
  }

  step("The practice copy of Sky Arc");
  await attempt("Java 21 for the Firebase emulators", () => {
    if (fs.existsSync(path.join(JAVA21, "bin", "java"))) return;
    if (!has("brew")) stop("Install Homebrew (https://brew.sh), then run this again.");
    run("brew", ["install", "openjdk@21"], { problem: "Installing Java 21 failed (the lines above say why)." });
  });
  await attempt(`The Firebase CLI, signed in to an account that can open ${PROJECT}`, () => {
    if (!has("firebase")) stop(`In Terminal: npm install -g firebase-tools, then firebase login (with the Google account that can open ${PROJECT}).`);
    if (read("firebase", ["apps:list", "--project", PROJECT]) === null) stop(`In Terminal: firebase login, with the Google account that can open the ${PROJECT} project.`);
  });
  await attempt("The repository's, the server code's and the website's packages", () => {
    ensurePackages(root, "the repository's tools");
    ensurePackages(path.join(root, "functions"), "the server code");
    ensurePackages(path.join(root, "web"), "the website");
  });
  await attempt("The practice logins' password (mobile/.expo/practice-login.json, made on this Mac)", () => practicePassword());

  step("Tests and screenshots");
  await attempt("Maestro (npm run phone:test, npm run publish:screenshots)", () => maestroRunner());

  if (!left.length) {
    console.log("\n✓ This Mac is ready: npm run iphone (or npm run android) puts the app on the phone plugged in.\n");
    return;
  }
  console.log(`\nLeft for you (docs/running-the-apps.md explains each):\n\n${left.map((l, i) => `  ${i + 1}. ${l}`).join("\n\n")}\n`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------------------------------------------
// For scripts/publish.mjs: the native project as the stores need it, made exactly as a phone's build is.

/**
 * `prepare ios|android` (npm run publish:iphone and publish:android run it; not for typing by hand): the app's
 * packages, the project's Firebase files, the tools, HyberTec's Apple team and the native project, then what
 * publish.mjs builds with, written to mobile/.expo/publish-<platform>.json: the environment (Xcode's, or Java's and the
 * Android SDK's, with the real Sky Arc's settings for the app) and, for the iPhone, the workspace, scheme and team.
 */
async function prepare() {
  const p = { ios: "ios", iphone: "ios", android: "android" }[names[0]];
  if (!p) stop("prepare needs the platform: node scripts/phone.mjs prepare ios (or android).");
  prepareApp();
  const changed = (env) => Object.fromEntries(Object.entries(env).filter(([k, v]) => process.env[k] !== v));
  let out;
  if (p === "ios") {
    const xenv = xcode();
    ensureCocoaPods();
    const team = appleTeam();
    if (!team) {
      stop([
        "The App Store needs the app signed by HyberTec LLC's Apple team, and Xcode on this Mac can't sign for it yet:",
        ...XCODE_ACCOUNT_STEPS,
        `Then run this again (docs/running-the-apps.md, "Your real iPhone").`,
      ]);
    }
    const env = { ...xenv, ...appSettings("live") };
    ensureSigningIntermediate();
    ensureNativeProject("ios", env);
    out = { platform: p, env: changed(env), ...xcodeProject(), team, appId: APP_ID };
  } else {
    const a = androidTools();
    const env = { ...a.env, ...appSettings("live") };
    ensureNativeProject("android", env);
    out = { platform: p, env: changed(env), appId: APP_ID };
  }
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, `publish-${p}.json`), JSON.stringify(out, null, 2));
  ok(`The ${PLATFORM[p]} project is ready`);
}

// ---------------------------------------------------------------------------------------------------------------
// The stores' images: the app on a big iPhone simulator and on an Android emulator of their own, on the practice copy.

const SCREENS_DIR = path.join(mobile, ".publish", "screenshots");
/**
 * The eight screens both stores get, uploaded in this order (the set the owner chose on 2026-10-20, from their iPhone): the
 * family's first (most people who find the app are parents), as the sample parent, then the office's, as the sample
 * admin. `flow` opens the screen: a tab of either app, or the newest progress report.
 */
const SCREENS = [
  { file: "01-report", as: "family", flow: "maestro/screenshots/family-report.yaml", env: {}, what: "A progress report, as a parent sees it" },
  { file: "02-report-shots", as: "family", flow: "maestro/screenshots/family-report-shots.yaml", env: {}, what: "The report's target: where the shots went" },
  { file: "03-scores", as: "family", flow: "maestro/screenshots/family-tab.yaml", env: { TAB: "scores", LABEL: "Scores" }, what: "Scores: every result, by position" },
  { file: "04-family-home", as: "family", flow: "maestro/screenshots/family-tab.yaml", env: { TAB: "home", LABEL: "Home" }, what: "The family's Home: the next class and the week" },
  { file: "05-today", as: "office", flow: "maestro/screenshots/tab.yaml", env: { TAB: "today", LABEL: "Home" }, what: "The office's Home: the day's classes" },
  { file: "06-schedule", as: "office", flow: "maestro/screenshots/tab.yaml", env: { TAB: "schedule", LABEL: "Schedule" }, what: "Schedule: the day's classes, laid out like the academy's sheets" },
  { file: "07-scan", as: "office", flow: "maestro/screenshots/tab.yaml", env: { TAB: "scan", LABEL: "Scan" }, what: "Scan: photographing a paper target" },
  { file: "08-students", as: "office", flow: "maestro/screenshots/tab.yaml", env: { TAB: "students", LABEL: "Students" }, what: "Students: the academy's students" },
];
/** The sample parent the family's screens are taken as (a practice login: two children, shared reports). */
const SCREENS_PARENT = "jiyeon.hwang@skyarc-sample.test";
/** The sample admin the office's are taken as (a practice login), so Home greets a person, as the iPhone's pictures do. */
const SCREENS_OFFICE = "paige.sutton@skyarc-sample.test";

/** The size of a PNG, from sips. */
function imageSize(file) {
  const out = read("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]) ?? "";
  return { width: Number(/pixelWidth: (\d+)/.exec(out)?.[1] ?? 0), height: Number(/pixelHeight: (\d+)/.exec(out)?.[1] ?? 0) };
}

/**
 * Signs in on one device as the sample admin (sign-in.yaml) and takes the office's screens, then signs in as the
 * sample parent (screenshots/family-sign-in.yaml) and takes the family's, each opened by its flow, with the status bar
 * as the stores like it.
 */
async function shoot(maestro, signIn, device, dir) {
  fs.mkdirSync(dir, { recursive: true });
  device.statusBar(true);
  const failed = (what) =>
    stop([`${what} on ${device.label}. Maestro's own screenshots and logs are in ~/.maestro/tests (the newest folder).`, `Run this again; if it fails the same way, ask Claude Code: "npm run publish:screenshots fails".`]);
  try {
    step(`Signing in on ${device.label} as the sample admin`);
    device.reset();
    if (!maestro(device.testId, "maestro/sign-in.yaml", signIn)) failed("The app didn't sign in");
    for (const as of ["office", "family"]) {
      if (as === "family") {
        step(`Signing in on ${device.label} as the sample parent`);
        if (!maestro(device.testId, "maestro/screenshots/family-sign-in.yaml", { EMAIL: SCREENS_PARENT, PASSWORD: signIn.PASSWORD })) failed("The app didn't sign in as the sample parent");
      }
      for (const screen of SCREENS.filter((s) => s.as === as)) {
        step(`${screen.file} on ${device.label}: ${screen.what}`);
        if (!maestro(device.testId, screen.flow, screen.env)) failed(`${screen.what} didn't open`);
        await sleep(3000); // the screen's data, and the last animation
        const file = path.join(dir, `${screen.file}.png`);
        device.snap(file);
        const { width, height } = imageSize(file);
        if (!width) stop(`No picture came out for ${screen.file} on ${device.label}. Run this again.`);
        ok(`${path.relative(root, file)} (${width} × ${height})`);
      }
    }
  } finally {
    device.statusBar(false);
  }
}

/**
 * A Release build of the app for the screenshots' iPhone Simulator, on the practice copy: the app as the App Store
 * gets it (no development menu, its code inside), built with Xcode and installed on the simulator.
 */
async function releaseOnSimulator(udid, env) {
  ensureNativeProject("ios", env);
  const { workspace, scheme } = xcodeProject();
  step("Building the app for the screenshots' iPhone Simulator (as the App Store gets it; 5 to 15 minutes the first time)");
  const derived = path.join(stateDir, "screenshots-build");
  const log = logFile("screenshots-ios-build.log");
  const built = await xcodebuild(
    ["-workspace", workspace, "-scheme", scheme, "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", `id=${udid}`, "-derivedDataPath", derived, "COMPILER_INDEX_STORE_ENABLE=NO", "build"],
    { cwd: path.join(mobile, "ios"), env, log },
  );
  if (!built) stop([...buildProblem("ios"), `The whole log: ${path.relative(root, log)}.`]);
  const app = path.join(derived, "Build", "Products", "Release-iphonesimulator", `${scheme}.app`);
  if (read("xcrun", ["simctl", "install", udid, app], { env }) === null) stop(`The app built but didn't install on the simulator. Run this again.`);
  ok("Installed on the simulator");
}

/** The same for the screenshots' Android emulator: a Release build, installed with adb (over a differently signed one). */
function releaseOnEmulator(a, serial, env) {
  ensureNativeProject("android", env);
  step("Building the app for the screenshots' Android emulator (as Google Play gets it; 5 to 15 minutes the first time)");
  const androidDir = path.join(mobile, "android");
  freshJsBundle();
  run("./gradlew", ["app:assembleRelease", "--console=plain"], { cwd: androidDir, env, problem: buildProblem("android") });
  const apk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  let installed = spawnSync(a.adb, ["-s", serial, "install", "-r", apk], { env: a.env, encoding: "utf8" });
  if (installed.status !== 0 && /INCONSISTENT_CERTIFICATES|UPDATE_INCOMPATIBLE|signatures do not match/i.test(`${installed.stdout}${installed.stderr}`)) {
    read(a.adb, ["-s", serial, "uninstall", APP_ID], { env: a.env });
    installed = spawnSync(a.adb, ["-s", serial, "install", "-r", apk], { env: a.env, encoding: "utf8" });
  }
  if (installed.status !== 0) stop([`The app built but didn't install on the emulator:`, `${installed.stdout ?? ""}${installed.stderr ?? ""}`.trim().split("\n").slice(-3).join("\n"), "Run this again."]);
  ok("Installed on the emulator");
}

/** The status bar as the stores like it (9:41, full battery and signal, no notifications), on and off. */
function iosStatusBar(udid, env, on) {
  if (on) read("xcrun", ["simctl", "status_bar", udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "discharging", "--batteryLevel", "100"], { env });
  else read("xcrun", ["simctl", "status_bar", udid, "clear"], { env });
}

function androidStatusBar(a, serial, on) {
  const demo = (...args) => read(a.adb, ["-s", serial, "shell", "am", "broadcast", "-a", "com.android.systemui.demo", ...args], { env: a.env });
  if (!on) return void demo("-e", "command", "exit");
  read(a.adb, ["-s", serial, "shell", "settings", "put", "global", "sysui_demo_allowed", "1"], { env: a.env });
  demo("-e", "command", "enter");
  demo("-e", "command", "clock", "-e", "hhmm", "0941");
  demo("-e", "command", "battery", "-e", "level", "100", "-e", "plugged", "false");
  // Full Wi-Fi without the emulator's "no internet" mark, and no mobile network (Android 16 showed its type as 3G).
  demo("-e", "command", "network", "-e", "wifi", "show", "-e", "level", "4", "-e", "fully", "true", "-e", "mobile", "hide");
  demo("-e", "command", "notifications", "-e", "visible", "false");
}

/**
 * Google Play refuses a phone screenshot taller than twice its width (a Pixel's screen is 2.24:1), and its
 * recommendations take portrait screenshots of 9:16, at least 1080 × 1920: each is given white margins to exactly 9:16,
 * the classic phone shape, which keeps every pixel of the app (a Pixel 9's 1080 × 2424 becomes 1368 × 2432). Play also
 * refuses a screenshot with transparency, which Android's PNGs carry (even when nothing is see-through), so each becomes
 * a JPEG at its best quality.
 */
function padForPlay(dir) {
  for (const f of fs.readdirSync(dir).filter((n) => /^\d\d-.*\.png$/.test(n))) {
    const file = path.join(dir, f);
    const { height, width } = imageSize(file);
    // Whole pixels at exactly 9:16: the height up to a multiple of 16, the width 9/16 of it.
    const tall = Math.ceil(Math.max(height, (width * 16) / 9) / 16) * 16;
    const wide = (tall / 16) * 9;
    if (tall !== height || wide !== width) read("sips", ["--padToHeightWidth", String(tall), String(wide), "--padColor", "FFFFFF", file]);
    read("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "best", file, "--out", file.replace(/\.png$/, ".jpg")]);
    fs.rmSync(file);
  }
}

/**
 * The 6.9-inch iPhone set, for App Store Connect's slot for the large display when it asks for one besides the
 * required 6.3-inch set: the same pictures scaled to the large display's size of the same shape (1179 × 2556 → 1290 ×
 * 2796, 1206 × 2622 → 1320 × 2868), into `<dir>-6.9-inch`.
 */
function largeIphoneCopies(dir) {
  const large = `${dir}-6.9-inch`;
  fs.rmSync(large, { recursive: true, force: true });
  fs.mkdirSync(large, { recursive: true });
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".png"))) {
    const { width } = imageSize(path.join(dir, f));
    const [h, w] = width === 1179 ? [2796, 1290] : [2868, 1320];
    read("sips", ["-s", "format", "png", "-z", String(h), String(w), path.join(dir, f), "--out", path.join(large, f)]);
  }
  return large;
}

/**
 * The Play Console's icon (512 × 512, a 32-bit PNG: Google asks for one with an alpha channel, which the App Store's
 * must not have) and feature graphic (1024 × 500, a JPEG: Play refuses transparency in it): the app's icon, and the
 * official white logo on the logo's black (the logo carries the academy's name, so no name is written beside it:
 * CLAUDE.md "Brand and logos").
 */
async function storeImages(dir) {
  const icon = path.join(dir, "icon-512.png");
  read("sips", ["-z", "512", "512", path.join(mobile, "assets", "images", "icon.png"), "--out", icon]);
  const logo = fs.readFileSync(path.join(root, "web", "public", "brand", "skyarc-logo-white.svg"), "utf8").replace(/<svg /, '<svg style="height:250px;width:auto" ');
  const html = `<!doctype html><html><body style="margin:0;width:1024px;height:500px;background:#0A0A0A;display:flex;align-items:center;justify-content:center">${logo}</body></html>`;
  try {
    // Google Chrome, driven by playwright-core (the repository's packages), as scripts/brand-icons.ts and smoke.ts do.
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ channel: "chrome" });
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
      await page.setContent(html);
      await page.screenshot({ path: path.join(dir, "feature-graphic-1024x500.jpg"), type: "jpeg", quality: 100 });
      // The icon's own pixels, saved again from a canvas, whose PNGs keep an alpha channel (sips can't add one, and
      // Chrome's screenshots drop it from an opaque picture).
      const png = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
        canvas.getContext("2d").drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
      }, `data:image/png;base64,${fs.readFileSync(icon).toString("base64")}`);
      fs.writeFileSync(icon, Buffer.from(png.split(",")[1], "base64"));
    } finally {
      await browser.close();
    }
  } catch (e) {
    note(`The feature graphic wasn't made, and the icon has no alpha channel (both need Google Chrome on this Mac): ${String(e.message ?? e).split("\n")[0]}`);
  }
}

/**
 * `npm run publish:screenshots`: every image the App Store and Google Play ask for, from the practice copy (the sample
 * academy's made-up people, as the sample admin and the sample parent), into mobile/.publish/screenshots/ (ios/ at
 * the 6.3-inch iPhone size App Store Connect requires, and ios-6.9-inch/ the same at the large size in case it asks;
 * android/ with the Play Console's icon and feature graphic).
 * Screenshots taken on a real iPhone of that size (or an iPhone 15 or 16: 1179 × 2556) do as well. On a simulator and an emulator of
 * their own ("Sky Arc Screenshots"), with Release builds of the app, as the stores get it: no development menu over
 * the screens, and no development server. The practice copy is started (or shared with a window that has it) and
 * stopped after.
 */
async function screenshots() {
  const maestro = maestroRunner();
  const only = flags.has("--iphone") && !flags.has("--android") ? "ios" : flags.has("--android") && !flags.has("--iphone") ? "android" : null;
  const made = [];
  prepareApp();
  await startPracticeCopy();
  const signIn = { EMAIL: SCREENS_OFFICE, PASSWORD: practicePassword() };

  if (only !== "android") await iosScreenshots(maestro, signIn, made);
  if (only !== "ios") await androidScreenshots(maestro, signIn, made);

  console.log(`\n✓ The stores' images are in ${path.relative(root, SCREENS_DIR)}/:`);
  for (const m of made) console.log(`  • ${m}`);
  for (const screen of SCREENS) console.log(`  ${screen.file}.png: ${screen.what}`);
  console.log("  Look at each before uploading: the sample data's made-up names only, no real student. docs/publishing/apple/app-store.md and docs/publishing/google-play/production.md say where each goes.\n");
  await stopAll();
  process.exit(0);
}

async function iosScreenshots(maestro, signIn, made) {
  const xenv = xcode();
  const env = { ...xenv, ...appSettings("practice") };
  ensureCocoaPods();
  ensureIosRuntime(env);
  const sim = iosSimulator("screenshots", env);
  await releaseOnSimulator(sim.id, env);
  const dir = path.join(SCREENS_DIR, "ios");
  fs.rmSync(dir, { recursive: true, force: true });
  await shoot(maestro, signIn, {
    label: "the iPhone Simulator",
    testId: sim.id,
    // Signed out: Firebase keeps the sign-in in the keychain, which outlives the app.
    reset: () => {
      read("xcrun", ["simctl", "terminate", sim.id, APP_ID], { env });
      read("xcrun", ["simctl", "keychain", sim.id, "reset"], { env });
    },
    snap: (file) => read("xcrun", ["simctl", "io", sim.id, "screenshot", "--type=png", file], { env }),
    statusBar: (on) => iosStatusBar(sim.id, env, on),
  }, dir);
  const large = largeIphoneCopies(dir);
  made.push(`${path.relative(root, dir)}/: App Store Connect → the version's iPhone screenshots, the 6.3-inch display, "iPhone with Dynamic Island (medium display)" (drag all eight in, in order)`);
  made.push(`${path.relative(root, large)}/: the same, for the 6.9-inch display, only if App Store Connect asks for that size too`);
}

async function androidScreenshots(maestro, signIn, made) {
  const a = androidTools();
  ensureAndroidEmulator(a, "screenshots");
  const env = { ...a.env, ...appSettings("practice") };
  const emulator = await androidEmulator(a, "screenshots");
  releaseOnEmulator(a, emulator.testId, env);
  const dir = path.join(SCREENS_DIR, "android");
  fs.rmSync(dir, { recursive: true, force: true });
  await shoot(maestro, signIn, {
    label: "the Android emulator",
    testId: emulator.testId,
    // The app's data wiped (signed out), and notifications allowed, so Android's question isn't in a picture.
    reset: () => {
      read(a.adb, ["-s", emulator.testId, "shell", "pm", "clear", APP_ID], { env: a.env });
      read(a.adb, ["-s", emulator.testId, "shell", "pm", "grant", APP_ID, "android.permission.POST_NOTIFICATIONS"], { env: a.env });
    },
    snap: (file) => {
      const r = spawnSync(a.adb, ["-s", emulator.testId, "exec-out", "screencap", "-p"], { env: a.env, maxBuffer: 64 * 1024 * 1024 });
      if (r.status === 0) fs.writeFileSync(file, r.stdout);
    },
    statusBar: (on) => androidStatusBar(a, emulator.testId, on),
  }, dir);
  padForPlay(dir);
  await storeImages(dir);
  made.push(`${path.relative(root, dir)}/: Play Console → Store listing → phone screenshots (the eight, in order), the app icon (icon-512.png) and the feature graphic (feature-graphic-1024x500.jpg)`);
}

function help() {
  const header = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0];
  console.log(header.replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
}

try {
  if (process.platform !== "darwin") stop("The phone app's commands run on a Mac.");
  checkNode();
  if (platform === "ios") await (onSim ? iphoneSim() : iphone());
  else if (platform === "android") await (onSim ? androidSim() : androidPhone());
  else if (command === "setup") await setup();
  else if (command === "test") await test();
  else if (command === "prepare") await prepare();
  else if (command === "screenshots") await screenshots();
  else help();
} catch (e) {
  if (e instanceof Interrupted) {
    await stopAll();
    process.exit(130);
  }
  if (!(e instanceof Stop)) throw e;
  console.error(`\n✗ ${e.message}\n`);
  await stopAll();
  process.exit(1);
}
