import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { env } from "./env";
import { toast } from "./toast";

/** Opens a page of the website (`/admin/schedule`, the privacy policy) in the phone's in-app browser. */
export async function openWebsite(path: string): Promise<void> {
  const url = `${env.webUrl}${path.startsWith("/") ? path : `/${path}`}`;
  await openUrl(url);
}

export async function openUrl(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: "#0A0A0A" });
  } catch {
    toast.error("Couldn’t open the page", { description: url });
  }
}

/** An address in the phone's maps app (Apple Maps on an iPhone, the map app on Android). */
export async function openMap(address: string): Promise<void> {
  const q = encodeURIComponent(address.trim());
  try {
    await Linking.openURL(Platform.OS === "ios" ? `https://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`);
  } catch {
    toast.error("Couldn’t open the map", { description: address });
  }
}

/** A website as the academy typed it ("skyarcacademy.com"), as a link. */
export const webLink = (site: string) => (/^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`);

/** A phone number, digits and a leading + only, for tel: and sms: links. */
const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

/** Calls, texts or emails someone through the phone's own apps. */
export async function contact(kind: "call" | "text" | "email", value: string): Promise<void> {
  const url = kind === "email" ? `mailto:${value.trim()}` : `${kind === "call" ? "tel" : "sms"}:${dialable(value)}`;
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(kind === "email" ? "No mail app to write with" : kind === "call" ? "This phone can’t make calls" : "This phone can’t send texts", { description: value });
  }
}
