import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia, type SkImage } from "@shopify/react-native-skia";
import { CARD_EDGES_MM } from "@shared/targets/card";
import { type Mat3, invert3, multiply3 } from "@shared/targets/geometry";
import { type CardScan, scanCard } from "@shared/targets/scan";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * A photo of a paper card, read: turned upright and brought to reading size (the phone's native image code), its
 * pixels decoded (Skia), and the card found and scored in it (shared/src/targets, the same code the tests run). The
 * Drive gets the card itself, flattened and cropped like a scan, rather than the photo around it.
 */

/** The long side photos are read at: a card filling the frame then has about six pixels per millimetre. */
const READ_SIDE = 2000;

export interface ReadPhoto {
  /** The photo upright at reading size, a JPEG in the app's cache. */
  uri: string;
  width: number;
  height: number;
  image: SkImage;
  /** What the scan found; `scan.ok` false says why nothing was. */
  scan: CardScan;
}

/** Lets the screen show its spinner before the phone gets busy. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

/** Reads a photo from the camera or the library. `shotsPerBull` as the scan takes it ('auto' counts them). */
export async function readPhoto(source: string, shotsPerBull: number | "auto" = "auto"): Promise<ReadPhoto> {
  const original = await ImageManipulator.manipulate(source).renderAsync();
  const k = Math.min(1, READ_SIDE / Math.max(original.width, original.height));
  const sized =
    k < 1
      ? await ImageManipulator.manipulate(original)
          .resize(original.width >= original.height ? { width: Math.round(original.width * k) } : { height: Math.round(original.height * k) })
          .renderAsync()
      : original;
  const saved = await sized.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(saved.uri));
  if (!image) throw new Error("The photo couldn’t be opened. Try another one.");
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(pixels instanceof Uint8Array)) throw new Error("The photo couldn’t be read. Try another one.");
  await nextFrame();
  const scan = scanCard({ width, height, data: pixels }, { shotsPerBull });
  return { uri: saved.uri, width, height, image, scan };
}

/** The flattened card: a little paper beyond each edge, at six pixels per millimetre (about 1340 × 1720). */
export const FLAT = { marginMm: 4, pxPerMm: 6 } as const;
const FLAT_LEFT = CARD_EDGES_MM.left - FLAT.marginMm;
const FLAT_TOP = CARD_EDGES_MM.top - FLAT.marginMm;

export interface FlatCard {
  image: SkImage;
  width: number;
  height: number;
}

/** Where a point of the card (millimetres from the top-left bull, x right, y down) is on the flattened card. */
export function flatPoint(xMm: number, yMm: number): { x: number; y: number } {
  return { x: (xMm - FLAT_LEFT) * FLAT.pxPerMm, y: (yMm - FLAT_TOP) * FLAT.pxPerMm };
}

/** The card flattened and cropped as a scanner would give it, through the scan's perspective; null without a card. */
export function flattenCard(read: ReadPhoto): FlatCard | null {
  const H = read.scan.cardToImage;
  const toCard = H ? invert3(H) : null;
  if (!toCard) return null;
  const width = Math.round((CARD_EDGES_MM.right - CARD_EDGES_MM.left + 2 * FLAT.marginMm) * FLAT.pxPerMm);
  const height = Math.round((CARD_EDGES_MM.bottom - CARD_EDGES_MM.top + 2 * FLAT.marginMm) * FLAT.pxPerMm);
  // Photo pixels → card millimetres → the flat card's pixels.
  const k = FLAT.pxPerMm;
  const toFlat: Mat3 = [k, 0, -FLAT_LEFT * k, 0, k, -FLAT_TOP * k, 0, 0, 1];
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color("white"));
  canvas.concat(Skia.Matrix([...multiply3(toFlat, toCard)]));
  const all = Skia.XYWHRect(0, 0, read.width, read.height);
  canvas.drawImageRectOptions(read.image, all, all, FilterMode.Linear, MipmapMode.Linear);
  surface.flush();
  return { image: surface.makeImageSnapshot(), width, height };
}

export interface CardFile {
  uri: string;
  size: number;
}

/** The Drive's copy as a JPEG in the app's cache: the flattened card, or the photo itself when no card was found. */
export function cardFile(read: ReadPhoto, flat: FlatCard | null): CardFile {
  const bytes = (flat?.image ?? read.image).encodeToBytes(ImageFormat.JPEG, 88);
  if (!bytes.length) throw new Error("The phone couldn’t make the card’s copy.");
  const dir = new Directory(Paths.cache, "scans");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `card-${Date.now()}.jpg`);
  file.write(bytes);
  return { uri: file.uri, size: bytes.length };
}
