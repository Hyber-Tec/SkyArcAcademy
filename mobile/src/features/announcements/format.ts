import type { Announcement, AnnouncementAttachment } from "@shared/comms";
import { DRIVE_TYPES, type FileCategory, categoryOf, extOf } from "@shared/drive/files";
import { type DateKey, addDays, dateKeyOf, formatDateKey, minutesOf, parseDateKey } from "@shared/time";
import { clock, shortDay } from "@/features/schedule/format";
import { htmlImages, htmlText } from "./html";

/** How the app words a post (the academy's announcements): when it went up, in the academy's zone, and what it holds. */

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** The day a post went up in the academy's zone, or null while the server hasn't stamped it. */
const postedKey = (a: Pick<Announcement, "createdAt">, timezone: string): { key: DateKey; ms: number } | null => {
  const ms = millis(a.createdAt);
  return ms === null ? null : { key: dateKeyOf(ms, timezone), ms };
};

function dayWords(key: DateKey, today: DateKey, near: (key: DateKey) => string): string {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseDateKey(key).year === parseDateKey(today).year ? near(key) : formatDateKey(key, "medium");
}

/** When a post went up, in a list: "Today", "Yesterday", "Mon, Oct 12", or "Oct 12, 2025" in another year (as the website). */
export function postedDay(a: Pick<Announcement, "createdAt">, timezone: string, today: DateKey): string {
  const p = postedKey(a, timezone);
  return p ? dayWords(p.key, today, shortDay) : "Just now";
}

/** When a post went up, on the post: "Today at 4:05 PM", "Fri, Oct 16 at 10:00 AM", "Oct 16, 2025 at 10:00 AM". */
export function postedAt(a: Pick<Announcement, "createdAt">, timezone: string, today: DateKey, hour12: boolean): string {
  const p = postedKey(a, timezone);
  return p ? `${dayWords(p.key, today, shortDay)} at ${clock(minutesOf(p.ms, timezone), hour12)}` : "Just now";
}

/** The month a post went up in ("2026-10"), for a list grouped by month; "" while the server hasn't stamped it. */
export function postedMonth(a: Pick<Announcement, "createdAt">, timezone: string): string {
  return postedKey(a, timezone)?.key.slice(0, 7) ?? "";
}

/** A line or two of a post for a list (its text; none for a post of pictures or files only). */
export function newsPreview(a: Pick<Announcement, "contentText" | "contentHtml">): string | null {
  return htmlText(a.contentHtml) || (a.contentText ?? "").trim() || null;
}

/** An attachment shown as a picture (anything else is a file to open), as the website sorts them. */
export const isPicture = (f: Pick<AnnouncementAttachment, "contentType">) => (f.contentType ?? "").toLowerCase().startsWith("image/");

/** What a post holds besides its text, for a list: its pictures (in the text and attached) and its other files. */
export function postHolds(a: Pick<Announcement, "contentHtml" | "attachments">): { pictures: string | null; files: string | null } {
  const pictures = htmlImages(a.contentHtml).length + (a.attachments ?? []).filter(isPicture).length;
  const files = (a.attachments ?? []).filter((f) => !isPicture(f)).length;
  return {
    pictures: pictures ? (pictures === 1 ? "Picture" : `${pictures} pictures`) : null,
    files: files ? (files === 1 ? "1 file" : `${files} files`) : null,
  };
}

/** An attachment's file type as an extension ("pdf"): from its name, or else from its content type. */
export function attachmentKind(f: Pick<AnnouncementAttachment, "name" | "contentType">): string {
  const ext = extOf(f.name ?? "");
  if (ext) return ext;
  const type = (f.contentType ?? "").toLowerCase();
  return Object.keys(DRIVE_TYPES).find((k) => DRIVE_TYPES[k] === type) ?? "";
}

/** Which kind of file an attachment is (a picture, a PDF, a document…), as the Drive sorts them. */
export function attachmentCategory(f: Pick<AnnouncementAttachment, "name" | "contentType">): FileCategory {
  const type = (f.contentType ?? "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  return categoryOf(attachmentKind(f));
}
