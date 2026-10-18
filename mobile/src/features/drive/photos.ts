import { classifyFile, extOf, isViewableImage, kindOfMime, withExtension } from "@shared/drive/files";
import { nowMinutes, todayKey } from "@shared/time";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { PhoneFile } from "./api";

/**
 * Photos from the phone's library for the Drive. Each is kept as the photo itself when a browser can show it (JPEG, PNG,
 * WebP, GIF), so the website shows it as it is; anything else (an iPhone's HEIC, say) is saved as a JPEG first. The
 * phone asks for no permission: the system's picker hands over only the photos chosen.
 */

/** Photos chosen at once. */
export const PHOTOS_AT_ONCE = 30;

/** Opens the phone's photos to choose some; null when nothing was chosen. */
export async function choosePhotos(): Promise<ImagePicker.ImagePickerAsset[] | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: PHOTOS_AT_ONCE,
    orderedSelection: true,
    quality: 1,
    exif: false,
    // An iPhone hands over its HEIC photos as JPEGs (what every browser shows) rather than as they're stored.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  return picked.canceled || !picked.assets.length ? null : picked.assets;
}

/** "Photo 2026-10-18 14.05": the name of a photo that came without one, by the academy's date and time. */
export function photoStem(timezone: string, now = Date.now()): string {
  const min = nowMinutes(timezone, now);
  return `Photo ${todayKey(timezone, now)} ${String(Math.floor(min / 60)).padStart(2, "0")}.${String(min % 60).padStart(2, "0")}`;
}

/** What a picked photo is: its type as the picker says it (Android may name a HEIC file .jpeg), else its extension. */
function kindOf(asset: ImagePicker.ImagePickerAsset): string {
  const ext = extOf(asset.uri.split("?")[0] ?? "");
  return kindOfMime(asset.mimeType) ?? (ext === "jpeg" ? "jpg" : ext);
}

/**
 * Makes each chosen photo a file the Drive takes, with the name it gets there (its own, else `stem`, numbered when
 * several have none); refuses with a reason the ones it can't (too big, unreadable).
 */
export async function preparePhotos(assets: ImagePicker.ImagePickerAsset[], stem: string): Promise<{ ready: PhoneFile[]; refused: { name: string; reason: string }[] }> {
  const ready: PhoneFile[] = [];
  const refused: { name: string; reason: string }[] = [];
  const unnamed = assets.filter((a) => !a.fileName).length;
  let n = 0;
  for (const asset of assets) {
    const fallback = asset.fileName ? stem : unnamed > 1 ? `${stem} (${++n})` : stem;
    try {
      let uri = asset.uri;
      let kind = kindOf(asset);
      if (!isViewableImage(kind)) {
        const image = await ImageManipulator.manipulate(uri).renderAsync();
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
        uri = saved.uri;
        kind = "jpg";
      }
      const name = withExtension(asset.fileName, kind, fallback);
      const size = new File(uri).size;
      const plan = classifyFile({ name, size });
      if (plan.ok) ready.push({ uri, name: plan.name, size, kind: plan.kind, mime: plan.mime });
      else refused.push({ name: plan.name, reason: plan.reason });
    } catch {
      refused.push({ name: asset.fileName || fallback, reason: "The phone couldn’t read this photo." });
    }
  }
  return { ready, refused };
}
