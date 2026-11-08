// Copies the academy's official logo files (web/public/brand, CLAUDE.md "Brand and logos") into src/brand.ts as they
// are, so the app draws them with react-native-svg. Run again when the files change: npm run brand.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "..", "..", "web", "public", "brand");
const read = (f) => readFileSync(join(brand, f), "utf8").trim();
const out = `// Made by scripts/brand.mjs from web/public/brand: the official files, unchanged. Don't edit by hand.

/** The full logo, black with the red dot, on transparent (skyarc-logo.svg, 1128 × 541). */
export const LOGO_BLACK = ${JSON.stringify(read("skyarc-logo.svg"))};

/** The full logo in white with the red dot (skyarc-logo-white.svg). */
export const LOGO_WHITE = ${JSON.stringify(read("skyarc-logo-white.svg"))};

/** The full logo's width over its height. */
export const LOGO_RATIO = 1128 / 541;
`;
writeFileSync(join(here, "..", "src", "brand.ts"), out);
console.log("src/brand.ts written");
