import { getApp } from "@react-native-firebase/app";
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from "@react-native-firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "@react-native-firebase/functions";
import { connectStorageEmulator, getStorage } from "@react-native-firebase/storage";
import { env } from "./env";

/**
 * The Firebase project (skyarcacademy), through the native SDKs (configured by the Google services files, see
 * app.config.ts). Firestore keeps its data on the phone, so the app opens straight from it and works offline for what
 * was seen before; against the emulators (the practice copy, project demo-skyarc) it does not, so the practice copy's
 * data never mixes with the real project's.
 */
export const app = getApp();
export const auth = getAuth(app);
export const db = env.useEmulators ? initializeFirestore(app, { persistence: false }) : getFirestore(app);
export const functions = getFunctions(app, env.region);
/** The Drive's files (results, target photos): read and written through the Storage rules, never by public links. */
export const storage = getStorage(app);

if (env.useEmulators) {
  const host = env.emulatorHost;
  connectAuthEmulator(auth, `http://${host}:${env.emulatorPorts.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, env.emulatorPorts.firestore);
  connectFunctionsEmulator(functions, host, env.emulatorPorts.functions);
  connectStorageEmulator(storage, host, env.emulatorPorts.storage);
}
