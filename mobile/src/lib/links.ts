import type { Lang } from "@shared/i18n";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { env } from "./env";
import { toast } from "./toast";

/** Opens a page of the website (`/admin/schedule`, the privacy policy) in the phone's in-app browser. */
export async function openWebsite(path: string, lang: Lang = "en"): Promise<void> {
  const url = `${env.webUrl}${path.startsWith("/") ? path : `/${path}`}`;
  await openUrl(url, lang);
}

export async function openUrl(url: string, lang: Lang = "en"): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: "#0A0A0A" });
  } catch {
    toast.error(lang === "ko" ? "페이지를 열지 못했어요" : "Couldn’t open the page", { description: url });
  }
}

/** An address in the phone's maps app (Apple Maps on an iPhone, the map app on Android). */
export async function openMap(address: string, lang: Lang = "en"): Promise<void> {
  const q = encodeURIComponent(address.trim());
  try {
    await Linking.openURL(Platform.OS === "ios" ? `https://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`);
  } catch {
    toast.error(lang === "ko" ? "지도를 열지 못했어요" : "Couldn’t open the map", { description: address });
  }
}

/**
 * A link the website saved, as this phone reaches it. On the practice copy the website's links to its files point at the
 * Mac (`http://127.0.0.1:9199/…`, the Storage emulator), which the Android emulator reaches as 10.0.2.2 (React Native
 * Firebase does the same for its own requests) and a phone at the emulators' host; other links stay as they are.
 */
export function reachable(url: string): string {
  if (!env.useEmulators) return url;
  const host = Platform.OS === "android" && env.emulatorHost === "127.0.0.1" ? "10.0.2.2" : env.emulatorHost;
  return url.replace(/^http:\/\/(?:127\.0\.0\.1|localhost)(?=[:/]|$)/i, `http://${host}`);
}

/** A website as the academy typed it ("skyarcacademy.com"), as a link. */
export const webLink = (site: string) => (/^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`);

/** A phone number, digits and a leading + only, for tel: and sms: links. */
const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

/** Calls, texts or emails someone through the phone's own apps. */
export async function contact(kind: "call" | "text" | "email", value: string, lang: Lang = "en"): Promise<void> {
  const url = kind === "email" ? `mailto:${value.trim()}` : `${kind === "call" ? "tel" : "sms"}:${dialable(value)}`;
  try {
    await Linking.openURL(url);
  } catch {
    const problem =
      lang === "ko"
        ? kind === "email"
          ? "메일을 보낼 앱이 없어요"
          : kind === "call"
            ? "이 기기로는 전화를 걸 수 없어요"
            : "이 기기로는 문자를 보낼 수 없어요"
        : kind === "email"
          ? "No mail app to write with"
          : kind === "call"
            ? "This phone can’t make calls"
            : "This phone can’t send texts";
    toast.error(problem, { description: value });
  }
}
