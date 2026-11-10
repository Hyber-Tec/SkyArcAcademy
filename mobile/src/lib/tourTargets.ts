import { createContext, type RefObject, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";

/**
 * What the welcome tour can point at (the fourth meeting's B1, in detail): any part of a screen with a test ID, once
 * its component registers it here (Card, ListRow, Button and the other shared parts do), with what tapping it does. The
 * tour finds a part by its ID ("family-ask"), or the first of a list by its ID's start ("family-next-*"), draws its
 * spotlight around it, and its "Tap here" does what the part itself does.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A page (components/Screen.tsx): its scrolling, so the tour can bring what it points at into view, and whether it's
 * the one in front (the tab bar keeps the other tabs' pages, with the same parts, behind it).
 */
export interface PageScroll {
  scrollTo(y: number): void;
  offset(): number;
  focused(): boolean;
}

export const PageScrollContext = createContext<PageScroll | null>(null);

/**
 * A page's side of it: put `scrollRef` and `onScroll` on its ScrollView (with `scrollEventThrottle`), and `page` in a
 * PageScrollContext around it. `focused`: whether the page is in front (expo-router's useIsFocused).
 */
export function usePageScroll(focused: boolean) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const inFront = useRef(focused);
  useEffect(() => {
    inFront.current = focused;
  }, [focused]);
  const page = useMemo<PageScroll>(
    () => ({ scrollTo: (y) => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true }), offset: () => offset.current, focused: () => inFront.current }),
    [],
  );
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
  return { scrollRef, onScroll, page };
}

/** What can be measured on screen: a View, a Pressable, a ScrollView. */
type Measurable = Pick<View, "measureInWindow">;

interface Target {
  ref: RefObject<Measurable | null>;
  press: RefObject<(() => void) | undefined>;
  scroll: PageScroll | null;
}

const targets = new Map<string, Target[]>();

/**
 * Registers a part of a screen under its test ID while it's on screen, with what tapping it does (`press`). Returns the
 * ref to put on the part's outer view. Nothing happens without an ID.
 */
export function useTourTarget<V extends Measurable = View>(id: string | undefined, press?: () => void): RefObject<V | null> {
  const ref = useRef<V | null>(null);
  const scroll = useContext(PageScrollContext);
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    if (!id) return;
    const t: Target = { ref, press: pressRef, scroll };
    targets.set(id, [...(targets.get(id) ?? []), t]);
    return () => {
      const left = (targets.get(id) ?? []).filter((x) => x !== t);
      if (left.length) targets.set(id, left);
      else targets.delete(id);
    };
  }, [id, scroll]);
  return ref;
}

function measure(t: Target): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = t.ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

export interface Found {
  rect: Rect;
  /** What tapping it does, when it does something. */
  press: (() => void) | null;
  scroll: PageScroll | null;
  remeasure: () => Promise<Rect | null>;
}

/**
 * The part with this ID on screen, measured: the newest when several have it (a page opened over a tab); with "*" at
 * the end, the topmost of those whose ID starts so (a list's first), the larger of two at the same height (a group of
 * tiles over its first tile).
 */
export async function findTarget(id: string): Promise<Found | null> {
  const prefix = id.endsWith("*") ? id.slice(0, -1) : null;
  const all = prefix ? [...targets].filter(([k]) => k.startsWith(prefix)).flatMap(([, v]) => v) : (targets.get(id) ?? []);
  // Only what's on the page in front.
  const list = all.filter((t) => !t.scroll || t.scroll.focused());
  let best: { t: Target; rect: Rect } | null = null;
  for (const t of list) {
    const rect = await measure(t);
    if (!rect) continue;
    const higher = best && (rect.y < best.rect.y - 1 || (Math.abs(rect.y - best.rect.y) <= 1 && rect.width * rect.height > best.rect.width * best.rect.height));
    if (!best || !prefix || higher) best = { t, rect };
  }
  if (!best) return null;
  const { t, rect } = best;
  return { rect, press: t.press.current ? () => t.press.current?.() : null, scroll: t.scroll, remeasure: () => measure(t) };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for a part to be on screen (a page still opening, a list still loading), up to `ms`. */
export async function waitForTarget(id: string, ms: number, alive: () => boolean = () => true): Promise<Found | null> {
  const until = Date.now() + ms;
  while (alive()) {
    const found = await findTarget(id);
    if (found || Date.now() > until) return found;
    await wait(120);
  }
  return null;
}

/**
 * Scrolls the page so the part sits in its upper part, with room below it for the tour's card; returns where it is
 * then. `top`: the first point under the status bar; `height`: the screen's.
 */
export async function bringIntoView(found: Found, top: number, height: number): Promise<Rect> {
  const { rect, scroll } = found;
  const tall = Math.min(rect.height, height * 0.3);
  const fits = rect.y >= top + 8 && rect.y + tall <= height * 0.55;
  if (!scroll || fits) return rect;
  scroll.scrollTo(scroll.offset() + rect.y - Math.max(top + 24, height * 0.2));
  await wait(450);
  return (await found.remeasure()) ?? rect;
}
