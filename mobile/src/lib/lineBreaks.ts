import type { ReactNode } from "react";
import { Platform, type TextProps } from "react-native";

/**
 * Where a line of text may wrap (Goo, 2026-11-05: "when a sentence goes on to the next line, it isn't pretty"): dates
 * and times hold together ("5:00 –\n6:00 PM"), and so does "Sky Arc"; a list of facts breaks after its "·", not before,
 * and a paragraph doesn't end on one short word. They're no-break spaces, and a word joiner (U+2060, which draws nothing
 * and screen readers skip) after a range's dash. The iPhone also evens out a paragraph's last line as its own labels do
 * (`lineBreakStrategyIOS: "standard"`); Android's "balanced" breaks even out its lines, unless the text is cut to a
 * number of lines (that would cut it shorter).
 */
export function lineBreakProps(numberOfLines?: number): Pick<TextProps, "lineBreakStrategyIOS" | "textBreakStrategy"> {
  return Platform.OS === "android" ? { textBreakStrategy: numberOfLines ? "highQuality" : "balanced" } : { lineBreakStrategyIOS: "standard" };
}

const JOINER = "\u2060";
const NBSP = "\u00a0";
/** A narrow no-break space: what the phone's own date ranges have around their dash, made unbreakable. */
const NNBSP = "\u202f";

/** The spaces that become no-break spaces: in dates and times, and before a "·" (it ends the line, not starts it). */
const HOLD: [RegExp, string][] = [
  [/\bSky Arc\b/g, `Sky${NBSP}Arc`],
  [/ – /g, `${NBSP}–${NBSP}`],
  [/\u2009–\u2009/g, `${NNBSP}–${NNBSP}`],
  [/(\d) (?=[AP]M\b)/g, `$1${NBSP}`],
  [/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*) (?=\d)/g, `$1${NBSP}`],
  [/ · /g, `${NBSP}· `],
];

/**
 * A text of three words or more doesn't end on one short word alone on its line: the last two go together, or the last
 * three when all three are short ("View or save").
 */
function noLoneLastWord(text: string): string {
  const words = text.split(" ");
  const n = words.length;
  const size = (w: string) => (w.includes("\n") ? Infinity : Array.from(w).length);
  if (n < 3 || size(words[n - 1]) > 7) return text;
  const tail = n >= 4 && words.slice(n - 3).every((w) => size(w) <= 4) ? 3 : 2;
  return `${words.slice(0, n - tail).join(" ")} ${words.slice(n - tail).join(NBSP)}`;
}

/**
 * `text` as it should wrap: the rules above. `join: false` leaves out the word joiners, for text people can select and
 * copy (they'd come along, invisible).
 */
export function keepWords(text: string, join = true): string {
  let out = text;
  for (const [find, put] of HOLD) out = out.replace(find, put);
  // A line may still break after a dash, even before a no-break space: a word joiner after it holds a range together.
  if (join) out = out.replace(/–(?=[\u00a0\u202f\d])/g, `–${JOINER}`);
  return noLoneLastWord(out);
}

/** A text's children with `keepWords` on its strings (texts nested in it do their own). */
export function keepWordsIn(children: ReactNode, join = true): ReactNode {
  if (typeof children === "string") return keepWords(children, join);
  if (Array.isArray(children)) return children.map((c) => (typeof c === "string" ? keepWords(c, join) : c));
  return children;
}
