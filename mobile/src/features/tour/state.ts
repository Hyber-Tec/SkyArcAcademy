import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Role } from "@shared/roles";
import { useSyncExternalStore } from "react";

/**
 * The welcome tour (the fourth meeting's B1): which one a person gets, whether they've had it, and the signals between
 * the tour, More's "Take the tour" and the notifications question (state/PushProvider.tsx), which waits for it.
 */

/** One tour per kind of person: the family's two and the staff's two see different tabs. */
export type TourKind = "parent" | "student" | "coach" | "office";

export function tourKindOf(role: Role): TourKind {
  if (role === "parent" || role === "student" || role === "coach") return role;
  return "office";
}

/** Raised when the tour changes enough to show everyone again, once. */
const VERSION = 1;
const seenKey = (uid: string, kind: TourKind) => `skyarc.tour.v${VERSION}.${kind}.${uid}`;

/** Whether this account has finished or skipped its tour on this phone (kept on the phone, per account and kind). */
export async function tourSeen(uid: string, kind: TourKind): Promise<boolean> {
  return !!(await AsyncStorage.getItem(seenKey(uid, kind)).catch(() => "unknown"));
}

export async function markTourSeen(uid: string, kind: TourKind): Promise<void> {
  await AsyncStorage.setItem(seenKey(uid, kind), new Date().toISOString()).catch(() => undefined);
}

interface TourSignals {
  /** The tour is on screen. */
  showing: boolean;
  /** Bumped by More's "Take the tour". */
  replays: number;
}

let signals: TourSignals = { showing: false, replays: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let finishedWaiters: (() => void)[] = [];

export const tourSignals = {
  get: () => signals,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** More's "Take the tour". */
  replay(): void {
    signals = { ...signals, replays: signals.replays + 1 };
    emit();
  },
  setShowing(showing: boolean): void {
    if (signals.showing === showing) return;
    signals = { ...signals, showing };
    emit();
    if (!showing) {
      const waiting = finishedWaiters;
      finishedWaiters = [];
      waiting.forEach((resolve) => resolve());
    }
  },
};

export function useTourSignals(): TourSignals {
  return useSyncExternalStore(tourSignals.subscribe, tourSignals.get, tourSignals.get);
}

/**
 * Resolves once the person's first tour is behind them: at once when they've had it, else when it closes. The
 * notifications question waits for it, so a first sign-in gets the tour first, then the question.
 */
export async function tourBehind(uid: string, kind: TourKind): Promise<void> {
  if (!signals.showing && (await tourSeen(uid, kind))) return;
  await new Promise<void>((resolve) => finishedWaiters.push(resolve));
}
